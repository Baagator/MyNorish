import { createSelectSchema } from "drizzle-zod";
import z from "zod";

import { storeProductLinks, storeProducts } from "@norish/db-schema/schema";

import { httpUrlSchema } from "../../lib/schema";
import { clientMintedId } from "./common";

export const StoreProductSelectSchema = createSelectSchema(storeProducts)
  .omit({ createdAt: true, updatedAt: true })
  .extend({
    price: z.coerce.number(),
    pageUrl: z.string().nullable(),
    size: z.string().nullable(),
  });

export const StoreProductLinkSelectSchema = createSelectSchema(storeProductLinks).omit({
  createdAt: true,
  updatedAt: true,
});

/** A currency as a page or a person states it: three letters, upper case. */
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

/** A product read from a shop page: the page is what makes it the same product. */
export const StoreProductReadingSchema = z.object({
  storeId: z.uuid(),
  name: z.string().min(1).max(300),
  pageUrl: httpUrlSchema,
  price: z.number().nonnegative(),
  currency: CurrencyCodeSchema,
  size: z.string().max(80).nullish(),
});

/** A Store Product someone typed, for a shop Norish cannot read. */
export const StoreProductManualCreateSchema = z.object({
  id: clientMintedId,
  storeId: z.uuid(),
  name: z.string().min(1).max(300),
  price: z.number().nonnegative(),
  currency: CurrencyCodeSchema,
  size: z.string().max(80).nullish(),
});

export const StoreProductManualUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(300).optional(),
  price: z.number().nonnegative().optional(),
  currency: CurrencyCodeSchema.optional(),
  size: z.string().max(80).nullish(),
});

/** Pointing a grocery name at a product, or away from every product. */
export const StoreProductLinkInputSchema = z.object({
  storeId: z.uuid(),
  name: z.string().min(1).max(300),
  storeProductId: z.uuid().nullable(),
});

export const StoreProductsListInputSchema = z.object({ storeId: z.uuid() });
