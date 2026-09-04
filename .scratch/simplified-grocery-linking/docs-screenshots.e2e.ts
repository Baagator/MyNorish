/**
 * Capture the documentation screenshots for grocery prices against the same
 * harness-served shop the browser scenarios use, so the pictures in the docs
 * show the real app and no real supermarket is visited to make them.
 *
 * Not part of the gate. To re-capture: copy this file into
 * `apps/web/__tests__/e2e/ai/`, build (`pnpm build:web && pnpm build:server`),
 * run `pnpm exec playwright test --config __tests__/e2e/playwright.config.ts
 * --project=ai __tests__/e2e/ai/docs-screenshots.e2e.ts` from `apps/web`, and
 * move it back here.
 */
import path from "node:path";
import type { Page } from "@playwright/test";

import type { FakeShop } from "../harness/fake-shop";
import { createFakeShop } from "../harness/fake-shop";
import { expect, test } from "./fixture";
import { createShopStore } from "./grocery-prices-support";

test.describe.configure({ mode: "serial" });

const STORE_NAME = "Dirk";
const SHOTS = path.resolve(import.meta.dirname, "../../../../../apps/docs/static/img/screenshots");

let shop: FakeShop;
let page: Page;

test.beforeAll(async ({ browser, aiStack }) => {
  shop = createFakeShop();
  await shop.start();
  await createShopStore(STORE_NAME, shop.url);

  const context = await browser.newContext({
    baseURL: aiStack.baseURL,
    storageState: { cookies: aiStack.ownerCookies, origins: [] },
    viewport: { width: 1100, height: 820 },
    deviceScaleFactor: 1.5,
    reducedMotion: "reduce",
  });

  page = await context.newPage();
});

test.afterAll(async () => {
  await page?.context().close();
  await shop?.stop();
});

async function addGrocery(name: string): Promise<void> {
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByPlaceholder("e.g., 2 lbs chicken breast").fill(name);
  await page.getByRole("button", { name: /Auto-detect from history/ }).click();
  await page.getByRole("option", { name: STORE_NAME }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
}

test("captures the store form with a derived Search Address", async () => {
  await page.goto("/groceries");
  await page.getByRole("button", { name: "Add Item" }).waitFor();
  await page.getByRole("button", { name: "View Mode" }).click();
  await page.getByRole("menuitem", { name: "Manage Stores" }).click();
  await page.getByRole("button", { name: "Edit" }).first().click();
  // A recognisable address rather than the harness's loopback port. The
  // derivation is pure, and this screenshot cancels rather than saving, so
  // nothing is ever fetched from it.
  await page.getByTestId("store-shop-link").fill("https://www.dirk.nl/zoeken/producten/kaas");
  await expect(page.getByTestId("search-address-preview")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "groceries-store-link.png") });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Close panel" }).click();
});

test("captures a priced shopping list", async () => {
  await page.goto("/groceries");
  await addGrocery("kaas");
  await addGrocery("melk");
  await addGrocery("brood");

  await expect
    .poll(
      async () => {
        await page.reload();

        return page.getByTestId("grocery-price").count();
      },
      { timeout: 90_000 }
    )
    .toBeGreaterThanOrEqual(3);

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, "groceries-prices.png") });
});

test("captures the picker", async () => {
  await page.goto("/groceries");
  await addGrocery("beleg");
  await expect(page.getByTestId("pick-price").first()).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("pick-price").first().click();
  await page.getByTestId("picker-search").click();
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "groceries-picker.png") });
});
