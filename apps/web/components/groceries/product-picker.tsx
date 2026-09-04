"use client";

import { useEffect, useState } from "react";
import { usePanelPortalContainer } from "@/components/Panel/Panel";
import { ActionButton } from "@/components/shared/action-button";
import { useShopSearch, useStoreProducts } from "@/hooks/stores";
import { formatShelfPrice } from "@/lib/format-price";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { ComboBox, Input, Label, ListBox, TextField } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { StoreProductChoice, StoreProductDto } from "@norish/shared/contracts";
import type { PricedCandidate } from "@norish/shared/lib/currency";
import { currencyForUrl, isPriced } from "@norish/shared/lib/currency";

/** How long a shopper stops typing before the shop is asked. */
const SEARCH_DEBOUNCE_MS = 400;

interface ProductPickerProps {
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
  onBack: () => void;
}

/** One row of the dropdown, whichever list it came from. */
interface PickerRow {
  key: string;
  name: string;
  detail: string;
  choice: StoreProductChoice;
}

function candidateRow(candidate: PricedCandidate, locale: string): PickerRow {
  return {
    key: candidate.url,
    name: candidate.name,
    detail: [formatShelfPrice(locale, candidate.price, candidate.currency), candidate.size]
      .filter(Boolean)
      .join(" · "),
    choice: { kind: "candidate", candidate },
  };
}

function productRow(product: StoreProductDto, locale: string): PickerRow {
  return {
    key: product.id,
    name: product.name,
    detail: [formatShelfPrice(locale, product.price, product.currency), product.size]
      .filter(Boolean)
      .join(" · "),
    choice: { kind: "product", storeProductId: product.id },
  };
}

/** Which row the held choice is, so the field shows what is linked. */
function selectedKey(choice: StoreProductChoice | null): string | null {
  if (choice?.kind === "product") return choice.storeProductId;
  if (choice?.kind === "candidate") return choice.candidate.url;

  return null;
}

/**
 * A stage inside the grocery panel rather than a second panel over it: the
 * content swaps and the back affordance returns, which keeps the grocery's
 * name on screen while you choose for it and sidesteps the portal wiring a
 * stacked overlay inside a vaul panel would need.
 *
 * The field is a combo box over the shop's own search: what you type goes to
 * the shop, what it answers drops down, and what is linked now is what the
 * field reads. The shop has already filtered, so the list is never filtered
 * again here — a search for "beleg" that answers "Oude kaas" must still offer
 * it.
 *
 * Nothing here writes anything. A selection is held by the panel and committed
 * by its own Save, because writing on tap reads as "it saved without me
 * saving".
 */
export function ProductPicker({
  storeId,
  storeName,
  storeWebsite,
  groceryName,
  linkedProduct,
  choice,
  onChoice,
  onBack,
}: ProductPickerProps) {
  const t = useTranslations("groceries.picker");
  const tActions = useTranslations("common.actions");
  const locale = useLocale();
  const portalContainer = usePanelPortalContainer();
  // The field reads what is linked now, and asks the shop about it; with
  // nothing linked it is the grocery's own name, which is the first thing
  // worth searching for.
  const opensWith = linkedProduct?.name ?? groceryName;
  const [term, setTerm] = useState(opensWith);
  const [searchedTerm, setSearchedTerm] = useState(opensWith);
  const [manualPrice, setManualPrice] = useState("");
  const [manualName, setManualName] = useState(groceryName);
  const [manualCurrency, setManualCurrency] = useState("");

  useEffect(() => {
    setTerm(opensWith);
    setSearchedTerm(opensWith);
    setManualName(groceryName);
  }, [groceryName, opensWith]);

  // The shop is asked about what was typed, once the typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setSearchedTerm(term.trim() || opensWith), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, opensWith]);

  const search = useShopSearch(storeId, searchedTerm, true);
  const products = useStoreProducts(storeId, true);
  const candidates = (search.data?.candidates ?? []).filter(isPriced);
  const known = products.data ?? [];
  const storedByPage = new Map(
    known.filter((product) => product.pageUrl).map((product) => [product.pageUrl!, product])
  );
  const offered = new Set(candidates.map((candidate) => candidate.url));
  // One product, one row. A result the Store already has a product for is
  // that product: it carries the price Norish read from the product's own
  // page, and it is what a link can point at.
  const rows = [
    ...candidates.map((candidate) => {
      const stored = storedByPage.get(candidate.url);

      return stored ? productRow(stored, locale) : candidateRow(candidate, locale);
    }),
    ...known
      .filter((product) => !product.pageUrl || !offered.has(product.pageUrl))
      .map((product) => productRow(product, locale)),
  ];
  const isSearching = search.isPending || search.isFetching;
  const foundNothing = !isSearching && rows.length === 0;

  // What the shop is most likely to charge in, so the field is a confirmation
  // rather than a question: what this Store's products are already priced in,
  // else what its website's top-level domain implies.
  const suggestedCurrency =
    known[0]?.currency ?? candidates[0]?.currency ?? currencyForUrl(storeWebsite) ?? "EUR";
  const currency = (manualCurrency.trim() || suggestedCurrency).toUpperCase();
  const chooseManual = (price: number) => {
    onChoice({
      kind: "manual",
      id: crypto.randomUUID(),
      name: manualName.trim() || groceryName,
      price,
      currency,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          aria-label={tActions("back")}
          className="text-muted hover:text-foreground -ml-1 p-1"
          data-testid="picker-back"
          type="button"
          onClick={onBack}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium">{t("title", { name: groceryName })}</p>
      </div>

      <ComboBox
        allowsEmptyCollection
        // The shop filtered already, and it knows things about its own
        // products that their names do not say.
        defaultFilter={() => true}
        inputValue={term}
        menuTrigger="focus"
        selectedKey={selectedKey(choice)}
        variant="secondary"
        onInputChange={setTerm}
        onSelectionChange={(key) => {
          const row = rows.find((candidate) => candidate.key === String(key));

          if (row) {
            onChoice(row.choice);
            setTerm(row.name);
          }
        }}
      >
        <Label>{t("searchLabel", { store: storeName })}</Label>
        <ComboBox.InputGroup>
          <Input data-testid="picker-search" placeholder={t("searchPlaceholder")} />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover UNSTABLE_portalContainer={portalContainer}>
          <ListBox data-testid="picker-results" renderEmptyState={() => null}>
            {rows.map((row) => (
              <ListBox.Item
                key={row.key}
                data-testid="picker-result"
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

      {isSearching && (
        <p className="text-muted text-sm" data-testid="picker-searching">
          {t("searching", { store: storeName })}
        </p>
      )}

      {foundNothing && (
        <div className="flex flex-col gap-3" data-testid="picker-by-hand">
          <p className="text-muted text-sm">{t("nothingFound", { store: storeName })}</p>
          <TextField value={manualName} onChange={setManualName}>
            <Label>{t("byHandName")}</Label>
            <Input variant="secondary" />
          </TextField>
          <div className="flex gap-3">
            <TextField className="flex-1" value={manualPrice} onChange={setManualPrice}>
              <Label>{t("byHandPrice")}</Label>
              <Input
                data-testid="picker-by-hand-price"
                inputMode="decimal"
                placeholder="0.00"
                variant="secondary"
              />
            </TextField>
            <TextField className="w-24" value={manualCurrency} onChange={setManualCurrency}>
              <Label>{t("byHandCurrency")}</Label>
              <Input
                data-testid="picker-by-hand-currency"
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

              if (Number.isFinite(price) && price >= 0 && manualPrice.trim()) chooseManual(price);
            }}
          >
            {t("useThisPrice")}
          </ActionButton>
          {choice?.kind === "manual" && (
            <p className="text-accent text-sm" data-testid="picker-by-hand-chosen">
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
