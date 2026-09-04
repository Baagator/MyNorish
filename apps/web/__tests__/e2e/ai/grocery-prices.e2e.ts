/**
 * Grocery prices, in a browser, against a shop the harness serves itself.
 *
 * The two paths a shopper actually walks: a name the Store recognises without
 * being asked, which is priced on its own; and a name it does not, which
 * opens the picker and is chosen by hand. The real Norish server, database,
 * Redis, the always-on store lookup worker, the reader, tRPC and realtime are
 * all in the path — only the supermarket is ours, because visiting a real one
 * from a test suite would be flaky and rude in equal measure.
 */
import type { Page } from "@playwright/test";

import type { FakeShop } from "../harness/fake-shop";
import { createFakeShop } from "../harness/fake-shop";
import { expect, test } from "./fixture";
import { createShopStore, readStoredLink } from "./grocery-prices-support";

test.describe.configure({ mode: "serial" });

const STORE_NAME = "E2E Shop";

let shop: FakeShop;
let page: Page;

test.beforeAll(async ({ browser, aiStack }) => {
  shop = createFakeShop();
  await shop.start();
  await createShopStore(STORE_NAME, shop.url);

  const context = await browser.newContext({
    baseURL: aiStack.baseURL,
    storageState: { cookies: aiStack.ownerCookies, origins: [] },
  });

  page = await context.newPage();
});

test.afterAll(async () => {
  await page?.context().close();
  await shop?.stop();
});

/** Add a grocery to the Store the harness serves, through the panel a user uses. */
async function addGroceryToShop(name: string): Promise<void> {
  await page.goto("/groceries");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByPlaceholder("e.g., 2 lbs chicken breast").fill(name);
  await page.getByRole("button", { name: /Auto-detect from history/ }).click();
  await page.getByRole("option", { name: STORE_NAME }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  // The add panel stays open for batch adding; the list underneath is what
  // every assertion here is about.
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("a name the shop states unmistakably is priced without being asked", async () => {
  await addGroceryToShop("kaas");

  // The lookup is a queue job — the add returned long before the shop answered
  // — and the price it landed reaches this already-open page over the Store
  // subscription, with no reload anywhere in this assertion.
  const price = page.getByTestId("grocery-price").first();

  await expect(price).toContainText(/4[.,]99/, { timeout: 60_000 });
  await expect(price).toContainText("500 g");
  // The row says which of the shop's products that price is for.
  await expect(page.getByTestId("grocery-product").first()).toHaveText("Oude kaas 500 g");
  expect((await readStoredLink("kaas"))?.productName).toBe("Oude kaas 500 g");
});

test("the grocery's own panel says which product it is, and can be pointed at another", async () => {
  await page.getByText("kaas").first().click();

  // The field reads what is linked now rather than opening empty.
  await expect(page.getByTestId("grocery-product-field")).toHaveValue("Oude kaas 500 g");

  await page.getByTestId("grocery-product-field").click();
  await page.getByRole("option", { name: /Roomboter/ }).click({ timeout: 30_000 });

  // Still nothing written: the panel's own Save is what commits a choice.
  expect((await readStoredLink("kaas"))?.productName).toBe("Oude kaas 500 g");

  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect
    .poll(async () => (await readStoredLink("kaas"))?.productName, { timeout: 30_000 })
    .toBe("Roomboter 250 g");
  await expect(page.getByTestId("grocery-product").first()).toHaveText("Roomboter 250 g");
});

test("the shop was visited once for the search and once for the product's own page", () => {
  expect(shop.visits.some((path) => path.startsWith("/search"))).toBe(true);
  expect(shop.visits).toContain("/p/oude-kaas");
});

test("a name the Store already knows is priced with no outbound request at all", async () => {
  await addGroceryToShop("melk");

  const priced = page.getByTestId("grocery-price").filter({ hasText: /1[.,]29/ });

  await expect(priced).toBeVisible({ timeout: 60_000 });

  // The Product Link is keyed by name, so it outlives the list line that
  // prompted it: next week's "melk" is priced without asking the shop again.
  await page.getByText("melk").first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(priced).toBeHidden();

  const visitsBefore = shop.visits.length;

  await addGroceryToShop("melk");

  await expect(priced).toBeVisible();
  expect(shop.visits.length).toBe(visitsBefore);
});

test("a name the shop does not state is left to the shopper, and priced on Save", async () => {
  await addGroceryToShop("beleg");

  // A Miss is written, so the name is not searched again every time the list
  // is opened, and the row simply carries no price rather than an error.
  await expect
    .poll(async () => (await readStoredLink("beleg"))?.productName ?? "miss", { timeout: 60_000 })
    .toBe("miss");

  await page.reload();
  await page.getByText("beleg").first().click();
  await page.getByTestId("grocery-product-field").click();
  await page.getByRole("option", { name: /Bruin brood/ }).click({ timeout: 30_000 });

  // Nothing is written until the panel's own Save.
  expect((await readStoredLink("beleg"))?.productName ?? null).toBeNull();

  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect
    .poll(async () => (await readStoredLink("beleg"))?.productName, { timeout: 30_000 })
    .toBe("Bruin brood");

  await expect(page.getByTestId("grocery-product").filter({ hasText: "Bruin brood" })).toBeVisible();
});
