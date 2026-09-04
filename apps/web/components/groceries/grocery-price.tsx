"use client";

import { useGroceriesUiContext } from "@/app/(app)/groceries/context";
import { useStoresContext } from "@/app/(app)/groceries/stores-context";
import { formatShelfPrice } from "@/lib/format-price";
import { useLocale, useTranslations } from "next-intl";

import type { GroceryDto } from "@norish/shared/contracts";

/**
 * What one pack of this grocery costs at its Store, as the shop last stated
 * it, and which of the shop's products that price is for. There is no age line
 * — at a twelve-hour ceiling the age is never interesting.
 *
 * Both states are a way into the picker: an unpriced Grocery to choose a
 * product, a priced one to see what was chosen and change it. A Miss is not a
 * failure, so neither ever reads as an error.
 */
export function GroceryPrice({ grocery }: { grocery: GroceryDto }) {
  const { priceFor, stores } = useStoresContext();
  const { openGroceryPricePicker } = useGroceriesUiContext();
  const t = useTranslations("groceries.prices");
  const locale = useLocale();
  const product = priceFor(grocery.storeId, grocery.name);
  const store = stores.find((candidate) => candidate.id === grocery.storeId);

  if (!store?.searchAddress || !grocery.name) return null;

  if (!product) {
    return (
      <button
        className="text-muted hover:text-foreground shrink-0 text-xs underline-offset-2 hover:underline"
        data-testid="pick-price"
        type="button"
        onClick={() => openGroceryPricePicker(grocery)}
      >
        {t("pickPrice")}
      </button>
    );
  }

  return (
    <button
      aria-label={t("changeProduct", { product: product.name })}
      className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right"
      data-grocery-price={product.id}
      data-testid="grocery-price"
      type="button"
      onClick={() => openGroceryPricePicker(grocery)}
    >
      <span className="text-foreground text-sm tabular-nums">
        {formatShelfPrice(locale, product.price, product.currency)}
        {product.size ? ` · ${product.size}` : ""}
      </span>
      <span className="text-muted w-full truncate text-xs" data-testid="grocery-product">
        {product.name}
      </span>
    </button>
  );
}
