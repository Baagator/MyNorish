/**
 * Pricing a shopping list. A Grocery is priced through the Store it sits
 * under: `(store, normalized name)` resolves to a Product Link, and the link
 * to a Store Product with a Shelf Price. A name the Store already knows costs
 * nothing — no shop is visited — and a name it does not goes to the always-on
 * lookup queue, so adding a grocery never waits on a supermarket.
 */
import type { GroceryDto, ResolvedProductLink } from "@norish/shared/contracts";
import { listGroceriesByUsers } from "@norish/db/repositories/groceries";
import { listStaleProducts, resolveProductLinks } from "@norish/db/repositories/store-products";
import { listStoresByUserIds } from "@norish/db/repositories/stores";
import { getQueues } from "@norish/queue/registry";
import { staleBefore } from "@norish/queue/store-lookup/lookup";
import { addStoreMatchJob, addStoreRefreshJob } from "@norish/queue/store-lookup/producer";
import { trpcLogger as log } from "@norish/shared-server/logger";
import { storeEmitter } from "@norish/shared-server/realtime/stores";
import { normalizeGroceryName, productLinkKey } from "@norish/shared/lib/normalized-name";

/**
 * How many stale prices one page view is allowed to send to the shops. A list
 * of eighty groceries must not become eighty visits because somebody opened it.
 */
const MAX_REFRESHED_PER_VIEW = 10;

type PriceableGrocery = Pick<GroceryDto, "name" | "storeId">;

interface PricingContext {
  userIds: string[];
  householdKey: string;
}

function priceablePairs(groceries: PriceableGrocery[]): { storeId: string; name: string }[] {
  const seen = new Set<string>();

  return groceries.flatMap((grocery) => {
    const name = grocery.name?.trim();
    const normalized = normalizeGroceryName(name);

    if (!grocery.storeId || !name || !normalized) return [];
    const key = productLinkKey(grocery.storeId, normalized);

    if (seen.has(key)) return [];
    seen.add(key);

    return [{ storeId: grocery.storeId, name }];
  });
}

/**
 * What the household's Stores already know about these groceries, and a
 * lookup job for every name they do not. A Miss counts as knowing: a name no
 * shop stocks is not searched again every time the list is opened.
 */
async function resolveAndQueue(
  ctx: PricingContext,
  groceries: PriceableGrocery[]
): Promise<ResolvedProductLink[]> {
  const pairs = priceablePairs(groceries);

  if (pairs.length === 0) return [];

  const stores = await listStoresByUserIds(ctx.userIds);
  // A grocery is priced through a Store of its own household and no other:
  // a store id that is not the household's is not a question for any shop,
  // and its links are not this household's to read.
  const own = new Set(stores.map((store) => store.id));
  const ownPairs = pairs.filter((pair) => own.has(pair.storeId));

  if (ownPairs.length === 0) return [];
  const links = await resolveProductLinks(ownPairs);
  const searchable = new Set(
    stores.filter((store) => store.searchAddress).map((store) => store.id)
  );
  const known = new Set(links.map((link) => productLinkKey(link.storeId, link.normalizedName)));
  const unknown = ownPairs.filter(
    (pair) =>
      searchable.has(pair.storeId) &&
      !known.has(productLinkKey(pair.storeId, normalizeGroceryName(pair.name)))
  );

  if (unknown.length > 0) {
    const queue = getQueues().storeLookup;

    await Promise.all(
      unknown.map((pair) =>
        addStoreMatchJob(queue, {
          kind: "match",
          storeId: pair.storeId,
          name: pair.name,
          householdKey: ctx.householdKey,
        }).catch((err: unknown) => {
          log.error({ err, storeId: pair.storeId }, "Failed to enqueue a store lookup");
        })
      )
    );
  }

  return links;
}

/**
 * A Grocery has just been created, renamed, or moved to another Store. What
 * its Store already knows is pushed to the household there and then, so a
 * known name is priced on the screen in the same breath and with no outbound
 * request; a name the Store does not know goes to the lookup queue instead.
 */
export async function noticeGroceries(
  ctx: PricingContext,
  groceries: PriceableGrocery[]
): Promise<ResolvedProductLink[]> {
  const links = await resolveAndQueue(ctx, groceries);

  for (const link of links) {
    storeEmitter.emitToHousehold(ctx.householdKey, "linkUpdated", { link });
  }

  return links;
}

/**
 * Everything the household's Stores know about the list as it stands, plus a
 * capped nudge for the Shelf Prices that have gone stale. Staleness is noticed
 * while serving the list and nowhere else: a self-hosted instance must never
 * visit a supermarket for a list nobody is shopping.
 */
export async function priceTheList(ctx: PricingContext): Promise<ResolvedProductLink[]> {
  const groceries = await listGroceriesByUsers(ctx.userIds, { includeDone: true });
  // The list is the answer here; nothing is announced, because everyone
  // reading it is asking for exactly this.
  const links = await resolveAndQueue(ctx, groceries);
  const productIds = links
    .map((link) => link.product?.id)
    .filter((id): id is string => id !== undefined);

  if (productIds.length === 0) return links;

  const stale = await listStaleProducts(productIds, staleBefore());

  if (stale.length === 0) return links;

  const byStore = new Map<string, string[]>();

  for (const product of stale.slice(0, MAX_REFRESHED_PER_VIEW)) {
    byStore.set(product.storeId, [...(byStore.get(product.storeId) ?? []), product.id]);
  }

  const queue = getQueues().storeLookup;

  await Promise.all(
    [...byStore.entries()].map(([storeId, ids]) =>
      addStoreRefreshJob(queue, {
        kind: "refresh",
        storeId,
        productIds: ids,
        householdKey: ctx.householdKey,
      }).catch((err: unknown) => {
        log.error({ err, storeId }, "Failed to enqueue a Shelf Price refresh");
      })
    )
  );

  return links;
}
