"use client";

import { useEffect, useState } from "react";
import { usePanelPortalContainer } from "@/components/Panel/Panel";
import { ActionButton } from "@/components/shared/action-button";
import { useShopSearch, useStoreProducts } from "@/hooks/stores";
import { formatShelfPrice } from "@/lib/format-price";
import { ComboBox, Input, Label, ListBox, TextField } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { StoreProductChoice, StoreProductDto } from "@norish/shared/contracts";
import type { PricedCandidate } from "@norish/shared/lib/currency";
import { currencyForUrl, isPriced } from "@norish/shared/lib/currency";

/** How long a shopper stops typing before the shop is asked. */
const SEARCH_DEBOUNCE_MS = 400;

interface GroceryProductFieldProps {
  storeId: string;
  storeName: string;
  /** The shop's own website, which is what its currency is guessed from. */
  storeWebsite: string | null;
  /** The grocery's name as it will be stored; the Product Link is keyed by it. */
  groceryName: string;
  /** What this grocery is linked to now, which is what the field opens reading. */
  linkedProduct: StoreProductDto | null;
  choice: StoreProductChoice | null;
  onChoice: (choice: StoreProductChoice | null) => void;
}

/** One row of the dropdown, whichever list it came from. */
interface ProductRow {
  key: string;
  name: string;
  detail: string;
  choice: StoreProductChoice;
}

function candidateRow(candidate: PricedCandidate, locale: string): ProductRow {
  return {
    key: candidate.url,
    name: candidate.name,
    detail: [formatShelfPrice(locale, candidate.price, candidate.currency), candidate.size]
      .filter(Boolean)
      .join(" · "),
    choice: { kind: "candidate", candidate },
  };
}

function productRow(product: StoreProductDto, locale: string): ProductRow {
  return {
    key: product.id,
    name: product.name,
    detail: [formatShelfPrice(locale, product.price, product.currency), product.size]
      .filter(Boolean)
      .join(" · "),
    choice: { kind: "product", storeProductId: product.id },
  };
}

/** Which row the held choice is, so the field reads what is linked. */
function selectedKey(choice: StoreProductChoice | null): string | null {
  if (choice?.kind === "product") return choice.storeProductId;
  if (choice?.kind === "candidate") return choice.candidate.url;

  return null;
}

/**
 * Which of the shop's products this grocery is, as a field of the grocery
 * panel like any other: it reads what the grocery is linked to now, asks the
 * shop as you type, and drops down what it answered with the price beside it.
 *
 * The shop has already filtered, so the list is never filtered again here — a
 * search for "beleg" that answers "Oude kaas" must still offer it.
 *
 * The shop is asked only once somebody uses the field. Opening this panel to
 * rename a grocery must not send anyone's household to a supermarket.
 *
 * Nothing here writes anything: the choice is held by the panel and committed
 * by its own Save or Add, because writing on tap reads as "it saved without me
 * saving".
 */
export function GroceryProductField({
  storeId,
  storeName,
  storeWebsite,
  groceryName,
  linkedProduct,
  choice,
  onChoice,
}: GroceryProductFieldProps) {
  const t = useTranslations("groceries.picker");
  const locale = useLocale();
  const portalContainer = usePanelPortalContainer();
  const opensWith = linkedProduct?.name ?? "";
  const [term, setTerm] = useState(opensWith);
  const [searchedTerm, setSearchedTerm] = useState(groceryName);
  const [asked, setAsked] = useState(false);
  const [typed, setTyped] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [manualName, setManualName] = useState(groceryName);
  const [manualCurrency, setManualCurrency] = useState("");

  useEffect(() => {
    setTerm(opensWith);
    setManualName(groceryName);
  }, [groceryName, opensWith]);

  // The shop is asked about what was typed, once the typing stops. Never
  // about the linked product's own name: that question is already answered.
  useEffect(() => {
    if (!typed) return;
    const timer = setTimeout(() => setSearchedTerm(term.trim() || groceryName), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, groceryName, typed]);

  // What this Store already knows costs nothing to show, so opening the field
  // shows it. The shop itself is visited only for a question nobody has
  // answered yet: an unlinked grocery's own name, or something typed.
  const searches = asked && (typed || !linkedProduct);
  const search = useShopSearch(storeId, searchedTerm, searches);
  const products = useStoreProducts(storeId, asked);
  const candidates = (search.data?.candidates ?? []).filter(isPriced);
  const known = products.data ?? [];
  const storedByPage = new Map(
    known
      .filter((product) => product.pageUrl)
      .map((product) => [product.pageUrl ?? "", product] as const)
  );
  const offered = new Set(candidates.map((candidate) => candidate.url));
  // One product, one row. A result the Store already has a product for is that
  // product: it carries the price Norish read from the product's own page, and
  // it is what a link can point at.
  const rows = [
    ...candidates.map((candidate) => {
      const stored = storedByPage.get(candidate.url);

      return stored ? productRow(stored, locale) : candidateRow(candidate, locale);
    }),
    ...known
      .filter((product) => !product.pageUrl || !offered.has(product.pageUrl))
      .map((product) => productRow(product, locale)),
  ];
  const isSearching = searches && (search.isPending || search.isFetching);
  const foundNothing = searches && !isSearching && rows.length === 0;

  // What the shop is most likely to charge in, so the field is a confirmation
  // rather than a question: what this Store's products are already priced in,
  // else what its website's top-level domain implies.
  const suggestedCurrency =
    known[0]?.currency ?? candidates[0]?.currency ?? currencyForUrl(storeWebsite) ?? "EUR";
  const currency = (manualCurrency.trim() || suggestedCurrency).toUpperCase();
  // What the field holds costs this, so the panel says so rather than making
  // somebody save and go back to the list to find out.
  const held =
    rows.find((row) => row.key === selectedKey(choice)) ??
    (choice?.kind === "manual"
      ? { detail: formatShelfPrice(locale, choice.price, choice.currency) }
      : linkedProduct
        ? productRow(linkedProduct, locale)
        : null);

  return (
    <div className="flex flex-col gap-2">
      <ComboBox
        allowsEmptyCollection
        // The shop filtered already, and it knows things about its own
        // products that their names do not say.
        defaultFilter={() => true}
        inputValue={term}
        menuTrigger="focus"
        selectedKey={selectedKey(choice)}
        variant="secondary"
        onInputChange={(value) => {
          setAsked(true);
          setTyped(true);
          setTerm(value);
        }}
        onSelectionChange={(key) => {
          const row = rows.find((candidate) => candidate.key === String(key));

          if (row) {
            onChoice(row.choice);
            setTerm(row.name);
          }
        }}
      >
        <Label>{t("productLabel", { store: storeName })}</Label>
        <ComboBox.InputGroup>
          <Input
            data-testid="grocery-product-field"
            placeholder={t("searchPlaceholder")}
            onFocus={() => setAsked(true)}
          />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover UNSTABLE_portalContainer={portalContainer}>
          <ListBox renderEmptyState={() => null}>
            {rows.map((row) => (
              <ListBox.Item
                key={row.key}
                data-testid="product-option"
                id={row.key}
                textValue={row.name}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="text-muted shrink-0 text-xs tabular-nums">{row.detail}</span>
                </div>
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>

      {held?.detail && (
        <p className="text-muted text-xs" data-testid="product-price">
          {t("costs", { price: held.detail })}
        </p>
      )}

      {isSearching && (
        <p className="text-muted text-xs" data-testid="product-searching">
          {t("searching", { store: storeName })}
        </p>
      )}

      {foundNothing && (
        <div className="flex flex-col gap-3 pt-1" data-testid="product-by-hand">
          <p className="text-muted text-xs">{t("nothingFound", { store: storeName })}</p>
          <TextField value={manualName} onChange={setManualName}>
            <Label>{t("byHandName")}</Label>
            <Input variant="secondary" />
          </TextField>
          <div className="flex gap-3">
            <TextField className="flex-1" value={manualPrice} onChange={setManualPrice}>
              <Label>{t("byHandPrice")}</Label>
              <Input
                data-testid="product-by-hand-price"
                inputMode="decimal"
                placeholder="0.00"
                variant="secondary"
              />
            </TextField>
            <TextField className="w-24" value={manualCurrency} onChange={setManualCurrency}>
              <Label>{t("byHandCurrency")}</Label>
              <Input
                data-testid="product-by-hand-currency"
                maxLength={3}
                placeholder={suggestedCurrency}
                variant="secondary"
              />
            </TextField>
          </div>
          <ActionButton
            action="add"
            isDisabled={
              Number.isNaN(Number(manualPrice.replace(",", "."))) || currency.length !== 3
            }
            size="sm"
            variant="tertiary"
            onPress={() => {
              const price = Number(manualPrice.replace(",", "."));

              if (!Number.isFinite(price) || price < 0 || !manualPrice.trim()) return;
              onChoice({
                kind: "manual",
                id: crypto.randomUUID(),
                name: manualName.trim() || groceryName,
                price,
                currency,
              });
              setTerm(manualName.trim() || groceryName);
            }}
          >
            {t("useThisPrice")}
          </ActionButton>
          {choice?.kind === "manual" && (
            <p className="text-accent text-xs" data-testid="product-by-hand-chosen">
              {t("byHandChosen", {
                price: formatShelfPrice(locale, choice.price, choice.currency),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
