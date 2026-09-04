"use client";

import { useCallback, useEffect, useState } from "react";

import type { StoreDto, StoreProductChoice } from "@norish/shared/contracts";

import { useChooseProduct, useParsedGroceryName } from "./use-store-picker";

/**
 * The grocery panel's price stage: which stage it is showing, what the picker
 * has been told, and the one place that writes it.
 *
 * Both grocery panels hold exactly this, and both must agree: a selection is
 * visible immediately and written only on the panel's own Save or Add, against
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
  const groceryName = useParsedGroceryName(itemName);
  const store = stores.find((candidate) => candidate.id === selectedStoreId) ?? null;

  useEffect(() => {
    setStage(initialStage);
    setChoice(null);
  }, [initialStage, options.resetOn]);

  const commit = useCallback(() => {
    if (!choice || !selectedStoreId || !groceryName) return;
    void chooseProduct(selectedStoreId, groceryName, choice);
    setChoice(null);
    setStage("form");
  }, [choice, chooseProduct, groceryName, selectedStoreId]);

  return {
    stage,
    choice,
    setChoice,
    groceryName,
    store,
    /** Whether this Store's shop can be asked what the grocery costs. */
    canPick: Boolean(store?.searchAddress) && groceryName.length > 0,
    openPicker: () => setStage("picker"),
    closePicker: () => setStage("form"),
    commit,
  };
}
