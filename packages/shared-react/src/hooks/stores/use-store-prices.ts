import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";

import type { ResolvedProductLink, StoreProductDto } from "@norish/shared/contracts";
import { normalizeGroceryName, productLinkKey } from "@norish/shared/lib/normalized-name";

import type { CreateStoresHooksOptions } from "./types";

export type StorePricesData = ResolvedProductLink[];

/** What a Store knows about one grocery name; the key every merge here uses. */
export function priceKey(storeId: string | null, name: string | null): string | null {
  const normalized = normalizeGroceryName(name);

  return storeId && normalized ? productLinkKey(storeId, normalized) : null;
}

/** The same key, for a link that already carries its normalized name. */
function linkKey(link: Pick<ResolvedProductLink, "storeId" | "normalizedName">): string {
  return productLinkKey(link.storeId, link.normalizedName);
}

export interface StorePricesResult {
  /** The Store Product a grocery resolves to, or null where the Store knows it as a Miss. */
  priceFor: (storeId: string | null, name: string | null) => StoreProductDto | null;
  isLoading: boolean;
}

export function createUseStorePrices({ useTRPC }: CreateStoresHooksOptions) {
  return function useStorePrices(): StorePricesResult {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery(trpc.stores.groceryPrices.queryOptions());
    const byKey = useMemo(() => {
      const map = new Map<string, ResolvedProductLink>();

      for (const link of data ?? []) map.set(linkKey(link), link);

      return map;
    }, [data]);

    const priceFor = useCallback(
      (storeId: string | null, name: string | null) => {
        const key = priceKey(storeId, name);

        return key ? (byKey.get(key)?.product ?? null) : null;
      },
      [byKey]
    );

    return { priceFor, isLoading };
  };
}

/**
 * Prices land on every screen in the household, not just the one that asked.
 * Both handlers are idempotent merges by identity — a product by its id, a
 * link by its store and normalized name — so the actor's own echo is a no-op
 * and no echo suppression is needed anywhere.
 */
export function createUseStorePricesSubscription({ useTRPC }: CreateStoresHooksOptions) {
  return function useStorePricesSubscription() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const queryKey = trpc.stores.groceryPrices.queryKey();

    const setPrices = useCallback(
      (updater: (prev: StorePricesData) => StorePricesData) => {
        queryClient.setQueryData<StorePricesData>(queryKey, (prev) => updater(prev ?? []));
      },
      [queryClient, queryKey]
    );

    useSubscription(
      trpc.stores.onProductUpdated.subscriptionOptions(undefined, {
        // Typed as the transport hands it over, like every other store handler.
        onData: ({ payload }: any) => {
          const product = payload.product as StoreProductDto;

          setPrices((prev) =>
            prev.map((link) => (link.product?.id === product.id ? { ...link, product } : link))
          );
        },
      })
    );

    useSubscription(
      trpc.stores.onLinkUpdated.subscriptionOptions(undefined, {
        onData: ({ payload }: any) => {
          const updated = payload.link as ResolvedProductLink;

          setPrices((prev) => {
            const key = linkKey(updated);
            const without = prev.filter((link) => linkKey(link) !== key);

            return [...without, updated];
          });
        },
      })
    );
  };
}
