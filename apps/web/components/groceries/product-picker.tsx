"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/shared/action-button";
import { useShopSearch, useStoreProducts } from "@/hooks/stores";
import { formatShelfPrice } from "@/lib/format-price";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { Input, Label, TextField } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { StoreCandidate, StoreProductChoice, StoreProductDto } from "@norish/shared/contracts";

/** Only priced results are ever offered: the picker exists to show what a thing costs. */
type PricedCandidate = StoreCandidate & { price: number; currency: string };

interface ProductPickerProps {
  storeId: string;
  storeName: string;
  /** The grocery's name as it will be stored; the Product Link is keyed by it. */
  groceryName: string;
  choice: StoreProductChoice | null;
  onChoice: (choice: StoreProductChoice | null) => void;
  onBack: () => void;
}

function isChosenProduct(choice: StoreProductChoice | null, product: StoreProductDto): boolean {
  return choice?.kind === "product" && choice.storeProductId === product.id;
}

function isChosenCandidate(choice: StoreProductChoice | null, candidate: PricedCandidate): boolean {
  return choice?.kind === "candidate" && choice.candidate.url === candidate.url;
}

function PickerRow({
  name,
  detail,
  isSelected,
  onSelect,
  testId,
}: {
  name: string;
  detail: string;
  isSelected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      aria-pressed={isSelected}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${
        isSelected ? "bg-accent/15 text-accent" : "bg-surface hover:bg-surface-tertiary"
      }`}
      data-testid={testId}
      type="button"
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <span className="text-muted shrink-0 text-xs tabular-nums">{detail}</span>
    </button>
  );
}

/**
 * A stage inside the grocery panel rather than a second panel over it: the
 * content swaps and the back affordance returns, which keeps the grocery's
 * name on screen while you choose for it and sidesteps the portal wiring a
 * stacked overlay inside a vaul panel would need.
 *
 * Nothing here writes anything. A selection is held by the panel and committed
 * by its own Save, because writing on tap reads as "it saved without me
 * saving".
 */
export function ProductPicker({
  storeId,
  storeName,
  groceryName,
  choice,
  onChoice,
  onBack,
}: ProductPickerProps) {
  const t = useTranslations("groceries.picker");
  const tActions = useTranslations("common.actions");
  const locale = useLocale();
  const [term, setTerm] = useState(groceryName);
  const [searchedTerm, setSearchedTerm] = useState(groceryName);
  const [manualPrice, setManualPrice] = useState("");
  const [manualName, setManualName] = useState(groceryName);

  useEffect(() => {
    setTerm(groceryName);
    setSearchedTerm(groceryName);
    setManualName(groceryName);
  }, [groceryName]);

  const search = useShopSearch(storeId, searchedTerm, true);
  const products = useStoreProducts(storeId, true);
  const candidates = (search.data?.candidates ?? []).filter(
    (candidate): candidate is PricedCandidate =>
      candidate.price !== undefined && candidate.currency !== undefined
  );
  const offered = new Set(candidates.map((candidate) => candidate.url));
  // What the search already offered is not also "in this store": one product,
  // one row.
  const known = (products.data ?? []).filter(
    (product) => !product.pageUrl || !offered.has(product.pageUrl)
  );
  const isSearching = search.isPending || search.isFetching;
  const foundNothing = !isSearching && candidates.length === 0;

  const chooseManual = (price: number) => {
    const currency = known[0]?.currency ?? candidates[0]?.currency ?? "EUR";

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

      <TextField value={term} onChange={setTerm}>
        <Label>{t("searchLabel", { store: storeName })}</Label>
        <Input
          data-testid="picker-search"
          placeholder={t("searchPlaceholder")}
          variant="secondary"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setSearchedTerm(term.trim() || groceryName);
            }
          }}
        />
      </TextField>

      {isSearching && (
        <p className="text-muted text-sm" data-testid="picker-searching">
          {t("searching", { store: storeName })}
        </p>
      )}

      {!isSearching && candidates.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="picker-results">
          {candidates.map((candidate) => (
            <PickerRow
              key={candidate.url}
              detail={[
                formatShelfPrice(locale, candidate.price, candidate.currency),
                candidate.size,
              ]
                .filter(Boolean)
                .join(" · ")}
              isSelected={isChosenCandidate(choice, candidate)}
              name={candidate.name}
              testId="picker-result"
              onSelect={() => onChoice({ kind: "candidate", candidate })}
            />
          ))}
        </div>
      )}

      {known.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted text-xs font-medium">{t("inThisStore")}</p>
          {known.map((product) => (
            <PickerRow
              key={product.id}
              detail={[formatShelfPrice(locale, product.price, product.currency), product.size]
                .filter(Boolean)
                .join(" · ")}
              isSelected={isChosenProduct(choice, product)}
              name={product.name}
              testId="picker-known"
              onSelect={() => onChoice({ kind: "product", storeProductId: product.id })}
            />
          ))}
        </div>
      )}

      {foundNothing && (
        <div className="flex flex-col gap-3" data-testid="picker-by-hand">
          <p className="text-muted text-sm">{t("nothingFound", { store: storeName })}</p>
          <TextField value={manualName} onChange={setManualName}>
            <Label>{t("byHandName")}</Label>
            <Input variant="secondary" />
          </TextField>
          <TextField value={manualPrice} onChange={setManualPrice}>
            <Label>{t("byHandPrice")}</Label>
            <Input
              data-testid="picker-by-hand-price"
              inputMode="decimal"
              placeholder="0.00"
              variant="secondary"
            />
          </TextField>
          <ActionButton
            action="add"
            isDisabled={Number.isNaN(Number(manualPrice.replace(",", ".")))}
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
