/**
 * The store page reader: HTML and its address in, products out. There is no
 * model behind it and no per-shop condition inside it. A supermarket results
 * page is a list already marked up for a search engine, and where the markup
 * is thin the price still sits in an attribute waiting to be read, so the
 * reader is a fixed ladder over what a page states: `ItemList` JSON-LD for
 * the complete list of names and addresses, a DOM pass over the product
 * anchors for the prices, merged on address. See ADR-0028.
 */
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import * as cheerio from "cheerio";

import type {
  ProductReading,
  SearchAddressReading,
  StoreCandidate,
} from "@norish/shared/contracts";
import { currencyForUrl } from "@norish/shared/lib/currency";
import { parseJsonWithRepair } from "@norish/shared/lib/helpers";
import { SEARCH_ADDRESS_PLACEHOLDER } from "@norish/shared/lib/search-address";

export type { ProductReading, SearchAddressReading, StoreCandidate };
export { currencyForUrl } from "@norish/shared/lib/currency";

/** A selection of one element, as cheerio hands it back. */
type CheerioNode = Cheerio<AnyNode>;

type Node = Record<string, unknown>;

function isObject(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];

  return Array.isArray(value) ? value : [value];
}

/**
 * A property of a JSON-LD node, whatever case the shop wrote it in. Dirk
 * writes `"Price": 7.99` inside `offers`, which schema.org does not sanction
 * and which the same site does not do on its results page; a spec-faithful
 * reader finds no price on any Dirk product page (ADR-0028).
 */
function prop(node: Node, name: string): unknown {
  const wanted = name.toLowerCase();

  for (const [key, value] of Object.entries(node)) {
    if (key.toLowerCase() === wanted) return value;
  }

  return undefined;
}

function typeOf(node: Node): string[] {
  return asArray(prop(node, "@type") as string | string[] | undefined).map((value) =>
    String(value)
      .replace(/^https?:\/\/schema\.org\//i, "")
      .toLowerCase()
  );
}

function hasType(node: Node, ...types: string[]): boolean {
  const own = typeOf(node);

  return types.some((type) => own.includes(type.toLowerCase()));
}

function readText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (isObject(value)) {
    const name = prop(value, "name");

    if (typeof name === "string") return name.trim() || null;
    const literal = prop(value, "@value");

    if (typeof literal === "string") return literal.trim() || null;
  }

  return null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * A price as a page writes it: `1.29`, `"1,29"`, `"€ 2,99"`, `"1.234,56"`. A
 * comma is the decimal mark unless a dot already sits behind two digits.
 */
export function parsePriceText(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d.,]/g, "");

  if (!cleaned) return null;
  const normalized =
    cleaned.includes(",") && !/\.\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR",
  "£": "GBP",
  $: "USD",
  "₽": "RUB",
  "₩": "KRW",
  zł: "PLN",
  kr: "SEK",
};
const CURRENCY_CODES = new Set([
  "EUR",
  "GBP",
  "USD",
  "CHF",
  "DKK",
  "NOK",
  "SEK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "RUB",
  "KRW",
  "JPY",
  "CAD",
  "AUD",
  "NZD",
  "BRL",
]);

function currencyCode(value: unknown): string | null {
  const raw = readText(value);

  if (!raw) return null;
  const code = raw.toUpperCase();

  return CURRENCY_CODES.has(code) ? code : (CURRENCY_SYMBOLS[raw] ?? null);
}

/** The marks a shop writes a price with, wherever the price sits beside them. */
const CURRENCY_MARK = "€|£|\\$|₽|₩|zł";
const MONEY_BEFORE = new RegExp(
  `(${CURRENCY_MARK}|\\b[A-Z]{3}\\b)\\s?(\\d{1,6}(?:[.,]\\d{3})*[.,]\\d{2})(?!\\d)`,
  "g"
);
const MONEY_AFTER = new RegExp(
  `(?<![\\d.,])(\\d{1,6}(?:[.,]\\d{3})*[.,]\\d{2})\\s?(${CURRENCY_MARK}|\\b[A-Z]{3}\\b)`,
  "g"
);

/** The first price a piece of text states with its currency; nothing without one. */
export function readPriceInText(value: string): { price: number; currency: string } | null {
  for (const match of value.matchAll(MONEY_BEFORE)) {
    const currency = currencyCode(match[1]);
    const price = parsePriceText(match[2]);

    if (currency && price !== null) return { price, currency };
  }
  for (const match of value.matchAll(MONEY_AFTER)) {
    const currency = currencyCode(match[2]);
    const price = parsePriceText(match[1]);

    if (currency && price !== null) return { price, currency };
  }

  return null;
}

function resolveUrl(candidate: unknown, pageUrl: string): string | null {
  const raw = readText(candidate);

  if (!raw) return null;
  try {
    const resolved = new URL(raw, pageUrl);

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.hash = "";

    return resolved.href;
  } catch {
    return null;
  }
}

/** UN/CEFACT codes, and the codes retailers write in their place, as words a shopper reads. */
const UNIT_WORDS: Record<string, string> = {
  GRM: "gram",
  KGM: "kilogram",
  MGM: "milligram",
  LTR: "liter",
  LT: "liter",
  MLT: "milliliter",
  CLT: "centiliter",
  DLT: "deciliter",
  ONZ: "ounce",
  LBR: "pound",
  C62: "piece",
  EA: "piece",
  H87: "piece",
};

/** A pack size as a shopper reads it: a number and the shop's own word for it. */
const SIZE_SHAPE = /^(?:ca\.?\s*)?\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?\p{L}{1,12}\.?$/u;

function looksLikeSize(value: string): boolean {
  return SIZE_SHAPE.test(value.trim());
}

function readSize(value: unknown): string | null {
  if (typeof value === "string") return looksLikeSize(value) ? collapse(value) : null;
  if (!isObject(value)) return null;
  const amount = readText(prop(value, "value") ?? prop(value, "amount"));

  if (!amount) return null;
  const unitCode = readText(prop(value, "unitCode"));
  const unitText = readText(prop(value, "unitText"));
  const word = (unitCode && UNIT_WORDS[unitCode.toUpperCase()]) ?? unitText ?? null;

  // A size written as "1,5 l" with no unit beside it carries its unit in the text.
  if (!word) return looksLikeSize(amount) ? collapse(amount) : null;

  return collapse(`${amount} ${word}`);
}

function sizeOf(node: Node): string | undefined {
  return (
    readSize(prop(node, "weight")) ??
    readSize(prop(node, "size")) ??
    readSize(prop(node, "netContent")) ??
    undefined
  );
}

interface OfferReading {
  price: number;
  currency: string | null;
}

function readOffer(offer: Node): OfferReading | null {
  const price = parsePriceText(prop(offer, "price")) ?? parsePriceText(prop(offer, "lowPrice"));

  if (price === null) return null;

  return { price, currency: currencyCode(prop(offer, "priceCurrency")) };
}

function offerOf(node: Node): OfferReading | null {
  return (
    asArray(prop(node, "offers") as Node | Node[])
      .filter(isObject)
      .map(readOffer)
      .find((reading) => reading !== null) ?? null
  );
}

/** Every node of any type in a JSON-LD document, however it is nested. */
function walk(root: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(root)) {
    for (const child of root) walk(child, visit);

    return;
  }
  if (!isObject(root)) return;
  visit(root);
  for (const value of Object.values(root)) {
    if (value && typeof value === "object") walk(value, visit);
  }
}

function jsonLdNodes($: cheerio.CheerioAPI): Node[] {
  const nodes: Node[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      walk(parseJsonWithRepair($(element).html() || "{}"), (node) => nodes.push(node));
    } catch {
      // A malformed script is not a reading.
    }
  });

  return nodes;
}

function productCandidate(node: Node, pageUrl: string): StoreCandidate | null {
  const name = readText(prop(node, "name"));
  const url = resolveUrl(prop(node, "url"), pageUrl) ?? resolveUrl(prop(node, "@id"), pageUrl);

  if (!name || !url) return null;
  const offer = offerOf(node);
  const size = sizeOf(node);

  return {
    name,
    url,
    ...(offer ? { price: offer.price } : {}),
    ...(offer?.currency ? { currency: offer.currency } : {}),
    ...(size ? { size } : {}),
  };
}

/** The products a results page states outright, in the order it states them. */
function readJsonLdCandidates($: cheerio.CheerioAPI, pageUrl: string): StoreCandidate[] {
  const nodes = jsonLdNodes($);
  const found: StoreCandidate[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (!hasType(node, "Product", "IndividualProduct", "ProductModel")) continue;
    const candidate = productCandidate(node, pageUrl);

    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    found.push(candidate);
  }

  return found;
}

const NON_PAGE_PROTOCOL = /^(mailto:|tel:|javascript:|#)/i;

/**
 * The product anchors of a results page, found by the one thing every results
 * page has in common: it links to many pages of the same shape. Links are
 * grouped by how deep their path runs and what section it starts in, and the
 * largest group is the shelf — no shop name, no selector, nothing to keep up
 * with when a shop restyles its cards.
 */
function productAnchorGroup(
  $: cheerio.CheerioAPI,
  pageUrl: string
): { url: string; element: CheerioNode }[] {
  const page = new URL(pageUrl);
  const groups = new Map<string, Map<string, CheerioNode>>();

  $("a[href]").each((_, element) => {
    const link = $(element) as unknown as CheerioNode;
    const href = ($(element).attr("href") ?? "").trim();

    if (!href || NON_PAGE_PROTOCOL.test(href)) return;
    const resolved = resolveUrl(href, pageUrl);

    if (!resolved) return;
    const target = new URL(resolved);

    if (target.hostname !== page.hostname) return;
    if (target.pathname === page.pathname) return;
    const segments = target.pathname.split("/").filter((part) => part !== "");

    if (segments.length < 2) return;
    const signature = `${segments.length}:${segments[0]?.toLowerCase() ?? ""}`;
    const group = groups.get(signature) ?? new Map<string, CheerioNode>();

    if (!group.has(target.href)) group.set(target.href, link);
    groups.set(signature, group);
  });

  let best: Map<string, CheerioNode> | null = null;

  for (const group of groups.values()) {
    if (!best || group.size > best.size) best = group;
  }
  if (!best || best.size < 3) return [];

  return [...best.entries()].map(([url, element]) => ({ url, element }));
}

/**
 * The smallest piece of the page that is about this product alone: the anchor
 * grown outwards while everything it links to is still the same product.
 */
function cardOf(
  $: cheerio.CheerioAPI,
  link: CheerioNode,
  url: string,
  pageUrl: string
): CheerioNode {
  let card = link;

  for (let step = 0; step < 6; step += 1) {
    const parent = card.parent() as unknown as CheerioNode;

    if (parent.length === 0 || (parent as unknown as CheerioNode).is("body, html")) break;
    const elsewhere = parent
      .find("a[href]")
      .toArray()
      .some((other) => {
        const resolved = resolveUrl($(other).attr("href"), pageUrl);

        return resolved !== null && resolved !== url;
      });

    if (elsewhere) break;
    card = parent;
  }

  return card;
}

function cardTexts($: cheerio.CheerioAPI, card: CheerioNode): string[] {
  const texts: string[] = [];

  card.find("*").each((_, element) => {
    const node = $(element);

    if (node.children().length > 0) return;
    const value = collapse(node.text());

    if (value) texts.push(value);
  });

  return texts;
}

/**
 * A price a shop states as bare digits, its cents included: "799" beside a
 * card is 7.99 and "88" is 0.88 — the same rule, because a shop that styles
 * its euros and cents in separate elements is writing one number in two
 * pieces. The outermost run is the whole number; a run nested inside it is
 * only its cents.
 */
function priceFromDigitRun($: cheerio.CheerioAPI, card: CheerioNode): number | null {
  let longest = "";

  card.find("*").each((_, element) => {
    const value = collapse($(element).text());

    if (!/^\d{2,6}$/.test(value) || value.length <= longest.length) return;
    // "500" inside "500 g" is a pack size, not five euros. A run whose
    // surroundings read as a size is left alone.
    if (looksLikeSize(collapse($(element).parent().text()))) return;
    longest = value;
  });

  return longest ? Number(longest) / 100 : null;
}

function cardLabels($: cheerio.CheerioAPI, card: CheerioNode): string {
  const labels: string[] = [];
  const own = card.attr("aria-label");

  if (own) labels.push(own);
  card.find("[aria-label], [title]").each((_, element) => {
    const node = $(element);

    labels.push(node.attr("aria-label") ?? "", node.attr("title") ?? "");
  });

  return labels.filter(Boolean).join(" • ");
}

/** What a card calls the product: the link's own words, else the picture beside it. */
function cardName(
  $: cheerio.CheerioAPI,
  card: CheerioNode,
  link: CheerioNode,
  label: string
): string | null {
  const fromImage = card.find("img[alt]").first().attr("alt");
  const fromLabel = label.split(/[,•]/)[0];
  const candidates = [
    collapse(link.text()),
    collapse(fromImage ?? ""),
    collapse(link.attr("title") ?? ""),
    collapse(fromLabel ?? ""),
  ];

  return candidates.find((value) => value.length >= 2) ?? null;
}

/** The size beside the price, as the shop words it. */
function cardSize(texts: string[], label: string): string | undefined {
  const beforePrice = label.match(/([\p{L}\d][\p{L}\d.,\s]{0,20}?)\s*(?:€|£|\$|₽|₩|zł)\s?\d/u)?.[1];

  if (beforePrice) {
    const words = collapse(beforePrice).split(/[,•]/);
    const last = words[words.length - 1]?.trim() ?? "";

    if (looksLikeSize(last)) return last;
  }

  return texts.find((value) => looksLikeSize(value) && !/^\d+$/.test(value));
}

/**
 * The anchors pointing at addresses the page already named as products. When
 * the page states its shelf outright there is nothing to infer: those are the
 * products, however few of them there are.
 */
function anchorsForUrls(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  wanted: Set<string>
): { url: string; element: CheerioNode }[] {
  const found = new Map<string, CheerioNode>();

  $("a[href]").each((_, element) => {
    const resolved = resolveUrl($(element).attr("href"), pageUrl);

    if (!resolved || !wanted.has(resolved) || found.has(resolved)) return;
    found.set(resolved, $(element) as unknown as CheerioNode);
  });

  return [...found.entries()].map(([url, element]) => ({ url, element }));
}

function readDomCandidates(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  anchors: { url: string; element: CheerioNode }[]
): StoreCandidate[] {
  const fallbackCurrency = currencyForUrl(pageUrl);

  return anchors
    .map(({ url, element }) => {
      const card = cardOf($, element, url, pageUrl);
      const label = cardLabels($, card);
      const texts = cardTexts($, card);
      const name = cardName($, card, element, label);

      if (!name) return null;
      const money =
        readPriceInText(label) ?? readPriceInText(card.text()) ?? readPriceInText(texts.join(" "));
      const price = money?.price ?? priceFromDigitRun($, card);

      if (price === undefined || price === null) return { name, url } satisfies StoreCandidate;
      const currency = money?.currency ?? fallbackCurrency;
      const size = cardSize(texts, label);

      return {
        name,
        url,
        price,
        ...(currency ? { currency } : {}),
        ...(size ? { size } : {}),
      } satisfies StoreCandidate;
    })
    .filter((candidate): candidate is StoreCandidate => candidate !== null);
}

/**
 * The products a results page offers. What the page states outright comes
 * first and is complete; the DOM pass beside it carries the prices, which on
 * a shop like Dirk is five sixths of the shelf (ADR-0028).
 */
export function readSearchResults(html: string, baseUrl: string): StoreCandidate[] {
  if (!html.trim()) return [];
  const $ = cheerio.load(html);
  const stated = readJsonLdCandidates($, baseUrl);
  const merged = new Map<string, StoreCandidate>();

  for (const candidate of stated) merged.set(candidate.url, candidate);
  // A page that names its products needs no guessing about which links they
  // are — which is the only way a result set of one or two is readable at all,
  // since a lone link is indistinguishable from navigation.
  const anchors =
    stated.length > 0
      ? anchorsForUrls($, baseUrl, new Set(stated.map((candidate) => candidate.url)))
      : productAnchorGroup($, baseUrl);

  for (const candidate of readDomCandidates($, baseUrl, anchors)) {
    const existing = merged.get(candidate.url);

    if (!existing) {
      merged.set(candidate.url, candidate);
      continue;
    }
    merged.set(candidate.url, {
      ...existing,
      price: existing.price ?? candidate.price,
      currency: existing.currency ?? candidate.currency,
      size: existing.size ?? candidate.size,
    });
  }

  return [...merged.values()].map((candidate) => ({
    ...candidate,
    ...(candidate.price !== undefined && !candidate.currency
      ? { currency: currencyForUrl(baseUrl) ?? undefined }
      : {}),
  }));
}

/**
 * A store that names its product after the page title, "Halfvolle melk
 * bestellen | Albert Heijn", is read without the site's own name behind the
 * bar: the product is the part before it.
 */
function withoutSiteSuffix(name: string, title: string): string {
  if (!title || name !== title) return name;
  const bar = name.lastIndexOf(" | ");

  return bar > 0 ? name.slice(0, bar).trim() : name;
}

/**
 * A page whose data names the product for search engines while its heading
 * names it for people is read by its heading.
 */
function byPageHeading(name: string, heading: string): string {
  if (!heading || heading.length >= name.length) return name;

  return name.toLowerCase().startsWith(heading.toLowerCase()) ? heading : name;
}

/** The pack size a product page states beside its heading, when its data states none. */
function sizeNearHeading($: cheerio.CheerioAPI): string | undefined {
  const heading = $("h1").first();

  if (heading.length === 0) return undefined;
  let scope = heading.parent();

  for (let step = 0; step < 3 && scope.length > 0; step += 1) {
    const found = scope
      .find("*")
      .toArray()
      .map((element) => collapse($(element).text()))
      .find((value) => looksLikeSize(value));

    if (found) return found;
    scope = scope.parent();
  }

  return undefined;
}

function microdataValue($: cheerio.CheerioAPI, scope: CheerioNode, name: string): string | null {
  const element = scope.find(`[itemprop="${name}"]`).first();

  if (element.length === 0) return null;
  const content = element.attr("content") ?? element.attr("href");

  return collapse(content ?? element.text()) || null;
}

function readMicrodataProduct($: cheerio.CheerioAPI): { name: string; money: string } | null {
  const scope = $('[itemscope][itemtype*="schema.org/Product"]').first() as unknown as
    CheerioNode | undefined;

  if (!scope || scope.length === 0) return null;
  const name = microdataValue($, scope, "name");
  const price = microdataValue($, scope, "price");
  const currency = microdataValue($, scope, "priceCurrency");

  if (!name || !price) return null;

  return { name, money: `${price} ${currency ?? ""}` };
}

/**
 * The authoritative Shelf Price: what one product page states about the one
 * product it is about.
 */
export function readProduct(html: string, url: string): ProductReading | null {
  if (!html.trim()) return null;
  const $ = cheerio.load(html);
  const title = collapse($("title").first().text());
  const heading = collapse($("h1").first().text());
  const fallbackCurrency = currencyForUrl(url);

  /**
   * One reading, however the page happened to state it: named for people
   * rather than for search engines, sized by whatever the page says, and
   * refused outright without a currency — a price without one is not a
   * reading.
   */
  const reading = (
    name: string | null,
    price: number | null,
    currency: string | null,
    size: string | undefined
  ): ProductReading | null => {
    const named = name ? byPageHeading(withoutSiteSuffix(name, title), heading) : "";
    const inCurrency = currency ?? fallbackCurrency;

    if (!named || price === null || !inCurrency) return null;
    const packed = size ?? sizeNearHeading($);

    return { name: named, price, currency: inCurrency, ...(packed ? { size: packed } : {}) };
  };

  for (const node of jsonLdNodes($)) {
    if (!hasType(node, "Product", "IndividualProduct", "ProductModel")) continue;
    const offer = offerOf(node);

    if (!offer) continue;
    const found = reading(
      readText(prop(node, "name")),
      offer.price,
      offer.currency ?? readPriceInText($.text())?.currency,
      sizeOf(node)
    );

    if (found) return found;
  }

  const microdata = readMicrodataProduct($);

  if (microdata) {
    const money = readPriceInText(microdata.money);
    const found = reading(
      microdata.name,
      money?.price ?? parsePriceText(microdata.money),
      money?.currency ?? null,
      undefined
    );

    if (found) return found;
  }

  const metaPrice =
    $('meta[property="product:price:amount"]').attr("content") ??
    $('meta[property="og:price:amount"]').attr("content");
  const metaCurrency =
    $('meta[property="product:price:currency"]').attr("content") ??
    $('meta[property="og:price:currency"]').attr("content");

  return reading(
    heading || title,
    parsePriceText(metaPrice),
    currencyCode(metaCurrency),
    undefined
  );
}

/**
 * Search words in the fourteen locales Norish ships, plus the parameter names
 * every framework writes. This is the **last** rung of discovery and never
 * the first: a shop searches in a word this list does not have, and the rungs
 * above it — an OpenSearch descriptor, `role="search"`, `type="search"` —
 * read no words at all.
 */
const SEARCH_WORDS = [
  "q",
  "s",
  "k",
  "query",
  "term",
  "keyword",
  "keywords",
  "search",
  "searchterm",
  "zoek",
  "zoeken",
  "zoekterm",
  "suche",
  "suchen",
  "suchbegriff",
  "recherche",
  "rechercher",
  "buscar",
  "busqueda",
  "búsqueda",
  "cerca",
  "ricerca",
  "busca",
  "pesquisa",
  "soeg",
  "søg",
  "sog",
  "sok",
  "søk",
  "szukaj",
  "szukanie",
  "wyszukiwarka",
  "poisk",
  "поиск",
  "tarsene",
  "търсене",
  "검색",
  "검색어",
];

const TEXT_INPUT_TYPES = new Set(["text", "search", ""]);
const TERM_MARK = "__norish_query__";

function formAddress(
  $: cheerio.CheerioAPI,
  form: CheerioNode,
  termName: string,
  pageUrl: string
): string | null {
  const action = resolveUrl(form.attr("action") ?? "", pageUrl) ?? pageUrl;
  const address = new URL(action);

  form.find("input").each((_, element) => {
    const input = $(element);
    const type = (input.attr("type") ?? "").trim().toLowerCase();
    const name = input.attr("name");

    if (type === "hidden" && name) address.searchParams.set(name, input.attr("value") ?? "");
  });
  address.searchParams.set(termName, TERM_MARK);

  return address.href.replace(TERM_MARK, SEARCH_ADDRESS_PLACEHOLDER);
}

function termInputName($: cheerio.CheerioAPI, form: CheerioNode): string | null {
  const typed = form.find('input[type="search"][name]').first().attr("name");

  if (typed) return typed;
  const inputs = form
    .find("input")
    .toArray()
    .map((element) => $(element))
    .filter((input) => TEXT_INPUT_TYPES.has((input.attr("type") ?? "").trim().toLowerCase()));

  return inputs.length === 1 ? (inputs[0]?.attr("name") ?? null) : null;
}

/**
 * What a homepage states about how it is searched, in three rungs: an
 * OpenSearch descriptor, whose template names its own slot; a form marked as
 * search, whose input name is taken whatever language it is in; and only
 * then a form matched against words, which is the rung that is wrong
 * everywhere it has not been extended.
 */
export function readSearchAddressFromPage(
  html: string,
  pageUrl: string
): SearchAddressReading | null {
  if (!html.trim()) return null;
  const $ = cheerio.load(html);
  const descriptor = $('link[rel~="search"][type="application/opensearchdescription+xml"]').first();
  const descriptionUrl =
    descriptor.length > 0 ? resolveUrl(descriptor.attr("href"), pageUrl) : null;

  if (descriptionUrl) return { kind: "opensearch", descriptionUrl };

  const forms = $("form")
    .toArray()
    .map((element) => $(element) as unknown as CheerioNode)
    .filter((form) => (form.attr("method") ?? "get").trim().toLowerCase() === "get");
  const marked = forms.filter(
    (form) =>
      (form.attr("role") ?? "").trim().toLowerCase() === "search" ||
      form.find('input[type="search"]').length > 0
  );

  for (const form of marked) {
    const name = termInputName($, form);
    const address = name ? formAddress($, form, name, pageUrl) : null;

    if (address) return { kind: "form", searchAddress: address };
  }

  for (const form of forms) {
    // Whole segments only: `action.includes("s")` would make a search form of
    // every `/products` and `/newsletter` on the web.
    const actionWords = (form.attr("action") ?? "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const named = form
      .find("input[name]")
      .toArray()
      .map((element) => $(element).attr("name") ?? "")
      .find((name) => SEARCH_WORDS.includes(name.toLowerCase()));
    const byAction = actionWords.some((word) => SEARCH_WORDS.includes(word));
    const name = named ?? (byAction ? termInputName($, form) : null);
    const address = name ? formAddress($, form, name, pageUrl) : null;

    if (address) return { kind: "form", searchAddress: address };
  }

  return null;
}

/** The html search template an OpenSearch description declares, as a Search Address. */
export function readOpenSearchTemplate(xml: string, descriptionUrl: string): string | null {
  const $ = cheerio.load(xml, { xml: true });
  let template: string | null = null;

  $("Url").each((_, element) => {
    if (template) return;
    const url = $(element);
    const type = (url.attr("type") ?? "").toLowerCase();
    const method = (url.attr("method") ?? "get").toLowerCase();
    const raw = url.attr("template");

    if (type !== "text/html" || method !== "get" || !raw) return;
    template = raw;
  });

  if (template === null) return null;
  const withMark = (template as string).replace(/\{searchTerms\??\}/g, TERM_MARK);
  const resolved = resolveUrl(withMark, descriptionUrl);

  return resolved ? resolved.replace(TERM_MARK, SEARCH_ADDRESS_PLACEHOLDER) : null;
}
