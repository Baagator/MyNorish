import type { ReactNode } from "react";
import { createContext, createElement, useContext, useMemo, useState } from "react";

import type {
  StoreCreateDto,
  StoreDto,
  StoreProductDto,
  StoreSearchAddressResult,
} from "@norish/shared/contracts";

import type {
  StoreGrocerySnapshot,
  StorePricesResult,
  StoresMutationsResult,
  StoresQueryResult,
  StoreUpdateDraft,
} from "../../hooks/stores";

export type StoresContextValue = {
  // Data
  stores: StoreDto[];
  isLoading: boolean;
  createStore: (data: StoreCreateDto) => Promise<string>;
  updateStore: (data: StoreUpdateDraft) => void;
  deleteStore: (
    storeId: string,
    deleteGroceries: boolean,
    grocerySnapshot: StoreGrocerySnapshot
  ) => void;
  reorderStores: (storeIds: string[]) => void;
  checkSearchAddress: (storeId: string, term: string | null) => Promise<StoreSearchAddressResult>;
  // Prices
  /** The Store Product a grocery resolves to, or null where its Store answered with a Miss. */
  priceFor: (storeId: string | null, name: string | null) => StoreProductDto | null;
  /** Whether the grocery's Store has any answer for this name yet. */
  hasAnswer: (storeId: string | null, name: string | null) => boolean;
  // UI
  storeManagerOpen: boolean;
  setStoreManagerOpen: (open: boolean) => void;
};

type CreateStoresContextOptions = {
  useStoresQuery: () => StoresQueryResult;
  useStoresMutations: () => StoresMutationsResult;
  useStoresSubscription: () => void;
  /** Prices are a web surface for now; a client that has none passes neither. */
  useStorePrices?: () => StorePricesResult;
  useStorePricesSubscription?: () => void;
};

const useNoPrices = (): StorePricesResult => ({
  priceFor: () => null,
  hasAnswer: () => false,
  isLoading: false,
});
const useNoPricesSubscription = () => undefined;

export function createStoresContext({
  useStoresQuery,
  useStoresMutations,
  useStoresSubscription,
  useStorePrices = useNoPrices,
  useStorePricesSubscription = useNoPricesSubscription,
}: CreateStoresContextOptions) {
  const StoresContext = createContext<StoresContextValue | null>(null);

  function StoresContextProvider({ children }: { children: ReactNode }) {
    // Data hooks
    const { stores, isLoading } = useStoresQuery();
    const storeMutations = useStoresMutations();

    // Subscribe to WebSocket events (updates query cache via internal cache helpers)
    useStoresSubscription();

    // A price a housemate just linked lands here without a reload.
    const { priceFor, hasAnswer } = useStorePrices();

    useStorePricesSubscription();

    // UI State
    const [storeManagerOpen, setStoreManagerOpen] = useState(false);

    const value = useMemo<StoresContextValue>(
      () => ({
        stores,
        isLoading,
        ...storeMutations,
        priceFor,
        hasAnswer,
        storeManagerOpen,
        setStoreManagerOpen,
      }),
      [stores, isLoading, storeMutations, priceFor, hasAnswer, storeManagerOpen]
    );

    return createElement(StoresContext.Provider, { value }, children);
  }

  function useStoresContext() {
    const ctx = useContext(StoresContext);

    if (!ctx) throw new Error("useStoresContext must be used within StoresContextProvider");

    return ctx;
  }

  return {
    StoresContextProvider,
    useStoresContext,
  };
}
