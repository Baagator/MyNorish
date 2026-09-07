"use client";

import { TagIcon } from "@heroicons/react/16/solid";

interface SaleTagProps {
  /** The shop's own words for the deal, where it printed any. */
  words: string | null;
  /** Norish's word for a Sale the shop put no words to. */
  fallback: string;
  /** Whether the shop presents a regular price beside its price, which is what makes this a Sale and not words alone. */
  onSale: boolean;
  className?: string;
  testIds?: { sale?: string; words?: string };
}

/**
 * The shop's mark for a deal, as one small tag: its own words, or "Sale"
 * where it printed none. Words over a regular price, "2 voor €5.50", are the
 * tag alone: something to act on at the shelf, never worked into a number.
 * The struck regular price is not here; it belongs right beside the price it
 * was struck for, the way a shelf tag reads, and each caller puts it there.
 */
export function SaleTag({ words, fallback, onSale, className = "", testIds = {} }: SaleTagProps) {
  if (!onSale && !words) return null;

  return (
    <span
      className={`text-accent inline-flex max-w-full min-w-0 items-center gap-1 text-xs font-medium ${className}`}
      data-testid={onSale ? testIds.sale : undefined}
    >
      <TagIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span
        className="truncate"
        data-testid={words ? testIds.words : undefined}
        title={words ?? undefined}
      >
        {words || fallback}
      </span>
    </span>
  );
}
