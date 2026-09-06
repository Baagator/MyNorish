// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  currencyForUrl,
  parsePriceText,
  readPriceInText,
  readProduct,
  readSearchResults,
} from "@norish/api/parser/store-page";
import {
  readOpenSearchTemplate,
  readSearchAddressFromPage,
} from "@norish/api/parser/store-search-address";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/store-pages"
);

function fixture(name: string): string {
  return readFileSync(path.join(fixtures, name), "utf8");
}

const DIRK_SEARCH = "https://www.dirk.nl/zoeken/producten/kaas";
const DIRK_PRODUCT =
  "https://www.dirk.nl/boodschappen/zuivel-kaas/kaas-stuk/1%20de%20beste%20jong%20belegen%20kaas%2048%2B%20stuk/97752";
const AH_SEARCH = "https://www.ah.nl/zoeken?query=kaas";

describe("readSearchResults: a shop that states its shelf but prices a sixth of it", () => {
  const candidates = readSearchResults(fixture("dirk-search-kaas.html"), DIRK_SEARCH);

  it("offers every product on the page, priced", () => {
    expect(candidates).toHaveLength(198);
    expect(candidates.filter((candidate) => candidate.price !== undefined)).toHaveLength(198);
  });

  it("gives every candidate a name and an absolute address", () => {
    for (const candidate of candidates) {
      expect(candidate.name.length).toBeGreaterThan(1);
      expect(candidate.url).toMatch(/^https:\/\/www\.dirk\.nl\//);
    }
  });

  it("reads a price the page states only in its DOM, split across two elements", () => {
    const stuk = candidates.find((candidate) => candidate.url.endsWith("/97752"));

    expect(stuk).toMatchObject({
      name: "1 de Beste Jong belegen kaas 48+ stuk",
      price: 7.99,
      currency: "EUR",
      size: "930 g",
    });
  });

  it("reads a price under a euro, stated as bare cents", () => {
    const croissant = candidates.find((candidate) => candidate.url.endsWith("/1714"));

    expect(croissant).toMatchObject({ name: "Ham kaas croissant", price: 0.88, currency: "EUR" });
  });

  it("reads a price the page does state in its product data", () => {
    const plakken = candidates.find((candidate) => candidate.url.endsWith("/115209"));

    expect(plakken).toMatchObject({ name: "Beemster Jonge kaas 48+ plakken", price: 1.69 });
  });
});

describe("readSearchResults: a shop that states no product data at all", () => {
  const candidates = readSearchResults(fixture("ah-search-kaas.html"), AH_SEARCH);

  it("offers the products its cards name, priced from their labels", () => {
    expect(candidates).toHaveLength(36);
    expect(candidates.filter((candidate) => candidate.price !== undefined)).toHaveLength(36);
  });

  it("reads the name, the price and the shop's own size words from one card", () => {
    const milner = candidates.find((candidate) =>
      candidate.url.endsWith("/milner-jong-belegen-35-plakken")
    );

    expect(milner).toMatchObject({
      name: "Milner Jong belegen 35+ plakken",
      price: 2.99,
      currency: "EUR",
      size: "150 gram",
    });
  });
});

describe("readSearchResults: a shop whose shelf is smaller than its own footer", () => {
  const candidates = readSearchResults(
    fixture("ah-search-one-product.html"),
    "https://www.ah.nl/zoeken?query=AH%20Hamsterchef%20Zuivelspread%20light%20aardbei"
  );

  it("offers the one product the search found, and nothing else the page links to", () => {
    expect(candidates).toEqual([
      {
        name: "AH Hamsterchef Zuivelspread light aardbei",
        url: "https://www.ah.nl/producten/product/wi623677/ah-hamsterchef-zuivelspread-light-aardbei",
        price: 1.39,
        currency: "EUR",
        size: "120 gram",
      },
    ]);
  });
});

describe("readProduct", () => {
  it("reads a Shelf Price a shop writes with a capital P", () => {
    expect(readProduct(fixture("dirk-product-97752.html"), DIRK_PRODUCT)).toEqual({
      name: "1 de Beste Jong belegen kaas 48+ stuk",
      price: 7.99,
      currency: "EUR",
      size: "930 g",
    });
  });

  it("reads a product page that states its price in microdata", () => {
    const html = `<html><body><div itemscope itemtype="https://schema.org/Product">
      <span itemprop="name">Halfvolle melk</span>
      <span itemprop="price" content="1.29"></span>
      <meta itemprop="priceCurrency" content="EUR">
    </div></body></html>`;

    expect(readProduct(html, "https://shop.example.nl/p/1")).toMatchObject({
      name: "Halfvolle melk",
      price: 1.29,
      currency: "EUR",
    });
  });

  it("reads nothing from a page that states no price", () => {
    expect(
      readProduct("<html><body><h1>Kaas</h1></body></html>", "https://shop.example.nl/p/1")
    ).toBeNull();
  });
});

describe("prices as Europe writes them", () => {
  it.each([
    ["2.99", 2.99],
    ["2,99", 2.99],
    ["€ 2,99", 2.99],
    ["€2,99", 2.99],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    [7.99, 7.99],
  ])("parses %s", (written, expected) => {
    expect(parsePriceText(written)).toBe(expected);
  });

  it("takes the currency from the symbol beside the number", () => {
    expect(readPriceInText("nu voor €2,99 per stuk")).toEqual({ price: 2.99, currency: "EUR" });
    expect(readPriceInText("2.99 USD")).toEqual({ price: 2.99, currency: "USD" });
  });

  it("reads no price where there is no currency", () => {
    expect(readPriceInText("Nutri-Score D, 150 gram")).toBeNull();
  });

  it("falls back to what the website's top-level domain implies", () => {
    expect(currencyForUrl("https://www.dirk.nl/zoeken")).toBe("EUR");
    expect(currencyForUrl("https://shop.example.pl/szukaj")).toBe("PLN");
  });
});

describe("a bare run of digits, which is how a shop styles a large price", () => {
  const links = ["1", "2", "3"]
    .map((n) => `<article><a href="/p/${n}/kaas">Kaas ${n}</a>SIZE</article>`)
    .join("");

  it("reads euros and cents split across two elements as one number", () => {
    const html = `<html><body>${links.replaceAll(
      "SIZE",
      "<div><span>7</span><span>99</span></div>"
    )}</body></html>`;

    expect(readSearchResults(html, "https://shop.example.nl/zoeken")[0]).toMatchObject({
      price: 7.99,
      currency: "EUR",
    });
  });

  it("reads a price under a euro, which a shop states as bare cents", () => {
    const html = `<html><body>${links.replaceAll("SIZE", "<div><span>88</span></div>")}</body></html>`;

    expect(readSearchResults(html, "https://shop.example.nl/zoeken")[0]).toMatchObject({
      price: 0.88,
    });
  });

  it("never reads a pack size as a price", () => {
    const html = `<html><body>${links.replaceAll(
      "SIZE",
      "<p><span>500</span> g</p>"
    )}</body></html>`;

    expect(readSearchResults(html, "https://shop.example.nl/zoeken")[0]?.price).toBeUndefined();
  });
});

describe("what a card says, read the way a shopper reads it", () => {
  const shelf = (card: string) =>
    `<html><body>${["1", "2", "3"].map((n) => card.replaceAll("N", n)).join("")}</body></html>`;
  const first = (html: string, at = "https://shop.example.nl/zoeken?q=kaas") =>
    readSearchResults(html, at)[0];

  it("does not glue a pack count to the price beside it", () => {
    // Cheerio's `.text()` runs sibling texts together: "x12" + "2,49 €" read
    // as 122,49 € and a dozen eggs cost a hundred and twenty euros.
    const html = shelf(
      `<article><a href="/p/N/oeufs">Oeufs N</a><span>x12</span><span>2,49 €</span></article>`
    );

    expect(first(html, "https://shop.example.fr/recherche?q=oeufs")).toMatchObject({
      price: 2.49,
      currency: "EUR",
    });
  });

  it("reads the price the shop charges now, not the one it struck through", () => {
    const html = shelf(
      `<article><a href="/p/N/kaas">Kaas N</a><del>€ 3,49</del><span>€ 2,99</span></article>`
    );

    expect(first(html)?.price).toBe(2.99);
  });

  it("reads what one pack costs, not the price per kilo beside it", () => {
    const html = shelf(
      `<article><a href="/p/N/kaas">Kaas N</a><span>€ 19,93 / kg</span><span>€ 2,99</span></article>`
    );

    expect(first(html)?.price).toBe(2.99);
    expect(readPriceInText("€ 19,93 per kg, € 2,99 per stuk")).toEqual({
      price: 2.99,
      currency: "EUR",
    });
  });

  it("reads a bare decimal in the shop's own currency before guessing at digit runs", () => {
    // Without a mark the digit run used to take the review count for cents.
    const html = shelf(
      `<article><a href="/p/N/kaas">Kaas N</a><span>2,99</span><span class="reviews">17</span></article>`
    );

    expect(first(html)).toMatchObject({ price: 2.99, currency: "EUR" });
  });

  it("never reads a price in a lettered currency as a pack size", () => {
    const html = shelf(
      `<article><a href="/p/N/ser">Ser N</a><span>12,34 zł</span><span>500 g</span></article>`
    );

    expect(first(html, "https://sklep.example.pl/szukaj?q=ser")).toMatchObject({
      price: 12.34,
      currency: "PLN",
      size: "500 g",
    });
  });

  it("tells the three crowns apart by the shop's own country", () => {
    expect(readPriceInText("39,90 kr", "DKK")).toEqual({ price: 39.9, currency: "DKK" });
    expect(readPriceInText("kr. 39,90", "NOK")).toEqual({ price: 39.9, currency: "NOK" });
    expect(readPriceInText("39,90 kr")).toEqual({ price: 39.9, currency: "SEK" });
    // A crate is not a crown.
    expect(readPriceInText("1,50 krat")).toBeNull();
  });

  it("reads a whole-euro price written with a dash for its cents", () => {
    expect(readPriceInText("€ 2,-")).toEqual({ price: 2, currency: "EUR" });
  });

  it("names a card wrapped in one link by its heading, not by everything in it", () => {
    const html = shelf(
      `<article><a href="/p/N/kaas"><h3>Kaas N</h3><span>€ 2,91</span><span>500 g</span></a></article>`
    );

    expect(first(html)).toMatchObject({ name: "Kaas 1", price: 2.91, size: "500 g" });
  });

  it("grows a card past its own buttons to the price", () => {
    const html = shelf(
      `<article><div><a href="/p/N/kaas">Kaas N</a><a href="#">♡</a></div><span>€ 2,99</span></article>`
    );

    expect(first(html)?.price).toBe(2.99);
  });

  it("matches a page's anchors to its data past the tracking they carry", () => {
    const itemList = {
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: { "@type": "Product", name: "Oude kaas", url: "/p/oude-kaas" },
        },
      ],
    };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(itemList)}</script></head>
      <body><article><a href="/p/oude-kaas?ref=search">Oude kaas</a><span>€ 4,99</span></article></body></html>`;

    expect(readSearchResults(html, "https://shop.example.nl/zoeken?q=kaas")).toEqual([
      {
        name: "Oude kaas",
        url: "https://shop.example.nl/p/oude-kaas",
        price: 4.99,
        currency: "EUR",
      },
    ]);
  });

  it("takes the currency a page states once for the cards that state none", () => {
    const html = `<html><body><footer>Bezorgkosten € 4,95</footer>${["1", "2", "3"]
      .map(
        (n) =>
          `<article><a href="/p/${n}/kaas">Kaas ${n}</a><div><span>2</span><span>99</span></div></article>`
      )
      .join("")}</body></html>`;

    // A `.com` implies nothing; the page's own mark does.
    expect(currencyForUrl("https://shop.example.com/")).toBeNull();
    expect(first(html, "https://shop.example.com/search?q=kaas")).toMatchObject({
      price: 2.99,
      currency: "EUR",
    });
  });
});

describe("readProduct on a page that mentions other products", () => {
  it("reads the product the page is about, not the first one it lists", () => {
    const data = [
      {
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "Product",
            name: "Jonge kaas",
            url: "https://shop.example.nl/p/jonge-kaas",
            offers: { "@type": "Offer", price: "5.49", priceCurrency: "EUR" },
          },
        ],
      },
      {
        "@type": "Product",
        name: "Oude kaas",
        url: "https://shop.example.nl/p/oude-kaas",
        offers: { "@type": "Offer", price: "7.99", priceCurrency: "EUR" },
      },
    ];
    const html = `<html><head><title>Oude kaas</title><script type="application/ld+json">${JSON.stringify(data)}</script></head><body><h1>Oude kaas</h1></body></html>`;

    expect(readProduct(html, "https://shop.example.nl/p/oude-kaas?ref=list")).toMatchObject({
      name: "Oude kaas",
      price: 7.99,
    });
  });
});

describe("a results page with only a product or two on it", () => {
  it("reads the one product a page names, where a lone link would be a guess", () => {
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: { "@type": "Product", name: "Oude kaas 500 g", url: "/p/oude-kaas" },
        },
      ],
    };
    const html = `<html><head><title>Zoekresultaten</title>
      <script type="application/ld+json">${JSON.stringify(itemList)}</script></head>
      <body><article><a href="/p/oude-kaas">Oude kaas 500 g</a><span>€4,99</span><span>500 g</span></article></body></html>`;

    expect(readSearchResults(html, "https://shop.example.nl/zoeken?q=kaas")).toEqual([
      {
        name: "Oude kaas 500 g",
        url: "https://shop.example.nl/p/oude-kaas",
        price: 4.99,
        currency: "EUR",
        size: "500 g",
      },
    ]);
  });

  it("still guesses nothing from a page that names no products at all", () => {
    const html = `<html><head><title>Zoekresultaten</title></head><body>
      <a href="/over-ons">Over ons</a><a href="/contact">Contact</a></body></html>`;

    expect(readSearchResults(html, "https://shop.example.nl/zoeken?q=niets")).toEqual([]);
  });
});

describe("relative addresses", () => {
  it("resolves a product link against the page it was found on", () => {
    const html = `<html><body>
      <a href="/producten/product/1/kaas">Kaas €1,00</a>
      <a href="/producten/product/2/melk">Melk €2,00</a>
      <a href="/producten/product/3/boter">Boter €3,00</a>
    </body></html>`;
    const candidates = readSearchResults(html, "https://shop.example.nl/zoeken?q=test");

    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://shop.example.nl/producten/product/1/kaas",
      "https://shop.example.nl/producten/product/2/melk",
      "https://shop.example.nl/producten/product/3/boter",
    ]);
  });
});

describe("discovery: how a shop says it is searched", () => {
  it("follows an OpenSearch descriptor", () => {
    const html = `<html><head><link rel="search" type="application/opensearchdescription+xml"
      href="/opensearch.xml" title="Shop"></head><body></body></html>`;

    expect(readSearchAddressFromPage(html, "https://shop.example.kr/")).toEqual({
      kind: "opensearch",
      descriptionUrl: "https://shop.example.kr/opensearch.xml",
    });
  });

  it("reads the slot out of an OpenSearch template", () => {
    const xml = `<?xml version="1.0"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
      <Url type="application/x-suggestions+json" template="https://shop.example.kr/suggest?q={searchTerms}"/>
      <Url type="text/html" method="get" template="/찾기?단어={searchTerms}"/>
      </OpenSearchDescription>`;

    expect(readOpenSearchTemplate(xml, "https://shop.example.kr/opensearch.xml")).toBe(
      "https://shop.example.kr/%EC%B0%BE%EA%B8%B0?%EB%8B%A8%EC%96%B4={query}"
    );
  });

  it("leaves the optional parameters of an OpenSearch template out of the address", () => {
    const xml = `<?xml version="1.0"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
      <Url type="text/html" method="get" template="/search?q={searchTerms}&amp;page={startPage?}&amp;lang=nl"/>
      </OpenSearchDescription>`;

    expect(readOpenSearchTemplate(xml, "https://shop.example.kr/opensearch.xml")).toBe(
      "https://shop.example.kr/search?q={query}&lang=nl"
    );
  });

  it("refuses an OpenSearch template that needs something it cannot fill", () => {
    const xml = `<?xml version="1.0"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
      <Url type="text/html" method="get" template="/search?q={searchTerms}&amp;sid={sessionId}"/>
      </OpenSearchDescription>`;

    expect(readOpenSearchTemplate(xml, "https://shop.example.kr/opensearch.xml")).toBeNull();
  });

  it("takes the input name of a form marked as search, in a language it cannot read", () => {
    const html = `<html><body><form role="search" action="/찾기">
      <input type="text" name="단어"><button>go</button></form></body></html>`;

    expect(readSearchAddressFromPage(html, "https://shop.example.kr/")).toEqual({
      kind: "form",
      searchAddress: "https://shop.example.kr/%EC%B0%BE%EA%B8%B0?%EB%8B%A8%EC%96%B4={query}",
    });
  });

  it("takes the input name of a search-typed input, whatever it is called", () => {
    const html = `<html><body><form action="/szukaj">
      <input type="search" name="fraza"></form></body></html>`;

    expect(readSearchAddressFromPage(html, "https://shop.example.pl/")).toEqual({
      kind: "form",
      searchAddress: "https://shop.example.pl/szukaj?fraza={query}",
    });
  });

  it("keeps a form's hidden fields in the address", () => {
    const html = `<html><body><form role="search" action="/search">
      <input type="hidden" name="lang" value="nl"><input type="search" name="q">
      </form></body></html>`;

    expect(readSearchAddressFromPage(html, "https://shop.example.nl/")).toEqual({
      kind: "form",
      searchAddress: "https://shop.example.nl/search?lang=nl&q={query}",
    });
  });

  it("reports finding nothing as a normal outcome", () => {
    expect(
      readSearchAddressFromPage("<html><body><p>hi</p></body></html>", "https://x.nl/")
    ).toBeNull();
  });
});
