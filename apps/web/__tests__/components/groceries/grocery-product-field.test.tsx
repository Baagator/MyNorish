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

/** A shop that has been asked and has not answered yet. */
const SEARCH_IS_SLOW = { current: false };

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
    if (SEARCH_IS_SLOW.current) return { data: undefined, isPending: true, isFetching: true };

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
/** A Store with a shop link Norish could not make a search out of. */
const UNREADABLE = store("store-c", "Store C", null);
/** An ordinary Store: a heading, and no shop behind it at all. */
const NO_SHOP = { ...store("store-d", "Store D", null), website: null } as StoreDto;

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
    expect(screen.getByTestId("product-by-hand-price")).toHaveValue("1.49");
  });

  it("takes the one product a shopper would not hesitate over, without being asked", async () => {
    const chosen: unknown[] = [];

    render(
      <GroceryProductField
        choice={null}
        groceryName="Cola B 1 L"
        linkedProduct={null}
        store={STORE_B}
        onChoice={(choice) => chosen.push(choice)}
      />
    );

    await act(async () => {
      field().focus();
    });

    expect(chosen).toEqual([
      {
        kind: "candidate",
        candidate: {
          name: "Cola B 1 L",
          url: "https://b.example/p/cola-1l",
          price: 1.49,
          currency: "EUR",
          size: "1 L",
        },
      },
    ]);
    expect(field()).toHaveValue("Cola B 1 L");
    expect(screen.getByTestId("product-by-hand-price")).toHaveValue("1.49");
  });

  it("takes the one product a typed term found, and does not ask the shop about it again", () => {
    vi.useFakeTimers();
    try {
      const onChoice = vi.fn();

      render(
        <GroceryProductField
          choice={null}
          groceryName="cola"
          linkedProduct={null}
          store={STORE_A}
          onChoice={onChoice}
        />
      );

      act(() => {
        field().focus();
      });
      // Two colas answer "cola", so nothing has been chosen yet.
      expect(onChoice).not.toHaveBeenCalled();

      act(() => {
        fireEvent.change(field(), { target: { value: "zero" } });
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onChoice).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "candidate",
          candidate: expect.objectContaining({ name: "Cola Zero 1,5 L" }),
        })
      );
      expect(field()).toHaveValue("Cola Zero 1,5 L");

      // The name it wrote into the box is that answer, not a new question:
      // the shop is not visited again for the product it has just chosen.
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(lastAskedTerm()).toBe("zero");
    } finally {
      vi.useRealTimers();
    }
  });

  it("chooses nothing where two of the shop's products answer equally well", async () => {
    const chosen: unknown[] = [];

    render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={STORE_A}
        onChoice={(choice) => chosen.push(choice)}
      />
    );

    await act(async () => {
      field().focus();
    });

    expect(options()).toHaveLength(2);
    expect(chosen).toEqual([]);
    expect(field()).toHaveValue("");
  });

  it("leaves a grocery that is already linked exactly as it is", async () => {
    const linked = product("prod-b", "store-b", "Cola B 1 L", 1.49);
    const chosen: unknown[] = [];

    KNOWN["store-b"] = [linked];

    render(
      <GroceryProductField
        choice={null}
        groceryName="Cola B 1 L"
        linkedProduct={linked}
        store={STORE_B}
        onChoice={(choice) => chosen.push(choice)}
      />
    );

    await act(async () => {
      field().focus();
    });

    expect(chosen).toEqual([]);
    expect(field()).toHaveValue("Cola B 1 L");
  });

  it("is not there at all for a Store with no shop behind it", () => {
    const { container } = render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={NO_SHOP}
        onChoice={() => undefined}
      />
    );

    expect(container).toBeEmptyDOMElement();
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
    // And it says why, rather than leaving a dead field to be puzzled over.
    expect(screen.getByTestId("product-cannot-search")).toBeInTheDocument();
  });

  it("offers the Store's own products for the term, and not its whole shelf", async () => {
    KNOWN["store-a"] = [
      product("known-cola", "store-a", "Cola Light 1 L", 1.89),
      product("known-kaas", "store-a", "Oude kaas 500 g", 4.99),
    ];

    render(
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

    const offered = options().join("|");

    expect(offered).toContain("Cola Light 1 L");
    expect(offered).toContain("Coca-Cola 1 L");
    expect(offered).not.toContain("Oude kaas");
  });

  it("does not answer a question with a product that only shares a size", async () => {
    KNOWN["store-a"] = [product("known-melk", "store-a", "Halfvolle melk 1 L", 1.29)];

    render(
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

    // "cola" and "Halfvolle melk 1 L" share the letter l and nothing else.
    expect(options().join("|")).not.toContain("Halfvolle melk");
  });

  it("says which rows the Store already knew and which the shop just answered", async () => {
    KNOWN["store-a"] = [product("known-cola", "store-a", "Cola Light 1 L", 1.89)];

    render(
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

    expect(screen.getByTestId("product-group-known")).toBeInTheDocument();
    expect(screen.getByTestId("product-group-shop")).toBeInTheDocument();
  });

  it("says the shop is being read in the dropdown, where the rows will land", async () => {
    render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={STORE_A}
        onChoice={() => undefined}
      />
    );

    // The shop has been asked and has not answered yet: AH takes its time, and
    // the dropdown is where the shopper is looking.
    SEARCH_IS_SLOW.current = true;
    await act(async () => {
      field().focus();
    });

    expect(screen.getByTestId("product-group-shop")).toHaveTextContent("searching");
    SEARCH_IS_SLOW.current = false;
  });

  it("fills the price fields from the product that was picked", async () => {
    const onChoice = vi.fn();

    render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={STORE_A}
        onChoice={onChoice}
      />
    );

    await act(async () => {
      field().focus();
    });

    const picked = screen
      .getAllByTestId("product-option")
      .find((node) => node.textContent?.includes("Cola Zero"));

    await act(async () => {
      fireEvent.click(picked as HTMLElement);
    });

    expect(onChoice).toHaveBeenCalledWith(expect.objectContaining({ kind: "candidate" }));
    expect(screen.getByTestId("product-by-hand-price")).toHaveValue("2.29");
    expect(screen.getByTestId("product-by-hand-name")).toHaveValue("Cola Zero 1,5 L");
  });

  it("turns a price typed over the shop's own into the shopper's price", async () => {
    const onChoice = vi.fn();

    render(
      <GroceryProductField
        choice={null}
        groceryName="cola"
        linkedProduct={null}
        store={STORE_A}
        onChoice={onChoice}
      />
    );

    await act(async () => {
      field().focus();
    });

    const picked = screen
      .getAllByTestId("product-option")
      .find((node) => node.textContent?.includes("Cola Zero"));

    await act(async () => {
      fireEvent.click(picked as HTMLElement);
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("product-by-hand-price"), { target: { value: "1,99" } });
    });

    expect(onChoice).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "manual", price: 1.99, name: "Cola Zero 1,5 L" })
    );
    // The row stays picked: the shopper corrected a price, they did not
    // un-choose the product.
    expect(field()).toHaveValue("Cola Zero 1,5 L");
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
