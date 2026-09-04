"use client";

import { useGroceriesUiContext } from "@/app/(app)/groceries/context";
import { useStoresContext } from "@/app/(app)/groceries/stores-context";
import { formatShelfPrice } from "@/lib/format-price";
import { useLocale, useTranslations } from "next-intl";

import type { GroceryDto } from "@norish/shared/contracts";

/**
 * What one pack of this grocery costs at its Store, as the shop last stated
 * it: "€2.99 · 150 gram", with the size left out where the shop states none.
 * There is no age line — at a twelve-hour ceiling the age is never
 * interesting.
 *
 * An unpriced grocery in a Store Norish can search offers a way into the
 * picker instead. A Miss is not a failure, so it never reads as an error.
 */
export function GroceryPrice({ grocery }: { grocery: GroceryDto }) {
  const { priceFor, stores } = useStoresContext();
  const { openGroceryPricePicker } = useGroceriesUiContext();
  const t = useTranslations("groceries.prices");
  const locale = useLocale();
  const product = priceFor(grocery.storeId, grocery.name);

  if (product) {
    return (
      <span
        className="text-muted shrink-0 text-xs tabular-nums"
        data-grocery-price={product.id}
        data-testid="grocery-price"
      >
        {formatShelfPrice(locale, product.price, product.currency)}
        {product.size ? ` · ${product.size}` : ""}
      </span>
    );
  }

  const store = stores.find((candidate) => candidate.id === grocery.storeId);

  if (!store?.searchAddress || !grocery.name) return null;

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
