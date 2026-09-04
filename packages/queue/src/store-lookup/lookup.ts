/**
 * What the store lookup queue actually does, with no BullMQ in sight: ask a
 * shop what a grocery name means there, and re-read a Shelf Price that has
 * gone stale. Every outbound request goes through `paceStoreVisit`, which is
 * the only thing standing between a household's shopping list and somebody
 * else's supermarket.
 */
import type { StoreCandidate, StoreProductDto } from "@norish/shared/contracts";
import {
  listStaleProducts,
  resolveProductLink,
  upsertProductLink,
  upsertReadProduct,
} from "@norish/db/repositories/store-products";
import { getStoreById } from "@norish/db/repositories/stores";
import { createLogger } from "@norish/shared-server/logger";
import { storeEmitter } from "@norish/shared-server/realtime/stores";
import { resolveSearchAddress } from "@norish/shared/lib/search-address";

import { requireQueueApiHandler } from "../api-handlers";
import { chooseCandidate } from "./match";
import { paceStoreVisit, visitKey } from "./pace";

const log = createLogger("queue:store-lookup");

/** A Shelf Price older than this is worth asking the shop about again. */
export const SHELF_PRICE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function priced(candidates: StoreCandidate[]): StoreCandidate[] {
  return candidates.filter(
    (candidate) => candidate.price !== undefined && candidate.currency !== undefined
  );
}

async function announceLink(householdKey: string, storeId: string, name: string): Promise<void> {
  const link = await resolveProductLink(storeId, name);

  if (link) storeEmitter.emitToHousehold(householdKey, "linkUpdated", { link });
}

function announceProduct(householdKey: string, product: StoreProductDto): void {
  storeEmitter.emitToHousehold(householdKey, "productUpdated", { product });
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

  const fetchStorePage = requireQueueApiHandler("fetchStorePage");
  const readSearchResults = requireQueueApiHandler("readSearchResults");
  const readProduct = requireQueueApiHandler("readProduct");

  await input.onStep?.("searching");
  const searchUrl = resolveSearchAddress(store.searchAddress, name);
  const results = await paceStoreVisit(visitKey(searchUrl), () =>
    fetchStorePage(searchUrl, (html) => priced(readSearchResults(html, searchUrl)).length === 0)
  );

  if (!results.html) {
    log.info({ storeId, name }, "The shop did not answer a lookup");
    await upsertProductLink(storeId, name, null);
    await announceLink(householdKey, storeId, name);

    return { matched: false };
  }

  const candidates = priced(readSearchResults(results.html, searchUrl));
  const chosen = chooseCandidate(candidates, name);

  if (!chosen || chosen.price === undefined || chosen.currency === undefined) {
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
  const stale = await listStaleProducts(
    input.productIds,
    new Date(now.getTime() - SHELF_PRICE_MAX_AGE_MS)
  );

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
