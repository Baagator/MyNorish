"use client";

import { useCallback, useEffect, useState } from "react";

import type { StoreDto, StoreProductChoice } from "@norish/shared/contracts";

import { useChooseProduct, useParsedGroceryName } from "./use-store-picker";
import { useStorePrices } from "./use-store-prices";

/**
 * Which of a shop's products a Grocery is, as the grocery panel holds it.
 *
 * Both grocery panels hold exactly this, and both must agree: the field reads
 * whatever the grocery is linked to now, a selection is visible immediately,
 * and it is written only on the panel's own Save or Add, against the name the
 * grocery is saved under, because the Product Link is keyed by that name.
 */
export function useProductChoice(options: {
  /** The raw text of the panel's own field: "2 kg oude kaas". */
  itemName: string;
  stores: StoreDto[];
  selectedStoreId: string | null;
  /** Reopened, or opened on a different grocery: the held choice is not that grocery's. */
  resetOn?: unknown;
}) {
  const { itemName, stores, selectedStoreId } = options;
  const [choice, setChoice] = useState<StoreProductChoice | null>(null);
  const chooseProduct = useChooseProduct();
  const { priceFor } = useStorePrices();
  const groceryName = useParsedGroceryName(itemName);
  const store = stores.find((candidate) => candidate.id === selectedStoreId) ?? null;
  const linked = priceFor(selectedStoreId, groceryName);

  useEffect(() => {
    setChoice(null);
  }, [options.resetOn]);

  const commit = useCallback(() => {
    if (!choice || !selectedStoreId || !groceryName) return;
    // An untouched field has nothing to say: only a choice the user actually
    // made is written, and never over the same product it already pointed at.
    if (choice.kind === "product" && choice.storeProductId === linked?.id) return;
    void chooseProduct(selectedStoreId, groceryName, choice);
    setChoice(null);
  }, [choice, chooseProduct, groceryName, linked?.id, selectedStoreId]);

  return {
    choice,
    setChoice,
    groceryName,
    store,
    /** What this grocery is linked to now, if anything. */
    linkedProduct: linked,
    /** Whether this Store's shop can be asked what the grocery costs. */
    canPick: Boolean(store?.searchAddress) && groceryName.length > 0,
    commit,
  };
}
