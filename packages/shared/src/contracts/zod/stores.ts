import { createSelectSchema } from "drizzle-zod";
import z from "zod";

import { ingredientStorePreferences, stores } from "@norish/db-schema/schema";

import { httpUrlSchema } from "../../lib/schema";
import { isSearchAddress, SEARCH_ADDRESS_PLACEHOLDER } from "../../lib/search-address";
import { clientMintedId } from "./common";

/** The shop's website: an http(s) address and nothing else. */
export const StoreWebsiteSchema = httpUrlSchema;

/** The shop's search page, carrying the `{query}` slot exactly once. */
export const StoreSearchAddressSchema = z
  .string()
  .refine(
    isSearchAddress,
    `A Search Address is an http address carrying ${SEARCH_ADDRESS_PLACEHOLDER} once`
  );

// Store color options (HeroUI semantic colors + extras)
export const StoreColorSchema = z.enum([
  "primary",
  "secondary",
  "success",
  "warning",
  "danger",
  "slate",
  "sky",
  "violet",
]);

export type StoreColor = z.infer<typeof StoreColorSchema>;

// Store select schema
export const StoreSelectBaseSchema = createSelectSchema(stores).omit({
  createdAt: true,
  updatedAt: true,
});

// Store insert schema (without userId - added server-side)
export const StoreInsertBaseSchema = z.object({
  userId: z.string(),
  name: z.string().min(1, "Store name is required").max(100),
  color: StoreColorSchema.default("primary"),
  icon: z.string().default("ShoppingBagIcon"),
  sortOrder: z.number().int().default(0),
  website: StoreWebsiteSchema.nullish(),
  searchAddress: StoreSearchAddressSchema.nullish(),
});

// Store create schema (tRPC input - no userId)
export const StoreCreateSchema = z.object({
  id: clientMintedId,
  name: z.string().min(1, "Store name is required").max(100),
  color: StoreColorSchema.default("primary"),
  icon: z.string().default("ShoppingBagIcon"),
  website: StoreWebsiteSchema.nullish(),
  searchAddress: StoreSearchAddressSchema.nullish(),
});

// Store update schema
export const StoreUpdateBaseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive().optional(),
  name: z.string().min(1).max(100).optional(),
  color: StoreColorSchema.optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
  website: StoreWebsiteSchema.nullish(),
  searchAddress: StoreSearchAddressSchema.nullish(),
});

// Store update input schema (tRPC)
export const StoreUpdateInputSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  color: StoreColorSchema.optional(),
  icon: z.string().optional(),
  website: StoreWebsiteSchema.nullish(),
  searchAddress: StoreSearchAddressSchema.nullish(),
});

// Asking a Store's shop whether its Search Address works, with the user's own term
export const StoreSearchAddressCheckSchema = z.object({
  storeId: z.uuid(),
  term: z.string().max(200).nullish(),
  /**
   * The address the client just saved. A store update is optimistic and may
   * still be in flight, so without this the check can probe the address the
   * user has just replaced.
   */
  searchAddress: StoreSearchAddressSchema.nullish(),
});

// Store delete schema with snapshot-based grocery handling
export const StoreDeleteSchema = z.object({
  storeId: z.uuid(),
  version: z.number().int().positive(),
  deleteGroceries: z.boolean().default(false),
  grocerySnapshot: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() })),
});

// Store reorder schema
export const StoreReorderSchema = z.object({
  stores: z.array(
    z.object({
      id: z.uuid(),
      version: z.number().int().positive(),
    })
  ),
});

// Ingredient store preference schemas
export const IngredientStorePreferenceSelectSchema = createSelectSchema(
  ingredientStorePreferences
).omit({
  createdAt: true,
  updatedAt: true,
});

export const IngredientStorePreferenceInsertSchema = z.object({
  userId: z.string(),
  normalizedName: z.string(),
  storeId: z.uuid(),
});

export const IngredientStorePreferenceUpsertSchema = z.object({
  normalizedName: z.string(),
  storeId: z.uuid(),
});
