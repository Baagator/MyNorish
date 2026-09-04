import { TRPCError } from "@trpc/server";

import type { ResolvedProductLink, StoreCandidate } from "@norish/shared/contracts";
import { assertHouseholdAccess } from "@norish/auth/permissions";
import {
  createManualProduct,
  getStoreProductById,
  listStoreProducts,
  resolveProductLink,
  updateManualProduct,
  upsertProductLink,
  upsertReadProduct,
} from "@norish/db/repositories/store-products";
import { getStoreById, getStoreOwnerId } from "@norish/db/repositories/stores";
import { searchStore } from "@norish/queue/store-lookup/lookup";
import { trpcLogger as log } from "@norish/shared-server/logger";
import {
  StoreProductChoiceSchema,
  StoreProductManualCreateSchema,
  StoreProductManualUpdateSchema,
  StoreProductsListInputSchema,
  StoreShopSearchSchema,
} from "@norish/shared/contracts/zod";

import type { StoreProcedureContext } from "./stores-helpers";
import { authedProcedure } from "../../middleware";
import { router } from "../../trpc";
import { storeEmitter } from "./emitter";
import { priceTheList } from "./pricing";

/** A Store belongs to one household; its products and links follow it exactly. */
async function assertStoreAccess(ctx: StoreProcedureContext, storeId: string): Promise<void> {
  const ownerId = await getStoreOwnerId(storeId);

  if (!ownerId) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  await assertHouseholdAccess(ctx.user.id, ownerId);
}

const listProducts = authedProcedure
  .input(StoreProductsListInputSchema)
  .query(async ({ ctx, input }) => {
    await assertStoreAccess(ctx, input.storeId);

    return listStoreProducts(input.storeId);
  });

/**
 * What every Grocery on the household's list costs, as its Store last knew.
 * Read on the list, so staleness is noticed exactly where somebody is
 * shopping and nowhere else.
 */
const groceryPrices = authedProcedure.query(async ({ ctx }) => priceTheList(ctx));

const createProduct = authedProcedure
  .input(StoreProductManualCreateSchema)
  .mutation(async ({ ctx, input }) => {
    await assertStoreAccess(ctx, input.storeId);

    const product = await createManualProduct(input);

    log.info({ userId: ctx.user.id, storeId: input.storeId }, "By-hand store product created");
    storeEmitter.emitToHousehold(ctx.householdKey, "productUpdated", { product });

    return product;
  });

const updateProduct = authedProcedure
  .input(StoreProductManualUpdateSchema)
  .mutation(async ({ ctx, input }) => {
    const existing = await getStoreProductById(input.id);

    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
    await assertStoreAccess(ctx, existing.storeId);

    const product = await updateManualProduct(input);

    if (!product) {
      // A product read from a page keeps what the page said; only a by-hand
      // price is a person's to change.
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Only a by-hand product can be edited",
      });
    }
    storeEmitter.emitToHousehold(ctx.householdKey, "productUpdated", { product });

    return product;
  });

/**
 * Search a Store's own shop for a term the user chose, and offer what it
 * answers. The visit is paced through the same chain the lookup queue uses,
 * so the picker cannot race the queue at the same shop.
 */
const searchShop = authedProcedure
  .input(StoreShopSearchSchema)
  .query(async ({ ctx, input }): Promise<{ candidates: StoreCandidate[] }> => {
    await assertStoreAccess(ctx, input.storeId);
    const store = await getStoreById(input.storeId);

    if (!store?.searchAddress) return { candidates: [] };

    // The same paced visit the lookup queue makes, so the picker cannot race
    // the queue at the same shop.
    const { candidates } = await searchStore(store.searchAddress, input.term);

    log.info(
      { userId: ctx.user.id, storeId: input.storeId, count: candidates.length },
      "Searched a shop for the picker"
    );

    return { candidates };
  });

/**
 * What the picker decided a grocery name means. Nothing is written until the
 * grocery panel's own Save calls this: tapping around in a picker never
 * changes what the household sees. Last writer wins — the last human to
 * choose is right.
 */
const chooseProduct = authedProcedure
  .input(StoreProductChoiceSchema)
  .mutation(async ({ ctx, input }): Promise<ResolvedProductLink | null> => {
    await assertStoreAccess(ctx, input.storeId);

    let storeProductId: string | null = null;

    if (input.choice.kind === "product") {
      const product = await getStoreProductById(input.choice.storeProductId);

      if (!product || product.storeId !== input.storeId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found in this store" });
      }
      storeProductId = product.id;
    }

    if (input.choice.kind === "candidate") {
      const { candidate } = input.choice;
      const product = await upsertReadProduct({
        storeId: input.storeId,
        name: candidate.name,
        pageUrl: candidate.url,
        price: candidate.price,
        currency: candidate.currency,
        size: candidate.size ?? null,
      });

      storeProductId = product.id;
      storeEmitter.emitToHousehold(ctx.householdKey, "productUpdated", { product });
    }

    if (input.choice.kind === "manual") {
      const product = await createManualProduct({
        id: input.choice.id,
        storeId: input.storeId,
        name: input.choice.name,
        price: input.choice.price,
        currency: input.choice.currency,
        size: input.choice.size ?? null,
      });

      storeProductId = product.id;
      storeEmitter.emitToHousehold(ctx.householdKey, "productUpdated", { product });
    }

    await upsertProductLink(input.storeId, input.name, storeProductId);
    const link = await resolveProductLink(input.storeId, input.name);

    if (link) storeEmitter.emitToHousehold(ctx.householdKey, "linkUpdated", { link });

    return link;
  });

export const storeProductProcedures = router({
  groceryPrices,
  listProducts,
  createProduct,
  updateProduct,
  searchShop,
  chooseProduct,
});
