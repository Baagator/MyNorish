/** What is still to buy at one Store, added up for its heading. */
import { storeTotal } from "@/components/groceries/store-total";
import { describe, expect, it } from "vitest";

import type { GroceryDto, StoreProductDto } from "@norish/shared/contracts";

function grocery(name: string, isDone: boolean): GroceryDto {
  return { id: name, name, isDone, storeId: "store-a" } as unknown as GroceryDto;
}

function product(price: number, currency = "EUR"): StoreProductDto {
  return { id: `p-${price}`, price, currency } as unknown as StoreProductDto;
}

const PRICES: Record<string, StoreProductDto> = {
  cola: product(1.99),
  melk: product(1.29),
  kaas: product(4.99),
};

const priceFor = (_storeId: string | null, name: string | null) => PRICES[name ?? ""] ?? null;

describe("storeTotal", () => {
  it("adds up what is still to buy and leaves out what is ticked off", () => {
    const total = storeTotal(
      [grocery("cola", false), grocery("melk", false), grocery("kaas", true)],
      priceFor,
      "store-a"
    );

    expect(total).toEqual({ amount: 3.28, currency: "EUR", priced: 2 });
  });

  it("counts one Shelf Price per line, whatever the line's own amount says", () => {
    const twoKilos = { ...grocery("kaas", false), amount: 2, unit: "kg" } as GroceryDto;
    const total = storeTotal([twoKilos], priceFor, "store-a");

    expect(total?.amount).toBe(4.99);
  });

  it("has nothing to say for a Store that could price none of it", () => {
    expect(storeTotal([grocery("ansjovis", false)], priceFor, "store-a")).toBeNull();
    expect(storeTotal([grocery("cola", true)], priceFor, "store-a")).toBeNull();
  });

  it("has nothing to say for the groceries under no Store at all", () => {
    expect(storeTotal([grocery("cola", false)], priceFor, null)).toBeNull();
  });

  it("totals the currency its first priced line is in and no other", () => {
    const mixed: Record<string, StoreProductDto> = {
      cola: product(2, "EUR"),
      tea: product(3, "GBP"),
    };
    const total = storeTotal(
      [grocery("cola", false), grocery("tea", false)],
      (_storeId, name) => mixed[name ?? ""] ?? null,
      "store-a"
    );

    expect(total).toEqual({ amount: 2, currency: "EUR", priced: 1 });
  });
});
