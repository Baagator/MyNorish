// @vitest-environment node
/**
 * What the picker's choice becomes on the server. The repository is mocked;
 * what is pinned here is which repository call each kind of choice turns into,
 * and that a by-hand price typed over one the shopper made earlier corrects
 * that product rather than adding a second.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storeProductProcedures } from "../../src/routers/stores/products";
import {
  createMockAuthedContext,
  createMockCallerContext,
  createMockHousehold,
  createMockUser,
} from "../calendar/test-utils";
import { assertHouseholdAccess } from "../mocks/permissions";

const storeProductsRepository = vi.hoisted(() => ({
  createManualProduct: vi.fn(),
  getStoreProductById: vi.fn(),
  listStoreProducts: vi.fn(),
  resolveProductLink: vi.fn(),
  updateManualProduct: vi.fn(),
  upsertProductLink: vi.fn(),
  upsertReadProduct: vi.fn(),
}));

const storesRepository = vi.hoisted(() => ({
  getStoreById: vi.fn(),
  getStoreOwnerId: vi.fn(),
}));

const storeEmitter = vi.hoisted(() => ({ emitToHousehold: vi.fn() }));

vi.mock("@norish/db/repositories/store-products", () => storeProductsRepository);
vi.mock("@norish/db/repositories/stores", () => storesRepository);
vi.mock("@norish/auth/permissions", () => import("../mocks/permissions"));
vi.mock("@norish/trpc/routers/stores/emitter", () => ({ storeEmitter }));
vi.mock("@norish/trpc/routers/stores/pricing", () => ({ priceTheList: vi.fn(async () => []) }));
vi.mock("@norish/queue/store-lookup/lookup", () => ({
  searchStore: vi.fn(async () => ({ candidates: [], answered: true })),
}));
vi.mock("@norish/shared-server/logger", () => ({
  trpcLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const STORE = "11111111-1111-4111-8111-111111111111";
const MANUAL_ID = "22222222-2222-4222-8222-222222222222";

describe("chooseProduct", () => {
  const ctx = createMockAuthedContext(createMockUser(), createMockHousehold());
  const caller = storeProductProcedures.createCaller(createMockCallerContext(ctx));
  const manualChoice = {
    kind: "manual" as const,
    id: MANUAL_ID,
    name: "Oude kaas",
    price: 6.5,
    currency: "EUR",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storesRepository.getStoreOwnerId.mockResolvedValue(ctx.user.id);
    assertHouseholdAccess.mockResolvedValue(undefined);
    storeProductsRepository.resolveProductLink.mockResolvedValue(null);
  });

  it("creates a by-hand product for a price nobody typed before", async () => {
    storeProductsRepository.getStoreProductById.mockResolvedValue(null);
    storeProductsRepository.createManualProduct.mockResolvedValue({
      id: MANUAL_ID,
      storeId: STORE,
      isManual: true,
    });

    await caller.chooseProduct({ storeId: STORE, name: "oude kaas", choice: manualChoice });

    expect(storeProductsRepository.createManualProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: MANUAL_ID, storeId: STORE, name: "Oude kaas", price: 6.5 })
    );
    expect(storeProductsRepository.updateManualProduct).not.toHaveBeenCalled();
    expect(storeProductsRepository.upsertProductLink).toHaveBeenCalledWith(
      STORE,
      "oude kaas",
      MANUAL_ID
    );
  });

  it("corrects the by-hand product the shopper made earlier instead of adding another", async () => {
    // The field hands back the id of the by-hand product it is showing, so a
    // second price for the same name is the same product corrected. Without
    // this a Store's shelf filled with every price a shopper ever typed, and
    // two identical names made the unmistakable rule refuse both.
    storeProductsRepository.getStoreProductById.mockResolvedValue({
      id: MANUAL_ID,
      storeId: STORE,
      isManual: true,
    });
    storeProductsRepository.updateManualProduct.mockResolvedValue({
      id: MANUAL_ID,
      storeId: STORE,
      isManual: true,
      price: 6.5,
    });

    await caller.chooseProduct({ storeId: STORE, name: "oude kaas", choice: manualChoice });

    expect(storeProductsRepository.updateManualProduct).toHaveBeenCalledWith({
      id: MANUAL_ID,
      name: "Oude kaas",
      price: 6.5,
      currency: "EUR",
      size: null,
    });
    expect(storeProductsRepository.createManualProduct).not.toHaveBeenCalled();
    expect(storeEmitter.emitToHousehold).toHaveBeenCalledWith(
      ctx.householdKey,
      "productUpdated",
      expect.objectContaining({ product: expect.objectContaining({ id: MANUAL_ID }) })
    );
  });

  it("refuses to turn a product read from a page into a by-hand one", async () => {
    storeProductsRepository.getStoreProductById.mockResolvedValue({
      id: MANUAL_ID,
      storeId: STORE,
      isManual: false,
    });
    storeProductsRepository.updateManualProduct.mockResolvedValue(null);

    await expect(
      caller.chooseProduct({ storeId: STORE, name: "oude kaas", choice: manualChoice })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(storeProductsRepository.upsertProductLink).not.toHaveBeenCalled();
  });

  it("takes a search result only from the Store's own shop", async () => {
    storesRepository.getStoreById.mockResolvedValue({
      id: STORE,
      website: "https://www.dirk.nl",
      searchAddress: "https://www.dirk.nl/zoeken/producten/{query}",
    });
    storeProductsRepository.upsertReadProduct.mockResolvedValue({ id: MANUAL_ID, storeId: STORE });
    const candidate = { name: "Oude kaas", price: 7.99, currency: "EUR" };

    // A page of the shop, with or without its www.
    await caller.chooseProduct({
      storeId: STORE,
      name: "oude kaas",
      choice: { kind: "candidate", candidate: { ...candidate, url: "https://dirk.nl/p/97752" } },
    });
    expect(storeProductsRepository.upsertReadProduct).toHaveBeenCalledTimes(1);

    // A page of anything else is not something Norish reads for this household.
    await expect(
      caller.chooseProduct({
        storeId: STORE,
        name: "oude kaas",
        choice: {
          kind: "candidate",
          candidate: { ...candidate, url: "http://localhost:6379/anything" },
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storeProductsRepository.upsertReadProduct).toHaveBeenCalledTimes(1);
  });

  it("refuses a by-hand product that belongs to another Store", async () => {
    storeProductsRepository.getStoreProductById.mockResolvedValue({
      id: MANUAL_ID,
      storeId: "33333333-3333-4333-8333-333333333333",
      isManual: true,
    });

    await expect(
      caller.chooseProduct({ storeId: STORE, name: "oude kaas", choice: manualChoice })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
