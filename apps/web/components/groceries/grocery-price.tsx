"use client";

import { useStoresContext } from "@/app/(app)/groceries/stores-context";
import { formatShelfPrice } from "@/lib/format-price";
import { Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { GroceryDto } from "@norish/shared/contracts";
import { isPendingLink } from "@norish/shared/lib/product-link";

/**
 * What one pack of this grocery costs at its Store, as the shop last stated
 * it, and which of the shop's products that price is for. There is no age line
 * — at a twelve-hour ceiling the age is never interesting.
 *
 * While the Store is still being asked — a Pending Link — the row shows a
 * loader where the price would be and no words: waiting must read as waiting
 * and not as failure, and it must read the same on every screen in the
 * household, which it does because the link itself is what says so.
 *
 * It reads and nothing more. Which product a Grocery is is a field of the
 * grocery panel, which the row already opens.
 */
export function GroceryPrice({ grocery }: { grocery: GroceryDto }) {
  const { linkFor } = useStoresContext();
  const locale = useLocale();
  const t = useTranslations("groceries.price");
  const link = linkFor(grocery.storeId, grocery.name);

  if (!link) return null;
  if (isPendingLink(link)) {
    return (
      <span className="flex shrink-0 items-center justify-end" data-testid="grocery-price-pending">
        <Spinner aria-label={t("pending")} className="text-muted" color="current" size="sm" />
      </span>
    );
  }

  const product = link.product;

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
