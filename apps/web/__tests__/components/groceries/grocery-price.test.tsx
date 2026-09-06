/**
 * What the row says about a grocery's price: the Line Cost and the packs it
 * counted where the Store knows the product, a loader while the Store is
 * still being asked, and nothing at all for a Miss or a name nobody has
 * asked about.
 */
import { GroceryPrice } from "@/components/groceries/grocery-price";
import { lineOf } from "@/components/groceries/store-total";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom";

import type { GroceryDto, ResolvedProductLink, StoreProductDto } from "@norish/shared/contracts";

const links = new Map<string, ResolvedProductLink>();

vi.mock("@/app/(app)/groceries/stores-context", () => ({
  useStoresContext: () => ({
    linkFor: (storeId: string | null, name: string | null) =>
      links.get(`${storeId}|${name}`) ?? null,
    priceFor: (storeId: string | null, name: string | null) =>
      links.get(`${storeId}|${name}`)?.product ?? null,
  }),
}));

vi.mock("@/hooks/use-unit-formatter", () => ({
  useUnitFormatter: () => ({
    formatAmountUnit: (amount: number | null, unit: string | null) =>
      [amount, unit === "gram" ? "g" : unit].filter((part) => part !== null).join(" "),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    key === "packs" ? `${params?.count} × ${params?.size}` : key,
  useLocale: () => "en",
}));

const STORE = "store-a";

function grocery(
  name: string,
  amount: number | null = null,
  unit: string | null = null
): GroceryDto {
  return { id: name, name, amount, unit, storeId: STORE, isDone: false } as unknown as GroceryDto;
}

function product(overrides: Partial<StoreProductDto>): StoreProductDto {
  return {
    id: "p-kaas",
    storeId: STORE,
    name: "Oude kaas 500 g",
    pageUrl: "https://shop.example/p/kaas",
    price: 4.99,
    currency: "EUR",
    size: "500 g",
    packQuantity: 500,
    packUnit: "gram",
    packByWeight: false,
    packByHand: false,
    pricedAt: new Date(),
    isManual: false,
    version: 1,
    ...overrides,
  } as unknown as StoreProductDto;
}

function link(name: string, linked: StoreProductDto | null, triedAt: Date | null = new Date()) {
  links.set(`${STORE}|${name}`, { storeId: STORE, normalizedName: name, triedAt, product: linked });
}

describe("GroceryPrice", () => {
  it("shows the Shelf Price and the product it is for, for one pack", () => {
    link("kaas", product({}));
    render(<GroceryPrice line={lineOf(grocery("kaas"))} />);

    expect(screen.getByTestId("grocery-line-cost")).toHaveTextContent("€4.99 · 500 g");
    expect(screen.getByTestId("grocery-product")).toHaveTextContent("Oude kaas 500 g");
    expect(screen.queryByTestId("grocery-one-pack")).not.toBeInTheDocument();
  });

  it("shows the Line Cost first and the packs after, in the shop's own words", () => {
    link("bloem", product({ id: "p-bloem", name: "Tarwebloem", price: 2.99 }));
    render(<GroceryPrice line={lineOf(grocery("bloem", 700, "gram"))} />);

    expect(screen.getByTestId("grocery-line-cost")).toHaveTextContent("€5.98 · 2 × 500 g");
    expect(screen.getByTestId("grocery-price")).toHaveAttribute("data-grocery-packs", "2");
  });

  it("uses Norish's words for a Pack Size set by hand", () => {
    link("bloem", product({ id: "p-bloem", price: 2.99, size: "groot pak", packByHand: true }));
    render(<GroceryPrice line={lineOf(grocery("bloem", 700, "gram"))} />);

    expect(screen.getByTestId("grocery-line-cost")).toHaveTextContent("€5.98 · 2 × 500 g");
  });

  it("shows the cost and the weight priced for what is sold loose", () => {
    link(
      "bananen",
      product({
        id: "p-bananen",
        name: "Bananen",
        price: 1.99,
        size: "per kg",
        packQuantity: 1,
        packUnit: "kilogram",
        packByWeight: true,
      })
    );
    render(<GroceryPrice line={lineOf(grocery("bananen", 700, "gram"))} />);

    expect(screen.getByTestId("grocery-line-cost")).toHaveTextContent("€1.39 · 700 g");
  });

  it("notes, quietly, a line it priced as one pack", () => {
    link("kaas", product({}));
    render(<GroceryPrice line={lineOf(grocery("kaas", 2, "liter"))} />);

    expect(screen.getByTestId("grocery-line-cost")).toHaveTextContent("€4.99 · 500 g");
    expect(screen.getByTestId("grocery-one-pack")).toHaveTextContent("onePack");
  });

  it("shows a loader, and no words, while the Store is still being asked", () => {
    link("melk", null, null);
    render(<GroceryPrice line={lineOf(grocery("melk"))} />);

    const pending = screen.getByTestId("grocery-price-pending");

    expect(pending).toBeInTheDocument();
    expect(pending).toHaveTextContent("");
    expect(screen.getByLabelText("pending")).toBeInTheDocument();
    expect(screen.queryByTestId("grocery-price")).not.toBeInTheDocument();
  });

  it("shows nothing for a Miss, and nothing for a name nobody asked about", () => {
    link("sterrenstof", null);
    const { container } = render(
      <>
        <GroceryPrice line={lineOf(grocery("sterrenstof"))} />
        <GroceryPrice line={lineOf(grocery("niets"))} />
      </>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
