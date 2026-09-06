import type { GroceryDto, StoreProductDto } from "@norish/shared/contracts";

export interface StoreTotal {
  amount: number;
  currency: string;
}

/**
 * What is still to buy at one Store costs this, as the Store last knew: one
 * Shelf Price per outstanding line, because a Shelf Price is what one pack
 * costs and a Grocery's own amount ("2 kg") is not a number of packs. The
 * lines are the rows a section shows — in the grouped list one per group —
 * so the heading is always the sum of the prices under it.
 *
 * A line the Store cannot price is left out rather than guessed at, and a
 * Store whose products are priced in more than one currency totals the one its
 * first priced line is in — a shop charges in its own money, and a total in
 * two of them would be a lie either way.
 */
export function storeTotal(
  groceries: GroceryDto[],
  priceFor: (storeId: string | null, name: string | null) => StoreProductDto | null,
  storeId: string | null
): StoreTotal | null {
  if (!storeId) return null;
  const products = groceries
    .filter((grocery) => !grocery.isDone)
    .map((grocery) => priceFor(storeId, grocery.name))
    .filter((product): product is StoreProductDto => product !== null);

  if (products.length === 0) return null;
  const currency = products[0]?.currency ?? "";
  const same = products.filter((product) => product.currency === currency);

  return {
    // Money, added up as money: two shelf prices are two exact amounts, and
    // floating point makes 1.99 + 1.29 into 3.2800000000000002.
    amount: same.reduce((sum, product) => Math.round((sum + product.price) * 100) / 100, 0),
    currency,
  };
}
