"use client";

import { useStoresContext } from "@/app/(app)/groceries/stores-context";
import { formatShelfPrice } from "@/lib/format-price";
import { useLocale } from "next-intl";

import type { GroceryDto } from "@norish/shared/contracts";

/**
 * What one pack of this grocery costs at its Store, as the shop last stated
 * it, and which of the shop's products that price is for. There is no age line
 * — at a twelve-hour ceiling the age is never interesting.
 *
 * It reads and nothing more. Which product a Grocery is is a field of the
 * grocery panel, which the row already opens.
 */
export function GroceryPrice({ grocery }: { grocery: GroceryDto }) {
  const { priceFor } = useStoresContext();
  const locale = useLocale();
  const product = priceFor(grocery.storeId, grocery.name);

  if (!product) return null;

  return (
    <span
      className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right"
      data-grocery-price={product.id}
      data-testid="grocery-price"
    >
      <span className="text-foreground text-sm tabular-nums">
        {formatShelfPrice(locale, product.price, product.currency)}
        {product.size ? ` · ${product.size}` : ""}
      </span>
      <span className="text-muted w-full truncate text-xs" data-testid="grocery-product">
        {product.name}
      </span>
    </span>
  );
}
