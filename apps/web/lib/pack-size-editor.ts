import type { PackSizeWords } from "@/lib/format-price";
import { formatPackSize } from "@/lib/format-price";

import type { PackSize } from "@norish/shared/lib/pack-size";
import { isUnitId, unitLabel } from "@norish/shared/lib/units";

/**
 * The Pack Size editor's unit select, as keys. A pack is a quantity and a
 * unit; what is sold loose is offered as the two forms shops actually print,
 * per kilo and per hundred grams, with the quantity fixed by the form. A
 * Pack Size read from a shop in some other form — per 500 ml, say — gets an
 * option of its own so the select can show what the product has.
 */
export const PACK_UNIT_KEYS = [
  "gram",
  "kilogram",
  "milliliter",
  "centiliter",
  "liter",
  "ounce",
  "pound",
  "fluid_ounce",
  "piece",
  "per-kilogram",
  "per-100-gram",
] as const;

/** The forms whose quantity the form itself fixes. */
const FIXED: Record<string, PackSize> = {
  "per-kilogram": { quantity: 1, unit: "kilogram", byWeight: true },
  "per-100-gram": { quantity: 100, unit: "gram", byWeight: true },
};

/** The select key a Pack Size is shown under. */
export function packUnitKey(pack: PackSize): string {
  if (!pack.byWeight) return pack.unit;
  for (const [key, fixed] of Object.entries(FIXED)) {
    if (fixed.unit === pack.unit && fixed.quantity === pack.quantity) return key;
  }

  return `per-${pack.unit}`;
}

/** Whether a key fixes its own quantity, so the editor shows none. */
export function packKeyFixesQuantity(key: string): boolean {
  return key in FIXED;
}

/**
 * The Pack Size a key and a typed quantity make, or null where the quantity
 * is not one — which clears a hand-set Pack Size rather than writing nonsense.
 */
export function packFromKey(key: string, quantity: string): PackSize | null {
  const fixed = FIXED[key];

  if (fixed) return fixed;
  const byWeight = key.startsWith("per-");
  const unit = byWeight ? key.slice("per-".length) : key;

  if (!isUnitId(unit) || unit === "pack") return null;
  const amount = Number(quantity.trim().replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) return null;

  return { quantity: amount, unit, byWeight };
}

/**
 * What a key is called in the select: the unit's symbol, the word for pieces,
 * or the form of sale — "per kg", "per 100 g", and "per ml" for a form read
 * from a shop that the fixed list does not carry.
 */
export function packKeyLabel(key: string, words: PackSizeWords): string {
  const fixed = FIXED[key];

  if (fixed) return formatPackSize(fixed, words);
  if (key === "piece") return words.pieces(2);
  if (key.startsWith("per-")) {
    const unit = key.slice("per-".length);

    return words.per(isUnitId(unit) ? unitLabel(unit) : unit);
  }

  return isUnitId(key) ? unitLabel(key) : key;
}
