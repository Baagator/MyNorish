/**
 * What the row says about a grocery's price: the Shelf Price where the Store
 * knows the product, a loader while the Store is still being asked, and
 * nothing at all for a Miss or a name nobody has asked about.
 */
import { GroceryPrice } from "@/components/groceries/grocery-price";
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

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const STORE = "store-a";

function grocery(name: string): GroceryDto {
  return { id: name, name, storeId: STORE, isDone: false } as unknown as GroceryDto;
}

const KAAS: StoreProductDto = {
  id: "p-kaas",
  storeId: STORE,
  name: "Oude kaas 500 g",
  pageUrl: "https://shop.example/p/kaas",
  price: 4.99,
  currency: "EUR",
  size: "500 g",
  pricedAt: new Date(),
  isManual: false,
  version: 1,
} as unknown as StoreProductDto;

describe("GroceryPrice", () => {
  it("shows the Shelf Price and the product it is for", () => {
    links.set(`${STORE}|kaas`, {
      storeId: STORE,
      normalizedName: "kaas",
      triedAt: new Date(),
      product: KAAS,
    });
    render(<GroceryPrice grocery={grocery("kaas")} />);

    expect(screen.getByTestId("grocery-price")).toHaveTextContent("€4.99 · 500 g");
    expect(screen.getByTestId("grocery-product")).toHaveTextContent("Oude kaas 500 g");
  });

  it("shows a loader, and no words, while the Store is still being asked", () => {
    links.set(`${STORE}|melk`, {
      storeId: STORE,
      normalizedName: "melk",
      triedAt: null,
      product: null,
    });
    render(<GroceryPrice grocery={grocery("melk")} />);

    const pending = screen.getByTestId("grocery-price-pending");

    expect(pending).toBeInTheDocument();
    expect(pending).toHaveTextContent("");
    expect(screen.getByLabelText("pending")).toBeInTheDocument();
    expect(screen.queryByTestId("grocery-price")).not.toBeInTheDocument();
  });

  it("shows nothing for a Miss, and nothing for a name nobody asked about", () => {
    links.set(`${STORE}|sterrenstof`, {
      storeId: STORE,
      normalizedName: "sterrenstof",
      triedAt: new Date(),
      product: null,
    });
    const { container } = render(
      <>
        <GroceryPrice grocery={grocery("sterrenstof")} />
        <GroceryPrice grocery={grocery("niets")} />
      </>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
