"use client";

import { useCallback, useEffect, useState } from "react";

import type { StoreDto, StoreProductChoice } from "@norish/shared/contracts";

import { useStorePrices } from "./use-store-prices";
import { useChooseProduct, useParsedGroceryName } from "./use-store-picker";

/**
 * The grocery panel's price stage: which stage it is showing, what the picker
 * has been told, and the one place that writes it.
 *
 * Both grocery panels hold exactly this, and both must agree: the stage opens
 * on whatever the grocery is linked to now, a selection is visible
 * immediately, and it is written only on the panel's own Save or Add, against
 * the name the grocery is saved under, because the Product Link is keyed by
 * that name.
 */
export function useProductChoice(options: {
  /** The raw text of the panel's own field: "2 kg oude kaas". */
  itemName: string;
  stores: StoreDto[];
  selectedStoreId: string | null;
  /** Which stage the panel opens on, and what a reset returns to. */
  initialStage?: "form" | "picker";
  /** Reopened, or opened on a different grocery: the held choice is not that grocery's. */
  resetOn?: unknown;
}) {
  const { itemName, stores, selectedStoreId, initialStage = "form" } = options;
  const [stage, setStage] = useState<"form" | "picker">(initialStage);
  const [choice, setChoice] = useState<StoreProductChoice | null>(null);
  const chooseProduct = useChooseProduct();
  const { priceFor } = useStorePrices();
  const groceryName = useParsedGroceryName(itemName);
  const store = stores.find((candidate) => candidate.id === selectedStoreId) ?? null;
  const linked = priceFor(selectedStoreId, groceryName);
  // What is linked now, so the picker opens reading it rather than empty, and
  // so an untouched Save writes nothing.
  const linkedChoice: StoreProductChoice | null = linked
    ? { kind: "product", storeProductId: linked.id }
    : null;

  useEffect(() => {
    setStage(initialStage);
    setChoice(null);
  }, [initialStage, options.resetOn]);

  const held = choice ?? linkedChoice;
  const commit = useCallback(() => {
    if (!choice || !selectedStoreId || !groceryName) return;
    // An untouched picker has nothing to say: only a choice the user actually
    // made is written, and never over the same product it already pointed at.
    if (choice.kind === "product" && choice.storeProductId === linked?.id) return;
    void chooseProduct(selectedStoreId, groceryName, choice);
    setChoice(null);
    setStage("form");
  }, [choice, chooseProduct, groceryName, linked?.id, selectedStoreId]);

  return {
    stage,
    choice: held,
    setChoice,
    groceryName,
    store,
    /** What this grocery is linked to now, if anything. */
    linkedProduct: linked,
    /** Whether this Store's shop can be asked what the grocery costs. */
    canPick: Boolean(store?.searchAddress) && groceryName.length > 0,
    openPicker: () => setStage("picker"),
    closePicker: () => setStage("form"),
    commit,
  };
}
