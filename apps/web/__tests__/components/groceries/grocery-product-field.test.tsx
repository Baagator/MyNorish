/**
 * The grocery panel's product field: what it asks the shop about, and what it
 * says while it is asking.
 */
import type { ReactNode } from "react";
import { GroceryProductField } from "@/components/groceries/grocery-product-field";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom";

import type { StoreDto, StoreProductDto } from "@norish/shared/contracts";

interface SearchCall {
  storeId: string | null;
  term: string;
  enabled: boolean;
}

const searchCalls: SearchCall[] = [];

/** What the shop answers: whatever shares a word with the term. */
const SHOP: Record<string, { name: string; url: string; price: number; size: string }[]> = {
  "store-a": [
    { name: "Coca-Cola 1 L", url: "https://a.example/p/cola-1l", price: 1.99, size: "1 L" },
    { name: "Cola Zero 1,5 L", url: "https://a.example/p/cola-zero", price: 2.29, size: "1,5 L" },
  ],
  "store-b": [{ name: "Cola B 1 L", url: "https://b.example/p/cola-1l", price: 1.49, size: "1 L" }],
};

function answer(storeId: string | null, term: string) {
  const words = term
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return (SHOP[storeId ?? ""] ?? []).filter((candidate) =>
    words.some((word) => candidate.name.toLowerCase().includes(word))
  );
}

/** What each Store has already stored, which the field shows without asking. */
const KNOWN: Record<string, StoreProductDto[]> = { "store-a": [], "store-b": [] };

// react-query's own semantics: a disabled query never leaves `pending`.
vi.mock("@/hooks/stores", () => ({
  useShopSearch: (storeId: string | null, term: string, enabled: boolean) => {
    searchCalls.push({ storeId, term, enabled });
    const on = enabled && Boolean(storeId) && term.trim().length > 0;

    if (!on) return { data: undefined, isPending: true, isFetching: false };

    return {
      data: {
        candidates: answer(storeId, term).map((candidate) => ({
          name: candidate.name,
          url: candidate.url,
          price: candidate.price,
          currency: "EUR",
          size: candidate.size,
        })),
      },
      isPending: false,
      isFetching: false,
    };
  },
  useStoreProducts: (storeId: string | null, enabled: boolean) => ({
    data: enabled ? (KNOWN[storeId ?? ""] ?? []) : undefined,
    isPending: !enabled,
    isFetching: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${Object.values(params).join(" ")}` : key,
  useLocale: () => "en",
}));

vi.mock("@/components/Panel/Panel", () => ({
  usePanelPortalContainer: () => undefined,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function store(id: string, name: string, searchAddress: string | null): StoreDto {
  return {
    id,
    name,
    color: "blue",
    icon: "ShoppingCartIcon",
    sortOrder: 0,
    website: `https://${id}.example`,
    searchAddress,
  } as unknown as StoreDto;
}

const STORE_A = store("store-a", "Store A", "https://a.example/search?q={query}");
const STORE_B = store("store-b", "Store B", "https://b.example/search?q={query}");
const UNREADABLE = store("store-c", "Store C", null);

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

/** The term the field last actually asked a shop about. */
function lastAskedTerm(): string | null {
  return (
    searchCalls.filter((call) => call.enabled && call.term.trim().length > 0).at(-1)?.term ?? null
  );
}

function field(): HTMLElement {
  return screen.getByTestId("grocery-product-field");
}

function options(): string[] {
  return screen.queryAllByTestId("product-option").map((node) => node.textContent ?? "");
}

beforeEach(() => {
  searchCalls.length = 0;
  KNOWN["store-a"] = [];
  KNOWN["store-b"] = [];
});

describe("GroceryProductField", () => {
  it("asks the shop about the grocery's own name when the name arrived after the field", async () => {
    // The add panel mounts this field the moment a Store is picked, which for
    // a batch add is before the shopper has typed the grocery's name.
    const { rerender } = render(
      <GroceryProductField
        choice={null}
        groceryName=""
        linkedProduct={null}
        store={STORE_A}
        onChoice={() => undefined}
      />
    );

    rerender(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={STORE_A}
        onChoice={() => undefined}
      />
    );

    await act(async () => {
      field().focus();
    });

    expect(lastAskedTerm()).toBe("cola");
    expect(screen.queryByTestId("product-searching")).not.toBeInTheDocument();
    expect(options()).toContain("Coca-Cola 1 L€1.99 · 1 L");
  });

  it("stops saying it is searching once there is nothing to search for", async () => {
    render(
      <GroceryProductField
        choice={null}
        groceryName=""
        linkedProduct={null}
        store={STORE_A}
        onChoice={() => undefined}
      />
    );

    await act(async () => {
      field().focus();
    });

    expect(screen.queryByTestId("product-searching")).not.toBeInTheDocument();
    // Nor may it offer to type a price for a shop it never asked.
    expect(screen.queryByTestId("product-by-hand")).not.toBeInTheDocument();
  });

  it("says nothing was found only once the shop has actually answered nothing", async () => {
    render(
      <GroceryProductField
        choice={null}
        groceryName="ansjovis"
        linkedProduct={null}
        store={STORE_A}
        onChoice={() => undefined}
      />
    );

    await act(async () => {
      field().focus();
    });

    expect(lastAskedTerm()).toBe("ansjovis");
    expect(screen.getByTestId("product-by-hand")).toBeInTheDocument();
  });

  it("reads the new Store's own linked product when the Store is swapped", () => {
    const linkedAtA = product("prod-a", "store-a", "Coca-Cola 1 L", 1.99);
    const linkedAtB = product("prod-b", "store-b", "Cola B 1 L", 1.49);

    KNOWN["store-a"] = [linkedAtA];
    KNOWN["store-b"] = [linkedAtB];

    const { rerender } = render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={linkedAtA}
        store={STORE_A}
        onChoice={() => undefined}
      />
    );

    expect(field()).toHaveValue("Coca-Cola 1 L");

    rerender(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={linkedAtB}
        store={STORE_B}
        onChoice={() => undefined}
      />
    );

    expect(field()).toHaveValue("Cola B 1 L");
    expect(screen.getByTestId("product-price")).toHaveTextContent("1.49");
  });

  it("cannot be typed in for a shop Norish cannot read", () => {
    render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={UNREADABLE}
        onChoice={() => undefined}
      />
    );

    expect(field()).toBeDisabled();
    expect(searchCalls.every((call) => !call.enabled)).toBe(true);
  });

  it("asks the shop about what was typed once the typing stops", async () => {
    vi.useFakeTimers();
    try {
      render(
        <GroceryProductField
          choice={null}
          groceryName="cola"
          linkedProduct={null}
          store={STORE_A}
          onChoice={() => undefined}
        />
      );

      act(() => {
        field().focus();
      });
      act(() => {
        fireEvent.change(field(), { target: { value: "zero" } });
      });

      // Mid-keystroke the shop is not asked about a half-typed word.
      expect(lastAskedTerm()).toBe("cola");

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(lastAskedTerm()).toBe("zero");
    } finally {
      vi.useRealTimers();
    }
  });
});
