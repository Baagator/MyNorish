// @vitest-environment node
/**
 * The auto-link rule. It links only where a human would not hesitate, because
 * the one outcome worth avoiding at any cost is being quietly shown the price
 * of the wrong thing.
 */
import { describe, expect, it } from "vitest";

import type { StoreCandidate } from "@norish/shared/contracts";
import { chooseCandidate } from "@norish/queue/store-lookup/match";

function candidate(name: string, url = name): StoreCandidate {
  return {
    name,
    url: `https://shop.example.nl/p/${encodeURIComponent(url)}`,
    price: 1,
    currency: "EUR",
  };
}

describe("chooseCandidate", () => {
  it("links a candidate whose name is the grocery's name", () => {
    const chosen = chooseCandidate(
      [candidate("Halfvolle melk 1L"), candidate("Oude kaas"), candidate("Roomboter")],
      "oude  KAAS!"
    );

    expect(chosen?.name).toBe("Oude kaas");
  });

  it("links a candidate whose name holds every word of the grocery's, when only one does", () => {
    const chosen = chooseCandidate(
      [candidate("Halfvolle melk 1L"), candidate("Melkchocolade reep"), candidate("Roomboter")],
      "melk"
    );

    expect(chosen?.name).toBe("Halfvolle melk 1L");
  });

  it("links nothing when the words appear in two candidates", () => {
    expect(
      chooseCandidate([candidate("Halfvolle melk 1L"), candidate("Volle melk 1L")], "melk")
    ).toBeNull();
  });

  it("links nothing when two candidates carry the same name", () => {
    expect(
      chooseCandidate(
        [candidate("Oude kaas", "a"), candidate("Oude kaas", "b"), candidate("Jonge kaas")],
        "oude kaas"
      )
    ).toBeNull();
  });

  it("links nothing when a word of the grocery's name is missing", () => {
    expect(chooseCandidate([candidate("Halfvolle melk 1L")], "oude melk")).toBeNull();
  });

  it("links nothing out of nothing", () => {
    expect(chooseCandidate([], "melk")).toBeNull();
    expect(chooseCandidate([candidate("Melk")], "   ")).toBeNull();
  });

  it("folds diacritics and punctuation on both sides", () => {
    expect(chooseCandidate([candidate("Crème fraîche 200g")], "creme fraiche")?.name).toBe(
      "Crème fraîche 200g"
    );
  });
});
