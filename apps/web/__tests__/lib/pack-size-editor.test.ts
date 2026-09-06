import {
  packFromKey,
  packKeyFixesQuantity,
  packKeyLabel,
  packUnitKey,
} from "@/lib/pack-size-editor";
import { describe, expect, it } from "vitest";

describe("the Pack Size editor's keys", () => {
  it("shows a pack under its unit, and what is sold loose under its form", () => {
    expect(packUnitKey({ quantity: 500, unit: "gram", byWeight: false })).toBe("gram");
    expect(packUnitKey({ quantity: 1, unit: "kilogram", byWeight: true })).toBe("per-kilogram");
    expect(packUnitKey({ quantity: 100, unit: "gram", byWeight: true })).toBe("per-100-gram");
    expect(packUnitKey({ quantity: 500, unit: "milliliter", byWeight: true })).toBe(
      "per-milliliter"
    );
  });

  it("fixes the quantity of the two forms shops print, and of nothing else", () => {
    expect(packKeyFixesQuantity("per-kilogram")).toBe(true);
    expect(packKeyFixesQuantity("per-100-gram")).toBe(true);
    expect(packKeyFixesQuantity("gram")).toBe(false);
    expect(packKeyFixesQuantity("per-milliliter")).toBe(false);
  });

  it("makes a Pack Size out of a key and a typed quantity", () => {
    expect(packFromKey("gram", "500")).toEqual({ quantity: 500, unit: "gram", byWeight: false });
    expect(packFromKey("liter", "1,5")).toEqual({ quantity: 1.5, unit: "liter", byWeight: false });
    expect(packFromKey("per-kilogram", "")).toEqual({
      quantity: 1,
      unit: "kilogram",
      byWeight: true,
    });
    expect(packFromKey("per-milliliter", "500")).toEqual({
      quantity: 500,
      unit: "milliliter",
      byWeight: true,
    });
  });

  it("clears rather than writes nonsense", () => {
    expect(packFromKey("gram", "")).toBeNull();
    expect(packFromKey("gram", "0")).toBeNull();
    expect(packFromKey("gram", "veel")).toBeNull();
    expect(packFromKey("pack", "2")).toBeNull();
    expect(packFromKey("nonsense", "2")).toBeNull();
  });

  it("labels every key: the symbol, the word for pieces, or the form of sale", () => {
    const words = {
      per: (unit: string) => `per ${unit}`,
      pieces: (count: number) => (count === 1 ? "piece" : "pieces"),
    };

    expect(packKeyLabel("gram", words)).toBe("g");
    expect(packKeyLabel("piece", words)).toBe("pieces");
    expect(packKeyLabel("per-kilogram", words)).toBe("per kg");
    expect(packKeyLabel("per-100-gram", words)).toBe("per 100 g");
    expect(packKeyLabel("per-milliliter", words)).toBe("per ml");
    expect(packKeyLabel("deciliter", words)).toBe("dl");
  });
});
