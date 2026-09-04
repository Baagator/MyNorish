/**
 * Swapping the Store in the grocery panel: the product field is about the
 * Store that is selected now, and nothing of the old one may survive the swap.
 */
import type { ReactNode } from "react";
import EditGroceryPanel from "@/components/Panel/consumers/edit-grocery-panel";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom";

import type { GroceryDto, StoreDto, StoreProductDto } from "@norish/shared/contracts";

const chooseProduct = vi.fn();

function product(id: string, storeId: string, name: string, price: number): StoreProductDto {
  return {
    id,
    storeId,
    name,
    pageUrl: `https://${storeId}.example/p/${id}`,
    price,
    currency: "EUR",
    size: "1 L",
    regularPrice: null,
    promotionNote: null,
    readAt: new Date("2026-09-01T00:00:00Z"),
  } as unknown as StoreProductDto;
}

const COLA_AT_A = product("prod-a", "store-a", "Coca-Cola 1 L", 1.99);
const COLA_AT_B = product("prod-b", "store-b", "Cola B 1 L", 1.49);

/** What each Store has learned "cola" means, as the database holds it. */
const LINKS: Record<string, StoreProductDto> = {
  "store-a|cola": COLA_AT_A,
  "store-b|cola": COLA_AT_B,
};

/**
 * `stores.groceryPrices` prices *the list*: it answers for the Store each
 * grocery sits under and for no other, so a Store the shopper has only
 * selected is not in it.
 */
const ON_THE_LIST = new Set(["store-a|cola"]);

vi.mock("@/hooks/stores/use-store-prices", () => ({
  useStorePrices: () => ({
    priceFor: (storeId: string | null, name: string | null) => {
      const key = `${storeId}|${(name ?? "").toLowerCase()}`;

      return ON_THE_LIST.has(key) ? (LINKS[key] ?? null) : null;
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/stores/use-store-picker", () => ({
  useParsedGroceryName: (raw: string) => raw.trim(),
  useChooseProduct: () => chooseProduct,
  useShopSearch: () => ({ data: undefined, isPending: true, isFetching: false }),
  useStoreProducts: (storeId: string | null, enabled: boolean) => ({
    data: enabled
      ? Object.values(LINKS).filter((candidate) => candidate.storeId === storeId)
      : undefined,
    isPending: !enabled,
    isFetching: false,
  }),
  useProductLink: (storeId: string | null, name: string) => {
    const key = `${storeId}|${name.trim().toLowerCase()}`;
    const product = LINKS[key];

    return {
      data: product
        ? { storeId, normalizedName: name.trim().toLowerCase(), product, lastTriedAt: null }
        : null,
      isPending: false,
    };
  },
}));

vi.mock("@/hooks/use-recurrence-detection", () => ({
  useRecurrenceDetection: () => ({ detectedPattern: null }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${Object.values(params).join(" ")}` : key,
  useLocale: () => "en",
}));

vi.mock("@/components/Panel/Panel", () => {
  const Panel = ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null;

  Panel.Body = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  Panel.Footer = ({ children }: { children: ReactNode }) => <div>{children}</div>;

  return { default: Panel, usePanelPortalContainer: () => undefined };
});

vi.mock("@/components/Panel/consumers/recurrence-panel", () => ({
  RecurrencePanel: () => null,
}));

vi.mock("@/app/(app)/groceries/components/recurrence-suggestion", () => ({
  RecurrenceSuggestion: () => null,
}));

vi.mock("@/components/shared/action-button", () => ({
  ActionButton: ({ children, onPress, isDisabled, action }: any) => (
    <button data-testid={`action-${action}`} disabled={isDisabled} type="button" onClick={onPress}>
      {children}
    </button>
  ),
  ActionButtonGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The Store picker itself is not what these are about; a plain select drives
// exactly the callback the real one does.
vi.mock("@/components/groceries/store-selector", () => ({
  StoreSelector: ({ selectedStoreId, stores, onSelectionChange }: any) => (
    <select
      data-testid="store-selector"
      value={selectedStoreId ?? "none"}
      onChange={(event) =>
        onSelectionChange(event.target.value === "none" ? null : event.target.value)
      }
    >
      <option value="none">none</option>
      {stores.map((store: StoreDto) => (
        <option key={store.id} value={store.id}>
          {store.name}
        </option>
      ))}
    </select>
  ),
}));

function store(id: string, name: string): StoreDto {
  return {
    id,
    name,
    color: "blue",
    icon: "ShoppingCartIcon",
    sortOrder: 0,
    website: `https://${id}.example`,
    searchAddress: `https://${id}.example/search?q={query}`,
  } as unknown as StoreDto;
}

const STORES = [store("store-a", "Store A"), store("store-b", "Store B")];

const GROCERY = {
  id: "grocery-1",
  name: "cola",
  amount: null,
  unit: null,
  storeId: "store-a",
  completed: false,
  version: 1,
} as unknown as GroceryDto;

beforeEach(() => {
  chooseProduct.mockClear();
});

describe("EditGroceryPanel, swapping the Store", () => {
  it("reads the new Store's own linked product straight away", () => {
    render(
      <EditGroceryPanel
        grocery={GROCERY}
        open={true}
        recurringGrocery={null}
        stores={STORES}
        onDelete={() => undefined}
        onOpenChange={() => undefined}
        onSave={() => undefined}
      />
    );

    expect(screen.getByTestId("grocery-product-field")).toHaveValue("Coca-Cola 1 L");

    fireEvent.change(screen.getByTestId("store-selector"), { target: { value: "store-b" } });

    expect(screen.getByTestId("grocery-product-field")).toHaveValue("Cola B 1 L");
    expect(screen.getByTestId("product-by-hand-price")).toHaveValue("1.49");
  });

  it("never writes a product of the Store that was swapped away from", () => {
    render(
      <EditGroceryPanel
        grocery={GROCERY}
        open={true}
        recurringGrocery={null}
        stores={STORES}
        onDelete={() => undefined}
        onOpenChange={() => undefined}
        onSave={() => undefined}
      />
    );

    // Point the grocery at one of Store A's products, then change Store.
    act(() => {
      screen.getByTestId("grocery-product-field").focus();
    });

    const option = screen
      .getAllByTestId("product-option")
      .find((node) => node.textContent?.includes("Coca-Cola 1 L"));

    expect(option).toBeDefined();
    act(() => {
      fireEvent.click(option as HTMLElement);
    });
    expect(screen.getByTestId("grocery-product-field")).toHaveValue("Coca-Cola 1 L");

    fireEvent.change(screen.getByTestId("store-selector"), { target: { value: "store-b" } });
    fireEvent.click(screen.getByTestId("action-save"));

    // Store A's product is not in Store B; writing it there is an error the
    // shopper never asked for.
    expect(chooseProduct).not.toHaveBeenCalled();
  });
});
