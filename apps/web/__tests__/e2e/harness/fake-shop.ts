/**
 * A shop, served by the harness. The browser tests never touch a real
 * supermarket: that would be flaky and rude in equal measure, and a shop that
 * restyles its cards would break a test that is not about it.
 *
 * The pages are shaped like the real ones the reader is pinned against: a
 * results page that states its shelf in `ItemList` JSON-LD but prices it only
 * in the DOM, and product pages that state the authoritative Shelf Price in
 * `Product` JSON-LD.
 */
import { createServer } from "node:http";
import type { Server } from "node:http";

export interface FakeShopProduct {
  slug: string;
  name: string;
  price: string;
  size: string;
}

export const FAKE_SHOP_PRODUCTS: FakeShopProduct[] = [
  { slug: "oude-kaas", name: "Oude kaas 500 g", price: "4.99", size: "500 g" },
  { slug: "halfvolle-melk", name: "Halfvolle melk 1 L", price: "1.29", size: "1 L" },
  { slug: "roomboter", name: "Roomboter 250 g", price: "2.49", size: "250 g" },
  { slug: "bruin-brood", name: "Bruin brood", price: "1.79", size: "800 g" },
];

function resultsPage(): string {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: FAKE_SHOP_PRODUCTS.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: { "@type": "Product", name: product.name, url: `/p/${product.slug}` },
    })),
  };
  const cards = FAKE_SHOP_PRODUCTS.map(
    (product) =>
      `<article><a href="/p/${product.slug}">${product.name}</a><span>€${product.price.replace(
        ".",
        ","
      )}</span><span>${product.size}</span></article>`
  ).join("");

  return `<!doctype html><html lang="nl"><head><title>Zoekresultaten</title>
<script type="application/ld+json">${JSON.stringify(itemList)}</script></head>
<body><h1>Zoekresultaten</h1><div class="products">${cards}</div></body></html>`;
}

function productPage(product: FakeShopProduct): string {
  const node = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    weight: product.size,
    offers: { "@type": "Offer", price: product.price, priceCurrency: "EUR" },
  };

  return `<!doctype html><html lang="nl"><head><title>${product.name}</title>
<script type="application/ld+json">${JSON.stringify(node)}</script></head>
<body><h1>${product.name}</h1><p>${product.size}</p></body></html>`;
}

export interface FakeShop {
  url: string;
  /** Every path the shop was asked for, in order. */
  visits: string[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createFakeShop(): FakeShop {
  const visits: string[] = [];
  let server: Server | null = null;
  let url = "";

  return {
    get url() {
      return url;
    },
    visits,
    start: () =>
      new Promise((resolve, reject) => {
        const created = createServer((request, response) => {
          const path = request.url ?? "/";

          visits.push(path);
          const slug = path.startsWith("/p/") ? path.slice(3).split("?")[0] : null;
          const product = FAKE_SHOP_PRODUCTS.find((candidate) => candidate.slug === slug);

          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end(product ? productPage(product) : resultsPage());
        });

        created.once("error", reject);
        created.listen(0, "127.0.0.1", () => {
          const address = created.address();

          if (typeof address === "string" || address === null) {
            reject(new Error("The fake shop did not get a port"));

            return;
          }
          server = created;
          url = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      }),
    stop: () =>
      new Promise((resolve, reject) => {
        if (!server) {
          resolve();

          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
        server = null;
      }),
  };
}
