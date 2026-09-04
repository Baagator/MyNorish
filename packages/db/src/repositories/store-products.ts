import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import z from "zod";

import type {
  ResolvedProductLink,
  StoreProductDto,
  StoreProductManualCreateInput,
  StoreProductManualUpdateInput,
  StoreProductReadingInput,
} from "@norish/shared/contracts";
import { db } from "@norish/db/drizzle";
import { storeProductLinks, storeProducts } from "@norish/db/schema";
import {
  StoreProductLinkSelectSchema,
  StoreProductSelectSchema,
} from "@norish/shared/contracts/zod";
import { normalizeGroceryName } from "@norish/shared/lib/normalized-name";

const ProductSchema = StoreProductSelectSchema;
const ProductsSchema = z.array(StoreProductSelectSchema);

function parseProduct(row: unknown): StoreProductDto {
  const parsed = ProductSchema.safeParse(row);

  if (!parsed.success) throw new Error("Failed to parse store product");

  return parsed.data;
}

function parseProducts(rows: unknown[]): StoreProductDto[] {
  const parsed = ProductsSchema.safeParse(rows);

  if (!parsed.success) throw new Error("Failed to parse store products");

  return parsed.data;
}

/** The price as Postgres wants it: a fixed-scale decimal, never a float. */
function money(value: number): string {
  return value.toFixed(2);
}

/**
 * What a Store has learned one grocery name means, product and all, in one
 * query. A row with no product is a Miss and reads as one.
 */
export async function resolveProductLink(
  storeId: string,
  name: string
): Promise<ResolvedProductLink | null> {
  const normalizedName = normalizeGroceryName(name);

  if (!normalizedName) return null;

  const [row] = await db
    .select({ link: storeProductLinks, product: storeProducts })
    .from(storeProductLinks)
    .leftJoin(storeProducts, eq(storeProducts.id, storeProductLinks.storeProductId))
    .where(
      and(
        eq(storeProductLinks.storeId, storeId),
        eq(storeProductLinks.normalizedName, normalizedName)
      )
    )
    .limit(1);

  if (!row) return null;
  const link = StoreProductLinkSelectSchema.safeParse(row.link);

  if (!link.success) throw new Error("Failed to parse product link");

  return {
    storeId: link.data.storeId,
    normalizedName: link.data.normalizedName,
    triedAt: link.data.triedAt,
    product: row.product ? parseProduct(row.product) : null,
  };
}

/**
 * Every Product Link a household's stores hold for a set of grocery names, in
 * one query rather than one per grocery.
 */
export async function resolveProductLinks(
  pairs: { storeId: string; name: string }[]
): Promise<ResolvedProductLink[]> {
  const wanted = new Set(
    pairs
      .map(({ storeId, name }) => `${storeId}|${normalizeGroceryName(name)}`)
      .filter((key) => !key.endsWith("|"))
  );

  if (wanted.size === 0) return [];
  const storeIds = [...new Set(pairs.map((pair) => pair.storeId))];
  const names = [...new Set(pairs.map((pair) => normalizeGroceryName(pair.name)).filter(Boolean))];

  const rows = await db
    .select({ link: storeProductLinks, product: storeProducts })
    .from(storeProductLinks)
    .leftJoin(storeProducts, eq(storeProducts.id, storeProductLinks.storeProductId))
    .where(
      and(
        inArray(storeProductLinks.storeId, storeIds),
        inArray(storeProductLinks.normalizedName, names)
      )
    );

  return rows
    .filter((row) => wanted.has(`${row.link.storeId}|${row.link.normalizedName}`))
    .map((row) => ({
      storeId: row.link.storeId,
      normalizedName: row.link.normalizedName,
      triedAt: row.link.triedAt,
      product: row.product ? parseProduct(row.product) : null,
    }));
}

/**
 * Point a grocery name at a product, or at nothing. Last writer wins, with no
 * version guard: the last human to choose is right, and a Miss is the same row
 * with no product and a fresh `triedAt`.
 */
export async function upsertProductLink(
  storeId: string,
  name: string,
  storeProductId: string | null
): Promise<void> {
  const normalizedName = normalizeGroceryName(name);

  if (!normalizedName) return;

  await db
    .insert(storeProductLinks)
    .values({ storeId, normalizedName, storeProductId })
    .onConflictDoUpdate({
      target: [storeProductLinks.storeId, storeProductLinks.normalizedName],
      set: {
        storeProductId,
        triedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${storeProductLinks.version} + 1`,
      },
    });
}

/**
 * A product read from a shop page. The page is what makes it the same product,
 * so a second reading of the same page updates the one row rather than adding
 * another. A by-hand product is never touched here — its owner typed it, and
 * nothing that reads a page overwrites that.
 */
export async function upsertReadProduct(
  reading: StoreProductReadingInput
): Promise<StoreProductDto> {
  const [row] = await db
    .insert(storeProducts)
    .values({
      storeId: reading.storeId,
      name: reading.name,
      pageUrl: reading.pageUrl,
      price: money(reading.price),
      currency: reading.currency,
      size: reading.size ?? null,
      pricedAt: new Date(),
      isManual: false,
    })
    .onConflictDoUpdate({
      target: [storeProducts.storeId, storeProducts.pageUrl],
      set: {
        name: reading.name,
        price: money(reading.price),
        currency: reading.currency,
        size: reading.size ?? null,
        pricedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${storeProducts.version} + 1`,
      },
      setWhere: eq(storeProducts.isManual, false),
    })
    .returning();

  if (row) return parseProduct(row);

  // The conflicting row is a by-hand product: it keeps what its owner typed.
  const [existing] = await db
    .select()
    .from(storeProducts)
    .where(
      and(eq(storeProducts.storeId, reading.storeId), eq(storeProducts.pageUrl, reading.pageUrl))
    )
    .limit(1);

  if (!existing) throw new Error("Failed to upsert a store product");

  return parseProduct(existing);
}

/** A Store Product someone typed, for a shop Norish cannot read. */
export async function createManualProduct(
  input: StoreProductManualCreateInput
): Promise<StoreProductDto> {
  const [row] = await db
    .insert(storeProducts)
    .values({
      id: input.id,
      storeId: input.storeId,
      name: input.name,
      pageUrl: null,
      price: money(input.price),
      currency: input.currency,
      size: input.size ?? null,
      pricedAt: new Date(),
      isManual: true,
    })
    .returning();

  if (!row) throw new Error("Failed to create a by-hand store product");

  return parseProduct(row);
}

export async function updateManualProduct(
  input: StoreProductManualUpdateInput
): Promise<StoreProductDto | null> {
  const [row] = await db
    .update(storeProducts)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.price === undefined ? {} : { price: money(input.price), pricedAt: new Date() }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.size === undefined ? {} : { size: input.size ?? null }),
      updatedAt: new Date(),
      version: sql`${storeProducts.version} + 1`,
    })
    .where(and(eq(storeProducts.id, input.id), eq(storeProducts.isManual, true)))
    .returning();

  return row ? parseProduct(row) : null;
}

export async function getStoreProductById(id: string): Promise<StoreProductDto | null> {
  const [row] = await db.select().from(storeProducts).where(eq(storeProducts.id, id)).limit(1);

  return row ? parseProduct(row) : null;
}

/** Everything one Store knows it sells, newest reading first. */
export async function listStoreProducts(storeId: string): Promise<StoreProductDto[]> {
  const rows = await db
    .select()
    .from(storeProducts)
    .where(eq(storeProducts.storeId, storeId))
    .orderBy(storeProducts.name);

  return parseProducts(rows);
}

/**
 * The read products among these whose Shelf Price is older than the ceiling. A
 * by-hand product is never stale: nothing read it, and nothing may refresh it.
 */
export async function listStaleProducts(
  productIds: string[],
  olderThan: Date
): Promise<StoreProductDto[]> {
  if (productIds.length === 0) return [];
  const rows = await db
    .select()
    .from(storeProducts)
    .where(
      and(
        inArray(storeProducts.id, productIds),
        eq(storeProducts.isManual, false),
        isNotNull(storeProducts.pageUrl),
        lt(storeProducts.pricedAt, olderThan)
      )
    );

  return parseProducts(rows);
}
