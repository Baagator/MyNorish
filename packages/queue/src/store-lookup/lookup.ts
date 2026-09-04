/**
 * What the store lookup queue actually does, with no BullMQ in sight: ask a
 * shop what a grocery name means there, and re-read a Shelf Price that has
 * gone stale. Every outbound request goes through `paceStoreVisit`, which is
 * the only thing standing between a household's shopping list and somebody
 * else's supermarket.
 */
import type { StoreProductDto } from "@norish/shared/contracts";
import type { PricedCandidate } from "@norish/shared/lib/currency";
import {
  listStaleProducts,
  resolveProductLink,
  upsertProductLink,
  upsertReadProduct,
} from "@norish/db/repositories/store-products";
import { getStoreById } from "@norish/db/repositories/stores";
import { createLogger } from "@norish/shared-server/logger";
import { storeEmitter } from "@norish/shared-server/realtime/stores";
import { chooseUnmistakable } from "@norish/shared/lib/auto-link";
import { pricedCandidates } from "@norish/shared/lib/currency";
import { resolveSearchAddress } from "@norish/shared/lib/search-address";

import { requireQueueApiHandler } from "../api-handlers";
import { paceStoreVisit, visitKey } from "./pace";

const log = createLogger("queue:store-lookup");

/** A Shelf Price older than this is worth asking the shop about again. */
export const SHELF_PRICE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** The moment a Shelf Price read before is worth asking the shop about again. */
export function staleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - SHELF_PRICE_MAX_AGE_MS);
}

async function announceLink(householdKey: string, storeId: string, name: string): Promise<void> {
  const link = await resolveProductLink(storeId, name);

  if (link) storeEmitter.emitToHousehold(householdKey, "linkUpdated", { link });
}

function announceProduct(householdKey: string, product: StoreProductDto): void {
  storeEmitter.emitToHousehold(householdKey, "productUpdated", { product });
}

/**
 * Search one Store's own shop for a term, paced. The only way anything in
 * Norish visits a shop's search page: the queue's match jobs and the picker's
 * searches share this, and therefore share one pacing chain per host.
 */
export async function searchStore(
  searchAddress: string,
  term: string
): Promise<{ candidates: PricedCandidate[]; answered: boolean }> {
  const fetchStorePage = requireQueueApiHandler("fetchStorePage");
  const readSearchResults = requireQueueApiHandler("readSearchResults");
  const url = resolveSearchAddress(searchAddress, term);
  const visit = await paceStoreVisit(visitKey(url), () =>
    fetchStorePage(url, (html) => pricedCandidates(readSearchResults(html, url)).length === 0)
  );

  if (!visit.html) return { candidates: [], answered: false };

  return { candidates: pricedCandidates(readSearchResults(visit.html, url)), answered: true };
}

/**
 * Ask a Store what a grocery name means there. A shop that answers nothing at
 * all is a Miss for the searched name and nothing more: the job stops rather
 * than retrying inside itself, and no other name is blamed for it.
 */
export async function matchGroceryName(input: {
  storeId: string;
  name: string;
  householdKey: string;
  onStep?: (step: string) => Promise<void>;
}): Promise<{ matched: boolean }> {
  const { storeId, name, householdKey } = input;
  const store = await getStoreById(storeId);

  if (!store?.searchAddress) return { matched: false };

  // The job is only ever queued for a name the Store did not know. By the time
  // it runs a shopper may have said which product this is — through the
  // grocery panel, or from a housemate's screen — and a shopper's answer is
  // the answer. Asking the shop anyway would cost two visits and end by
  // pointing the grocery at something nobody chose.
  const answered = await resolveProductLink(storeId, name);

  if (answered?.product) {
    log.debug({ storeId, name }, "A shopper answered this name while the lookup was queued");

    return { matched: false };
  }

  const fetchStorePage = requireQueueApiHandler("fetchStorePage");
  const readProduct = requireQueueApiHandler("readProduct");

  await input.onStep?.("searching");
  const { candidates, answered: shopAnswered } = await searchStore(store.searchAddress, name);

  if (!shopAnswered) {
    log.info({ storeId, name }, "The shop did not answer a lookup");
    await upsertProductLink(storeId, name, null);
    await announceLink(householdKey, storeId, name);

    return { matched: false };
  }

  const chosen = chooseUnmistakable(candidates, name);

  if (!chosen) {
    log.info({ storeId, name, candidates: candidates.length }, "No unmistakable match; a Miss");
    await upsertProductLink(storeId, name, null);
    await announceLink(householdKey, storeId, name);

    return { matched: false };
  }

  // The results page names the product; its own page states the price to keep.
  await input.onStep?.("reading-product");
  const page = await paceStoreVisit(visitKey(chosen.url), () => fetchStorePage(chosen.url));
  const reading = page.html ? readProduct(page.html, chosen.url) : null;

  await input.onStep?.("saving");
  const product = await upsertReadProduct({
    storeId,
    name: reading?.name ?? chosen.name,
    pageUrl: chosen.url,
    price: reading?.price ?? chosen.price,
    currency: reading?.currency ?? chosen.currency,
    size: reading?.size ?? chosen.size ?? null,
  });

  await upsertProductLink(storeId, name, product.id);
  announceProduct(householdKey, product);
  await announceLink(householdKey, storeId, name);
  log.info({ storeId, name, productId: product.id }, "Linked a grocery name to a Store Product");

  return { matched: true };
}

/**
 * Re-read the Shelf Prices that have gone stale. A by-hand product is never
 * here: nothing read it, and nothing may overwrite what its owner typed.
 */
export async function refreshProducts(input: {
  productIds: string[];
  householdKey: string;
  now?: Date;
}): Promise<{ refreshed: number }> {
  const now = input.now ?? new Date();
  const stale = await listStaleProducts(input.productIds, staleBefore(now));

  if (stale.length === 0) return { refreshed: 0 };

  const fetchStorePage = requireQueueApiHandler("fetchStorePage");
  const readProduct = requireQueueApiHandler("readProduct");
  let refreshed = 0;

  for (const product of stale) {
    const pageUrl = product.pageUrl;

    if (!pageUrl) continue;
    const page = await paceStoreVisit(visitKey(pageUrl), () => fetchStorePage(pageUrl));
    const reading = page.html ? readProduct(page.html, pageUrl) : null;

    if (!reading) {
      log.info({ productId: product.id }, "A stale Shelf Price could not be re-read");
      continue;
    }

    const updated = await upsertReadProduct({
      storeId: product.storeId,
      name: reading.name,
      pageUrl,
      price: reading.price,
      currency: reading.currency,
      size: reading.size ?? null,
    });

    announceProduct(input.householdKey, updated);
    refreshed += 1;
  }

  return { refreshed };
}
