"use client";

import { useStoresContext } from "@/app/(app)/groceries/stores-context";
import { usePackSizeWords } from "@/hooks/stores/use-pack-size-words";
import { useUnitFormatter } from "@/hooks/use-unit-formatter";
import { formatPackSize, formatShelfPrice } from "@/lib/format-price";
import { Chip, Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import { groupLineCost } from "@norish/shared/lib/line-cost";
import { packSizeOf } from "@norish/shared/lib/pack-size";
import { isPendingLink } from "@norish/shared/lib/product-link";
import { saleRegularPrice } from "@norish/shared/lib/sale";

import type { PricedLine } from "./store-total";

/**
 * What this row costs at its Store: the Line Cost, then the packs it counted
 * — `€5.98 · 2 × 500 gram`, in the shop's own size words for a read pack and
 * Norish's for a hand-set one; one pack reads as the Shelf Price and the
 * size, and a line priced by weight reads the cost and the weight priced.
 * Underneath, which of the shop's products that is, and, where the amount
 * could not be reconciled with the Pack Size, a quiet note that one pack
 * was counted; the fix is the Pack Size editor in the panel.
 *
 * A Sale is what the shop presents: the regular Line Cost struck through
 * beside the Line Cost, a badge, and the shop's own words for the deal after
 * the product name — on Sale or not, because "2 voor €5.50" is something to
 * act on at the shelf even though it is never worked into the number.
 *
 * While the Store is still being asked — a Pending Link — the row shows a
 * loader where the price would be and no words: waiting must read as waiting
 * and not as failure, and it must read the same on every screen in the
 * household, which it does because the link itself is what says so.
 *
 * It reads and nothing more. Which product a Grocery is is a field of the
 * grocery panel, which the row already opens.
 */
export function GroceryPrice({ line }: { line: PricedLine }) {
  const { linkFor } = useStoresContext();
  const locale = useLocale();
  const t = useTranslations("groceries.price");
  const { formatAmountUnit } = useUnitFormatter();
  const packWords = usePackSizeWords();
  const link = linkFor(line.storeId, line.name);

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
  const pack = packSizeOf(product);
  const cost = groupLineCost(line.amounts, { price: product.price, pack });
  // The regular Line Cost: the same packs at the price the shop struck through.
  const regularPrice = saleRegularPrice(product.price, product.regularPrice);
  const regular =
    regularPrice === null ? null : groupLineCost(line.amounts, { price: regularPrice, pack }).cost;
  // The shop's own words for a pack it read; Norish's for one set by hand.
  const size =
    product.packByHand && pack ? formatPackSize(pack, packWords) : (product.size ?? null);
  const detail = cost.byWeight
    ? cost.quantity
      ? formatAmountUnit(cost.quantity.amount, cost.quantity.unit)
      : size
    : cost.packs > 1
      ? t("packs", { count: cost.packs, size: size ?? "" }).trim()
      : size;

  return (
    <span
      className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right"
      data-grocery-packs={cost.packs}
      data-grocery-price={product.id}
      data-testid="grocery-price"
    >
      <span className="text-foreground flex items-center gap-1.5 text-sm tabular-nums">
        <span data-testid="grocery-line-cost">
          {formatShelfPrice(locale, cost.cost, product.currency)}
          {regular !== null && (
            <s
              aria-label={t("regularPrice", {
                price: formatShelfPrice(locale, regular, product.currency),
              })}
              className="text-muted ml-1.5"
              data-testid="grocery-regular-cost"
            >
              {formatShelfPrice(locale, regular, product.currency)}
            </s>
          )}
          {detail ? ` · ${detail}` : ""}
        </span>
        {regular !== null && (
          <Chip color="accent" data-testid="grocery-sale" size="sm" variant="soft">
            {t("sale")}
          </Chip>
        )}
      </span>
      <span className="text-muted w-full truncate text-xs" data-testid="grocery-product">
        {product.name}
        {product.dealWords ? (
          <span data-testid="grocery-deal-words">{` · ${product.dealWords}`}</span>
        ) : null}
        {cost.matched ? "" : <span data-testid="grocery-one-pack">{` · ${t("onePack")}`}</span>}
      </span>
    </span>
  );
}
