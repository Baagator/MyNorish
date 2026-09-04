"use client";

import { useMemo } from "react";
import { useTRPC } from "@/app/providers/trpc-provider";
import { useUnitsQuery } from "@/hooks/config/use-units-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { StoreProductChoice } from "@norish/shared/contracts";
import { parseIngredientWithDefaults } from "@norish/shared/lib/helpers";

/** A shop is asked once for a term; re-opening the picker is not a second visit. */
const SEARCH_STALE_MS = 5 * 60 * 1000;

/**
 * The grocery's name as the server will store it. The Product Link is keyed by
 * that name, so the picker must ask about "oude kaas" and not "2 kg oude kaas".
 */
export function useParsedGroceryName(raw: string): string {
  const { units } = useUnitsQuery();

  return useMemo(() => {
    const trimmed = raw.trim();

    if (!trimmed) return "";

    return parseIngredientWithDefaults(trimmed, units)[0]?.description ?? trimmed;
  }, [raw, units]);
}

export function useShopSearch(storeId: string | null, term: string, enabled: boolean) {
  const trpc = useTRPC();

  // The input is only ever sent when both parts are real; the placeholders
  // below satisfy the input's type while the query is disabled.
  return useQuery(
    trpc.stores.searchShop.queryOptions(
      { storeId: storeId ?? "", term: term.trim() },
      { enabled: enabled && Boolean(storeId) && term.trim().length > 0, staleTime: SEARCH_STALE_MS }
    )
  );
}

/**
 * What this Store has learned this grocery name means. The list's own prices
 * answer only for the Store each grocery sits under, so a panel where the
 * shopper has selected another Store reads its link here instead.
 */
export function useProductLink(storeId: string | null, name: string) {
  const trpc = useTRPC();
  const term = name.trim();

  return useQuery(
    trpc.stores.linkFor.queryOptions(
      { storeId: storeId ?? "", name: term },
      { enabled: Boolean(storeId) && term.length > 0, staleTime: SEARCH_STALE_MS }
    )
  );
}

export function useStoreProducts(storeId: string | null, enabled: boolean) {
  const trpc = useTRPC();

  return useQuery(
    trpc.stores.listProducts.queryOptions(
      { storeId: storeId ?? "" },
      { enabled: enabled && Boolean(storeId) }
    )
  );
}

/**
 * Write what the picker decided. Nothing calls this until the grocery panel's
 * own Save or Add: tapping around in a picker never changes what the
 * household sees.
 */
export function useChooseProduct() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.stores.chooseProduct.mutationOptions());
  const pricesKey = trpc.stores.groceryPrices.queryKey();

  return (storeId: string, name: string, choice: StoreProductChoice) =>
    mutation
      .mutateAsync({ storeId, name, choice })
      .then(() => queryClient.invalidateQueries({ queryKey: pricesKey }))
      .catch(() => queryClient.invalidateQueries({ queryKey: pricesKey }));
}
