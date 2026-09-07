"use client";

import { Chip } from "@heroui/react";

interface SalePriceProps {
  /** The price, formatted. */
  price: string;
  /** The regular price the shop struck through, formatted; null where this is no Sale. */
  regular: string | null;
  /** What the struck price is, for a reader who cannot see the strike. */
  regularLabel?: string;
  /** The shop's own words for the deal, where it printed any. */
  words: string | null;
  /** The chip's text is the size of the price beside it: `lg` reads at text-sm, `sm` at text-xs. */
  size?: "sm" | "lg";
  testIds?: { sale?: string; words?: string; regular?: string };
}

/**
 * A price the way a shelf tag shows a deal. On a Sale the regular price is
 * struck through and the new price sits in a chip beside it, with the shop's
 * own words for the deal as the chip's title rather than a badge of their
 * own. Words the shop keeps over its regular price, "2 voor €5.50", are no
 * Sale: the price stands as it is and the words are the chip, something to
 * act on at the shelf that is never worked into the number.
 */
export function SalePrice({
  price,
  regular,
  regularLabel,
  words,
  size = "sm",
  testIds = {},
}: SalePriceProps) {
  if (regular !== null) {
    return (
      <>
        <s
          aria-label={regularLabel}
          className="text-muted font-normal"
          data-testid={testIds.regular}
        >
          {regular}
        </s>{" "}
        <Chip
          className="align-baseline"
          color="accent"
          data-testid={testIds.sale}
          size={size}
          title={words ?? undefined}
          variant="soft"
        >
          {price}
        </Chip>
      </>
    );
  }
  if (words) {
    return (
      <>
        {price}{" "}
        <Chip
          className="max-w-48 align-baseline"
          color="accent"
          data-testid={testIds.words}
          size={size}
          title={words}
          variant="soft"
        >
          <span className="truncate">{words}</span>
        </Chip>
      </>
    );
  }

  return <>{price}</>;
}
