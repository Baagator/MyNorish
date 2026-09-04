import type { TypedRedisEmitter } from "@norish/shared-server/redis/pubsub";
import type { ResolvedProductLink, StoreDto, StoreProductDto } from "@norish/shared/contracts";
import { createTypedEmitter } from "@norish/shared-server/redis/pubsub";

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

declare global {
  var __storeEmitter__: TypedRedisEmitter<StoreSubscriptionEvents> | undefined;
}

export const storeEmitter: TypedRedisEmitter<StoreSubscriptionEvents> =
  globalThis.__storeEmitter__ ||
  (globalThis.__storeEmitter__ = createTypedEmitter<StoreSubscriptionEvents>("store"));
