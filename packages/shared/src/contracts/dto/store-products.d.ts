import type { z } from "zod";

import type {
  StoreProductLinkInputSchema,
  StoreProductLinkSelectSchema,
  StoreProductManualCreateSchema,
  StoreProductManualUpdateSchema,
  StoreProductReadingSchema,
  StoreProductSelectSchema,
} from "@norish/shared/contracts/zod";

export type StoreProductDto = z.output<typeof StoreProductSelectSchema>;
export type StoreProductLinkDto = z.output<typeof StoreProductLinkSelectSchema>;
export type StoreProductReadingInput = z.output<typeof StoreProductReadingSchema>;
export type StoreProductManualCreateInput = z.output<typeof StoreProductManualCreateSchema>;
export type StoreProductManualUpdateInput = z.output<typeof StoreProductManualUpdateSchema>;
export type StoreProductLinkInput = z.output<typeof StoreProductLinkInputSchema>;

/** What a Store knows about one grocery name: its Product Link, and the product it resolves to. */
export interface ResolvedProductLink {
  storeId: string;
  normalizedName: string;
  triedAt: Date;
  product: StoreProductDto | null;
}
