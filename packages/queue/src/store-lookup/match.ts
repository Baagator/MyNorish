import type { PricedCandidate } from "@norish/shared/lib/currency";
import { nameWords, normalizeGroceryName } from "@norish/shared/lib/normalized-name";

/**
 * The auto-link rule, applied only where a human would not hesitate: the
 * normalized names are equal, or every word of the grocery's name appears in
 * exactly one candidate's name. Anything less certain leaves the grocery
 * unpriced with an invitation to choose — being quietly shown the price of the
 * wrong thing is the one outcome worth avoiding at any cost.
 *
 * There is no tunable threshold on purpose: there is then no number to
 * re-guess when it misjudges.
 */
export function chooseCandidate(
  candidates: PricedCandidate[],
  groceryName: string
): PricedCandidate | null {
  const wanted = normalizeGroceryName(groceryName);

  if (!wanted || candidates.length === 0) return null;

  const equal = candidates.filter((candidate) => normalizeGroceryName(candidate.name) === wanted);

  // Two products of the same name are two products: which one is the shop's
  // question to answer, not Norish's.
  if (equal.length === 1) return equal[0] ?? null;

  const words = nameWords(wanted);

  if (words.length === 0) return null;
  const containing = candidates.filter((candidate) => {
    const has = new Set(nameWords(candidate.name));

    return words.every((word) => has.has(word));
  });

  return containing.length === 1 ? (containing[0] ?? null) : null;
}
