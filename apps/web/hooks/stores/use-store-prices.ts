"use client";

import { sharedStoresHooks } from "./shared-stores-hooks";

export const useStorePrices = sharedStoresHooks.useStorePrices;
export const useStorePricesSubscription = sharedStoresHooks.useStorePricesSubscription;

export { priceKey, type StorePricesResult } from "@norish/shared-react/hooks";
