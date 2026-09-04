// @vitest-environment node
/**
 * What a lookup does with what a shop answers. The reader and the fetcher are
 * the api layer's, reached through the handler registry; what is pinned here
 * is the shape of the visit — one search, an unmistakable match read from its
 * own page, and a Miss written for the searched name and nothing else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoreCandidate } from "@norish/shared/contracts";
import {
  registerQueueApiHandlers,
  resetQueueApiHandlersForTests,
} from "@norish/queue/api-handlers";
import { matchGroceryName, refreshProducts } from "@norish/queue/store-lookup/lookup";
import { resetStoreVisitPacingForTests } from "@norish/queue/store-lookup/pace";

const mocks = vi.hoisted(() => ({
  getStoreById: vi.fn(),
  upsertProductLink: vi.fn(),
  upsertReadProduct: vi.fn(),
  resolveProductLink: vi.fn(),
  listStaleProducts: vi.fn(),
  emitToHousehold: vi.fn(),
}));

vi.mock("@norish/db/repositories/stores", () => ({ getStoreById: mocks.getStoreById }));
vi.mock("@norish/db/repositories/store-products", () => ({
  upsertProductLink: mocks.upsertProductLink,
  upsertReadProduct: mocks.upsertReadProduct,
  resolveProductLink: mocks.resolveProductLink,
  listStaleProducts: mocks.listStaleProducts,
}));
vi.mock("@norish/shared-server/realtime/stores", () => ({
  storeEmitter: { emitToHousehold: mocks.emitToHousehold },
}));

const STORE = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD = "household-1";
const SEARCH_ADDRESS = "https://www.dirk.nl/zoeken/producten/{query}";
const PRODUCT_PAGE = "https://www.dirk.nl/boodschappen/kaas/oude-kaas/97752";

function candidate(name: string, url = PRODUCT_PAGE): StoreCandidate {
  return { name, url, price: 7.99, currency: "EUR", size: "930 g" };
}

function useShop(options: {
  searchHtml?: string;
  productHtml?: string;
  candidates?: StoreCandidate[];
  product?: { name: string; price: number; currency: string; size?: string } | null;
}) {
  const visited: string[] = [];

  registerQueueApiHandlers({
    fetchStorePage: (url: string) => {
      visited.push(url);

      return Promise.resolve({
        html:
          url === PRODUCT_PAGE
            ? (options.productHtml ?? "<html/>")
            : (options.searchHtml ?? "<html/>"),
        url,
        rendered: false,
      });
    },
    readSearchResults: () => options.candidates ?? [],
    readProduct: () => options.product ?? null,
  });

  return visited;
}

describe("matchGroceryName", () => {
  beforeEach(() => {
    resetQueueApiHandlersForTests();
    resetStoreVisitPacingForTests(1);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getStoreById.mockResolvedValue({ id: STORE, searchAddress: SEARCH_ADDRESS });
    mocks.resolveProductLink.mockResolvedValue({
      storeId: STORE,
      normalizedName: "oude kaas",
      triedAt: new Date(),
      product: null,
    });
    mocks.upsertReadProduct.mockImplementation((reading: Record<string, unknown>) =>
      Promise.resolve({ id: "product-1", ...reading })
    );
  });

  it("searches the shop with the grocery's own name", async () => {
    const visited = useShop({
      candidates: [candidate("Oude kaas")],
      product: { name: "Oude kaas", price: 7.99, currency: "EUR", size: "930 g" },
    });

    await matchGroceryName({ storeId: STORE, name: "oude kaas", householdKey: HOUSEHOLD });

    expect(visited[0]).toBe("https://www.dirk.nl/zoeken/producten/oude%20kaas");
  });

  it("reads the product's own page for the price it keeps", async () => {
    useShop({
      candidates: [candidate("Oude kaas")],
      product: { name: "1 de Beste Oude kaas 48+", price: 8.49, currency: "EUR", size: "930 g" },
    });

    const result = await matchGroceryName({
      storeId: STORE,
      name: "oude kaas",
      householdKey: HOUSEHOLD,
    });

    expect(result).toEqual({ matched: true });
    expect(mocks.upsertReadProduct).toHaveBeenCalledWith({
      storeId: STORE,
      name: "1 de Beste Oude kaas 48+",
      pageUrl: PRODUCT_PAGE,
      price: 8.49,
      currency: "EUR",
      size: "930 g",
    });
    expect(mocks.upsertProductLink).toHaveBeenCalledWith(STORE, "oude kaas", "product-1");
  });

  it("keeps the results page's reading when the product page states nothing", async () => {
    useShop({ candidates: [candidate("Oude kaas")], product: null });

    await matchGroceryName({ storeId: STORE, name: "oude kaas", householdKey: HOUSEHOLD });

    expect(mocks.upsertReadProduct).toHaveBeenCalledWith(
      expect.objectContaining({ price: 7.99, name: "Oude kaas" })
    );
  });

  it("writes a Miss when nothing on the page is unmistakably the thing asked for", async () => {
    useShop({ candidates: [candidate("Oude kaas", "a"), candidate("Oude kaas", "b")] });

    const result = await matchGroceryName({
      storeId: STORE,
      name: "oude kaas",
      householdKey: HOUSEHOLD,
    });

    expect(result).toEqual({ matched: false });
    expect(mocks.upsertProductLink).toHaveBeenCalledWith(STORE, "oude kaas", null);
    expect(mocks.upsertReadProduct).not.toHaveBeenCalled();
  });

  it("writes a Miss for the searched name and stops when the shop answers nothing", async () => {
    registerQueueApiHandlers({
      fetchStorePage: (url: string) => Promise.resolve({ html: "", url, rendered: false }),
      readSearchResults: () => [],
      readProduct: () => null,
    });

    const result = await matchGroceryName({
      storeId: STORE,
      name: "oude kaas",
      householdKey: HOUSEHOLD,
    });

    expect(result).toEqual({ matched: false });
    expect(mocks.upsertProductLink).toHaveBeenCalledExactlyOnceWith(STORE, "oude kaas", null);
  });

  it("leaves alone a name somebody answered while the job was queued", async () => {
    // The job is only ever queued for a name the Store did not know. By the
    // time it runs a shopper may have said which product this is — and a
    // shopper's answer is the answer.
    mocks.resolveProductLink.mockResolvedValue({
      storeId: STORE,
      normalizedName: "oude kaas",
      triedAt: new Date(),
      product: { id: "the-shoppers-choice", name: "Roomboter 250 g" },
    });
    const visited = useShop({ candidates: [candidate("Oude kaas")] });

    const result = await matchGroceryName({
      storeId: STORE,
      name: "oude kaas",
      householdKey: HOUSEHOLD,
    });

    expect(result).toEqual({ matched: false });
    expect(mocks.upsertProductLink).not.toHaveBeenCalled();
    expect(mocks.upsertReadProduct).not.toHaveBeenCalled();
    // And it costs the shop nothing: the question was already answered.
    expect(visited).toEqual([]);
  });

  it("still answers a name the Store knows only as a Miss", async () => {
    mocks.resolveProductLink.mockResolvedValue({
      storeId: STORE,
      normalizedName: "oude kaas",
      triedAt: new Date(),
      product: null,
    });
    useShop({
      candidates: [candidate("Oude kaas")],
      product: { name: "Oude kaas", price: 7.99, currency: "EUR" },
    });

    await expect(
      matchGroceryName({ storeId: STORE, name: "oude kaas", householdKey: HOUSEHOLD })
    ).resolves.toEqual({ matched: true });
  });

  it("visits nothing at all for a Store with no Search Address", async () => {
    mocks.getStoreById.mockResolvedValue({ id: STORE, searchAddress: null });
    const visited = useShop({ candidates: [candidate("Oude kaas")] });

    await matchGroceryName({ storeId: STORE, name: "oude kaas", householdKey: HOUSEHOLD });

    expect(visited).toEqual([]);
    expect(mocks.upsertProductLink).not.toHaveBeenCalled();
  });

  it("tells the household what it learned", async () => {
    useShop({
      candidates: [candidate("Oude kaas")],
      product: { name: "Oude kaas", price: 7.99, currency: "EUR" },
    });

    await matchGroceryName({ storeId: STORE, name: "oude kaas", householdKey: HOUSEHOLD });

    expect(mocks.emitToHousehold).toHaveBeenCalledWith(
      HOUSEHOLD,
      "productUpdated",
      expect.objectContaining({ product: expect.objectContaining({ id: "product-1" }) })
    );
    expect(mocks.emitToHousehold).toHaveBeenCalledWith(HOUSEHOLD, "linkUpdated", expect.anything());
  });
});

describe("refreshProducts", () => {
  beforeEach(() => {
    resetQueueApiHandlersForTests();
    resetStoreVisitPacingForTests(1);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.upsertReadProduct.mockImplementation((reading: Record<string, unknown>) =>
      Promise.resolve({ id: "product-1", ...reading })
    );
  });

  it("visits nothing when nothing is stale", async () => {
    mocks.listStaleProducts.mockResolvedValue([]);
    const visited = useShop({});

    await expect(refreshProducts({ productIds: ["p1"], householdKey: HOUSEHOLD })).resolves.toEqual(
      {
        refreshed: 0,
      }
    );
    expect(visited).toEqual([]);
  });

  it("re-reads a stale Shelf Price from the page it came from", async () => {
    mocks.listStaleProducts.mockResolvedValue([
      { id: "p1", storeId: STORE, pageUrl: PRODUCT_PAGE, isManual: false },
    ]);
    const visited = useShop({ product: { name: "Oude kaas", price: 8.99, currency: "EUR" } });

    await expect(refreshProducts({ productIds: ["p1"], householdKey: HOUSEHOLD })).resolves.toEqual(
      {
        refreshed: 1,
      }
    );
    expect(visited).toEqual([PRODUCT_PAGE]);
    expect(mocks.upsertReadProduct).toHaveBeenCalledWith(
      expect.objectContaining({ price: 8.99, pageUrl: PRODUCT_PAGE })
    );
  });

  it("asks only for products the repository calls stale, which is never a by-hand one", async () => {
    mocks.listStaleProducts.mockResolvedValue([]);

    await refreshProducts({ productIds: ["manual-1"], householdKey: HOUSEHOLD, now: new Date() });

    expect(mocks.listStaleProducts).toHaveBeenCalledWith(["manual-1"], expect.any(Date));
    expect(mocks.upsertReadProduct).not.toHaveBeenCalled();
  });
});
