import { TRPCError } from "@trpc/server";

import type { ResolvedProductLink } from "@norish/shared/contracts";
import { assertHouseholdAccess } from "@norish/auth/permissions";
import {
  createManualProduct,
  getStoreProductById,
  listStoreProducts,
  listStoreProductsByStoreIds,
  resolveProductLink,
  updateManualProduct,
  upsertProductLink,
} from "@norish/db/repositories/store-products";
import { getStoreOwnerId, listStoresByUserIds } from "@norish/db/repositories/stores";
import { trpcLogger as log } from "@norish/shared-server/logger";
import {
  StoreProductLinkInputSchema,
  StoreProductManualCreateSchema,
  StoreProductManualUpdateSchema,
  StoreProductsListInputSchema,
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

/** Every product the household's stores know, so a list can be priced in one round trip. */
const listAllProducts = authedProcedure.query(async ({ ctx }) => {
  const stores = await listStoresByUserIds(ctx.userIds);

  return listStoreProductsByStoreIds(stores.map((store) => store.id));
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
 * Point a grocery name at a product, or away from every product. Last writer
 * wins: the last human to choose is right.
 */
const linkGrocery = authedProcedure
  .input(StoreProductLinkInputSchema)
  .mutation(async ({ ctx, input }): Promise<ResolvedProductLink | null> => {
    await assertStoreAccess(ctx, input.storeId);
    if (input.storeProductId) {
      const product = await getStoreProductById(input.storeProductId);

      if (!product || product.storeId !== input.storeId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found in this store" });
      }
    }

    await upsertProductLink(input.storeId, input.name, input.storeProductId);
    const link = await resolveProductLink(input.storeId, input.name);

    if (link) storeEmitter.emitToHousehold(ctx.householdKey, "linkUpdated", { link });

    return link;
  });

export const storeProductProcedures = router({
  groceryPrices,
  listProducts,
  listAllProducts,
  createProduct,
  updateProduct,
  linkGrocery,
});
