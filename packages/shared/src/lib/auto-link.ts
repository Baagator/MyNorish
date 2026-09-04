import { nameWords, normalizeGroceryName } from "./normalized-name";

/**
 * The auto-link rule, applied only where a human would not hesitate: the
 * normalized names are equal, or every word of the grocery's name appears in
 * exactly one product's name. Anything less certain leaves the grocery
 * unpriced with an invitation to choose — being quietly shown the price of the
 * wrong thing is the one outcome worth avoiding at any cost.
 *
 * There is no tunable threshold on purpose: there is then no number to
 * re-guess when it misjudges.
 *
 * One rule, wherever a grocery name meets a shop's products: the lookup queue
 * asks it of what a shop just answered, and the picker asks it of the rows it
 * is about to show. Two rules would mean a shopper watching a match happen and
 * a shopper who stepped away seeing different answers.
 */
export function chooseUnmistakable<T extends { name: string }>(
  products: T[],
  groceryName: string
): T | null {
  const wanted = normalizeGroceryName(groceryName);

  if (!wanted || products.length === 0) return null;

  const equal = products.filter((product) => normalizeGroceryName(product.name) === wanted);

  // Two products of the same name are two products: which one is the shop's
  // question to answer, not Norish's.
  if (equal.length === 1) return equal[0] ?? null;

  const words = nameWords(wanted);

  if (words.length === 0) return null;
  const containing = products.filter((product) => {
    const has = new Set(nameWords(product.name));

    return words.every((word) => has.has(word));
  });

  return containing.length === 1 ? (containing[0] ?? null) : null;
}
