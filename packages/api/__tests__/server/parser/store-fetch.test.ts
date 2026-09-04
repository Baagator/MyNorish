// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchStorePage } from "@norish/api/parser/store-fetch";

const renderPage = vi.hoisted(() => vi.fn<(url: string) => Promise<string>>());

vi.mock("@norish/api/parser/fetch", () => ({ fetchRenderedPage: renderPage }));

const A_REAL_PAGE = `<html><head><title>Zoekresultaten</title></head><body>${"x".repeat(30_000)}</body></html>`;
const A_CHALLENGE = "<html><body>checking your browser</body></html>";
const RENDERED = `<html><head><title>Rendered</title></head><body>${"y".repeat(30_000)}</body></html>`;

function answerWith(body: string, status = 200) {
  return vi.fn(async () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: async () => Promise.resolve(body),
    })
  );
}

describe("fetchStorePage", () => {
  beforeEach(() => {
    renderPage.mockReset();
    renderPage.mockResolvedValue(RENDERED);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("takes what a plain fetch answers and renders nothing", async () => {
    vi.stubGlobal("fetch", answerWith(A_REAL_PAGE));

    const visit = await fetchStorePage("https://www.dirk.nl/zoeken/producten/kaas");

    expect(visit).toMatchObject({ html: A_REAL_PAGE, rendered: false });
    expect(renderPage).not.toHaveBeenCalled();
  });

  it("escalates to Obscura when the shop turns the fetch away", async () => {
    vi.stubGlobal("fetch", answerWith("", 403));

    const visit = await fetchStorePage("https://www.ah.nl/zoeken?query=kaas");

    expect(visit).toMatchObject({ html: RENDERED, rendered: true });
  });

  it("escalates to Obscura when the answer is a challenge rather than a shop", async () => {
    vi.stubGlobal("fetch", answerWith(A_CHALLENGE));

    const visit = await fetchStorePage("https://www.ah.nl/zoeken?query=kaas");

    expect(visit).toMatchObject({ html: RENDERED, rendered: true });
  });

  it("escalates to Obscura when the caller found nothing on the page", async () => {
    vi.stubGlobal("fetch", answerWith(A_REAL_PAGE));

    const visit = await fetchStorePage("https://www.ah.nl/zoeken?query=kaas", () => true);

    expect(visit).toMatchObject({ html: RENDERED, rendered: true });
  });

  it("does not escalate for an error the shop states plainly", async () => {
    vi.stubGlobal("fetch", answerWith("not found", 404));

    const visit = await fetchStorePage("https://www.dirk.nl/zoeken/producten/kaas");

    expect(visit).toMatchObject({ html: "", rendered: false });
    expect(renderPage).not.toHaveBeenCalled();
  });

  it("fails without throwing when Obscura cannot render either", async () => {
    vi.stubGlobal("fetch", answerWith("", 403));
    renderPage.mockResolvedValue("");

    await expect(fetchStorePage("https://www.ah.nl/zoeken?query=kaas")).resolves.toMatchObject({
      html: "",
      rendered: false,
    });
  });

  it("still reads a plain-fetchable shop when Obscura is out of reach", async () => {
    vi.stubGlobal("fetch", answerWith(A_REAL_PAGE));
    renderPage.mockRejectedValue(new Error("Obscura is not reachable"));

    await expect(
      fetchStorePage("https://www.dirk.nl/zoeken/producten/kaas")
    ).resolves.toMatchObject({ html: A_REAL_PAGE, rendered: false });
  });
});
