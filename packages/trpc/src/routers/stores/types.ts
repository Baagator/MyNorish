import type { ResolvedProductLink, StoreDto, StoreProductDto } from "@norish/shared/contracts";

export type StoreSubscriptionEvents = {
  created: { store: StoreDto };
  updated: { store: StoreDto };
  deleted: { storeId: string; deletedGroceryIds: string[] };
  reordered: { stores: StoreDto[] };
  /** A Store Product read, typed or refreshed; merged by product id. */
  productUpdated: { product: StoreProductDto };
  /** What a Store now knows a name means; merged by store and normalized name. */
  linkUpdated: { link: ResolvedProductLink };
};
