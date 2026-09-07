"use client";

import { TagIcon } from "@heroicons/react/16/solid";

interface SaleLabelProps {
  /** The shop's own words for the deal, where it printed any. */
  words: string | null;
  /** The regular price, formatted, where this is a Sale; null where it is words alone. */
  regular: string | null;
  /** Norish's word for a Sale the shop put no words to. */
  fallback: string;
  /** What the struck price is, for a reader who cannot see the strike. */
  regularLabel?: string;
  className?: string;
  testIds?: { sale?: string; words?: string; regular?: string };
}

/**
 * A Sale as the shop presents it, in one small mark: a tag with the shop's own
 * words for the deal, or "Sale" where it printed none, and the regular price
 * struck through beside it. Words over a regular price, "2 voor €5.50", are
 * the tag alone: something to act on at the shelf, never worked into a number.
 * The row and the picker both use it, so a deal looks the same before and
 * after it is chosen.
 */
export function SaleLabel({
  words,
  regular,
  fallback,
  regularLabel,
  className = "",
  testIds = {},
}: SaleLabelProps) {
  const onSale = regular !== null;

  if (!onSale && !words) return null;

  return (
    <span
      className={`inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${className}`}
    >
      <span
        className="text-accent inline-flex max-w-full min-w-0 items-center gap-1 font-medium"
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
      {onSale && (
        <s
          aria-label={regularLabel}
          className="text-muted tabular-nums"
          data-testid={testIds.regular}
        >
          {regular}
        </s>
      )}
    </span>
  );
}
