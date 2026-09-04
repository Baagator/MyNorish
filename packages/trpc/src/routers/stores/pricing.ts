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
import { SHELF_PRICE_MAX_AGE_MS } from "@norish/queue/store-lookup/lookup";
import { addStoreMatchJob, addStoreRefreshJob } from "@norish/queue/store-lookup/producer";
import { trpcLogger as log } from "@norish/shared-server/logger";
import { normalizeGroceryName } from "@norish/shared/lib/normalized-name";

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
    const key = `${grocery.storeId}|${normalized}`;

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
export async function noticeGroceries(
  ctx: PricingContext,
  groceries: PriceableGrocery[]
): Promise<ResolvedProductLink[]> {
  const pairs = priceablePairs(groceries);

  if (pairs.length === 0) return [];

  const [links, stores] = await Promise.all([
    resolveProductLinks(pairs),
    listStoresByUserIds(ctx.userIds),
  ]);
  const searchable = new Set(
    stores.filter((store) => store.searchAddress).map((store) => store.id)
  );
  const known = new Set(links.map((link) => `${link.storeId}|${link.normalizedName}`));
  const unknown = pairs.filter(
    (pair) =>
      searchable.has(pair.storeId) &&
      !known.has(`${pair.storeId}|${normalizeGroceryName(pair.name)}`)
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
 * Everything the household's Stores know about the list as it stands, plus a
 * capped nudge for the Shelf Prices that have gone stale. Staleness is noticed
 * while serving the list and nowhere else: a self-hosted instance must never
 * visit a supermarket for a list nobody is shopping.
 */
export async function priceTheList(ctx: PricingContext): Promise<ResolvedProductLink[]> {
  const groceries = await listGroceriesByUsers(ctx.userIds, { includeDone: true });
  const links = await noticeGroceries(ctx, groceries);
  const productIds = links
    .map((link) => link.product?.id)
    .filter((id): id is string => id !== undefined);

  if (productIds.length === 0) return links;

  const stale = await listStaleProducts(productIds, new Date(Date.now() - SHELF_PRICE_MAX_AGE_MS));

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
