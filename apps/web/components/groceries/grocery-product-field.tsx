"use client";

import { useEffect, useRef, useState } from "react";
import { usePanelPortalContainer } from "@/components/Panel/Panel";
import { useShopSearch, useStoreProducts } from "@/hooks/stores";
import { formatShelfPrice } from "@/lib/format-price";
import { ComboBox, Header, Input, Label, ListBox, TextField } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";

import type { StoreDto, StoreProductChoice, StoreProductDto } from "@norish/shared/contracts";
import type { PricedCandidate } from "@norish/shared/lib/currency";
import { currencyForUrl, isPriced } from "@norish/shared/lib/currency";
import { createClientId } from "@norish/shared/lib/operation-helpers";

/** How long a shopper stops typing before the shop is asked. */
const SEARCH_DEBOUNCE_MS = 400;

/** Every field of the grocery panel is this tall, and 16px so iOS does not zoom. */
const FIELD_CLASS = "h-12 text-base";
const FIELD_STYLE = { fontSize: "16px" } as const;

interface GroceryProductFieldProps {
  store: StoreDto;
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
  price: number;
  currency: string;
  choice: StoreProductChoice;
}

function priceDetail(
  locale: string,
  price: number,
  currency: string,
  size: string | null | undefined
): string {
  return [formatShelfPrice(locale, price, currency), size].filter(Boolean).join(" · ");
}

function candidateRow(candidate: PricedCandidate, locale: string): ProductRow {
  return {
    key: candidate.url,
    name: candidate.name,
    detail: priceDetail(locale, candidate.price, candidate.currency, candidate.size),
    price: candidate.price,
    currency: candidate.currency,
    choice: { kind: "candidate", candidate },
  };
}

function productRow(product: StoreProductDto, locale: string): ProductRow {
  return {
    key: product.id,
    name: product.name,
    detail: priceDetail(locale, product.price, product.currency, product.size),
    price: product.price,
    currency: product.currency,
    choice: { kind: "product", storeProductId: product.id },
  };
}

/** Which row the held choice is, so the field reads what is linked. */
function selectedKey(choice: StoreProductChoice | null): string | null {
  if (choice?.kind === "product") return choice.storeProductId;
  if (choice?.kind === "candidate") return choice.candidate.url;

  return null;
}

/** A name's own words, for holding one name against another. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whether a product the Store already stored is an answer to this question.
 * The shop filters its own answers; nothing filters what the Store has lying
 * around, so a search for "cola" must not hand back last week's cheese.
 */
function answers(name: string, term: string): boolean {
  const asked = words(term);

  if (asked.length === 0) return true;
  const has = words(name);

  // A long enough word may sit inside one of the name's own — "cola" answers
  // "Coca-Cola" — but a short one must be a word in its own right, or the "l"
  // of "1 L" would answer every question with an l in it.
  return asked.some((word) =>
    word.length < 3 ? has.includes(word) : has.some((part) => part.includes(word))
  );
}

/**
 * Which of the shop's products this grocery is, as a field of the grocery
 * panel like any other: it reads what the grocery is linked to now, asks the
 * shop as you type, and drops down what it answered with the price beside it.
 *
 * The dropdown says where each row came from, because the two are not the same
 * kind of fact: what the Store already knows is there instantly and is what
 * next week's list will be priced from, while the shop's own answers are being
 * read right now and take as long as that shop takes.
 *
 * The shop has already filtered, so its answers are never filtered again here
 * — a search for "beleg" that answers "Oude kaas" must still offer it. What the
 * Store has stored was filtered by nobody, so it is held against the question.
 *
 * The shop itself is visited only for a question nobody has answered: the
 * grocery's own name while it is unlinked, or something typed. Opening a
 * grocery to rename it must not send anyone's household to a supermarket.
 *
 * A Store with no shop behind it has no such field at all — pricing is
 * something a Store gains, and an ordinary Store is a heading. A Store that
 * points at a shop Norish could not make a search out of keeps the field, dead
 * and saying why, because there is a link to go and correct.
 *
 * Nothing here writes anything: the choice is held by the panel and committed
 * by its own Save or Add, because writing on tap reads as "it saved without me
 * saving".
 */
export function GroceryProductField({
  store,
  groceryName,
  linkedProduct,
  choice,
  onChoice,
}: GroceryProductFieldProps) {
  const t = useTranslations("groceries.picker");
  const locale = useLocale();
  const portalContainer = usePanelPortalContainer();
  const canSearch = Boolean(store.searchAddress);
  const pointsAtShop = Boolean(store.website ?? store.searchAddress);
  const opensWith = linkedProduct?.name ?? "";
  const [term, setTerm] = useState(opensWith);
  const [searchedTerm, setSearchedTerm] = useState(() => groceryName.trim());
  const [asked, setAsked] = useState(false);
  const [typed, setTyped] = useState(false);
  const [picked, setPicked] = useState<string | null>(() => selectedKey(choice));
  // Whether the fields below still show the shop's own numbers, or the
  // shopper's. Only a shopper who typed over them owns them.
  const [byHand, setByHand] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [manualName, setManualName] = useState(groceryName);
  const [manualCurrency, setManualCurrency] = useState("");
  const [manualId] = useState(createClientId);
  const heldByHand = useRef("");

  // Until the shopper types, the question is the grocery's own name, which the
  // panel above may still be being filled in; after they type it is what they
  // typed, once the typing stops. Never the linked product's own name: that
  // question is already answered.
  useEffect(() => {
    if (!typed) {
      setSearchedTerm(groceryName.trim());

      return;
    }
    const timer = setTimeout(
      () => setSearchedTerm(term.trim() || groceryName.trim()),
      SEARCH_DEBOUNCE_MS
    );

    return () => clearTimeout(timer);
  }, [term, groceryName, typed]);

  const wants = canSearch && asked && (typed || !linkedProduct);
  // Exactly the query's own `enabled`, so what the field says about the search
  // and what the search is doing cannot drift apart.
  const asking = wants && searchedTerm.trim().length > 0;
  const search = useShopSearch(store.id, searchedTerm, asking);
  const products = useStoreProducts(store.id, asked);
  const candidates = (search.data?.candidates ?? []).filter(isPriced);
  const stored = products.data ?? [];
  const storedByPage = new Map(
    stored
      .filter((product) => product.pageUrl)
      .map((product) => [product.pageUrl ?? "", product] as const)
  );
  const offered = new Set(candidates.map((candidate) => candidate.url));
  // One product, one row. A result the Store already has a product for is that
  // product: it carries the price Norish read from the product's own page, and
  // it is what a link can point at.
  const knownRows = stored
    .filter(
      (product) =>
        (product.pageUrl && offered.has(product.pageUrl)) ||
        product.id === picked ||
        answers(product.name, searchedTerm || groceryName)
    )
    .map((product) => productRow(product, locale));
  const shopRows = candidates
    .filter((candidate) => !storedByPage.has(candidate.url))
    .map((candidate) => candidateRow(candidate, locale));
  const rows = [...knownRows, ...shopRows];
  // A query nobody enabled sits in `pending` for ever, so a field that reads
  // `isPending` alone says it is searching long after it has stopped.
  const isSearching = asking && (search.isPending || search.isFetching);
  // Whether the *shop* answered with nothing, not whether the dropdown is
  // empty: a Store that already knows other products still has a shop that
  // cannot price this one.
  const foundNothing = asking && !isSearching && candidates.length === 0;

  // What the shop is most likely to charge in, so the field is a confirmation
  // rather than a question: what this Store's products are already priced in,
  // else what its website's top-level domain implies.
  const suggestedCurrency =
    stored[0]?.currency ?? candidates[0]?.currency ?? currencyForUrl(store.website) ?? "EUR";
  const currency = (manualCurrency.trim() || suggestedCurrency).toUpperCase();
  const typedPrice = Number(manualPrice.replace(",", "."));
  const hasTypedPrice =
    manualPrice.trim() !== "" &&
    Number.isFinite(typedPrice) &&
    typedPrice >= 0 &&
    currency.length === 3;

  /** The fields below say what this costs, until somebody types over them. */
  const showAs = (name: string, price: number, priceCurrency: string) => {
    setByHand(false);
    setManualName(name);
    setManualPrice(String(price));
    setManualCurrency(priceCurrency);
    heldByHand.current = "";
  };

  useEffect(() => {
    setTerm(opensWith);
  }, [opensWith]);

  // What the grocery is linked to now is what the fields open reading, so the
  // panel has its whole shape from the first frame.
  useEffect(() => {
    if (byHand) return;
    if (linkedProduct) {
      setManualName(linkedProduct.name);
      setManualPrice(String(linkedProduct.price));
      setManualCurrency(linkedProduct.currency);

      return;
    }
    setManualName(groceryName);
  }, [byHand, groceryName, linkedProduct]);

  // A price the shopper typed is the choice as soon as it is a price — over a
  // product they picked as readily as over a shop that found nothing, because
  // Norish never overwrites a price it read from a shop's own page. There is
  // nothing to press: the panel's own Save is what commits it.
  useEffect(() => {
    if (!byHand) return;
    const held = hasTypedPrice ? `${manualName}|${typedPrice}|${currency}` : "";

    if (heldByHand.current === held) return;
    heldByHand.current = held;
    onChoice(
      hasTypedPrice
        ? {
            kind: "manual",
            id: manualId,
            name: manualName.trim() || groceryName,
            price: typedPrice,
            currency,
          }
        : null
    );
  }, [byHand, hasTypedPrice, manualName, typedPrice, currency, groceryName, manualId, onChoice]);

  // The fields are the answer to "what does this cost", so they are there
  // whenever there is an answer to show or one to be typed.
  const showsPrice = Boolean(picked) || Boolean(linkedProduct) || foundNothing || byHand;

  // Hooks first, and only then: a Store that points at no shop has nothing to
  // ask and nothing to show.
  if (!pointsAtShop) return null;

  return (
    <div className="flex flex-col gap-2">
      <ComboBox
        allowsEmptyCollection
        inputValue={term}
        isDisabled={!canSearch}
        // The rows are the answer already: the shop filtered its own products,
        // and what the Store had lying around was held against the question
        // above. Handing the rows over says so, and a ComboBox told its list is
        // filtered leaves the collection exactly as this component built it.
        items={rows}
        menuTrigger="focus"
        selectedKey={picked}
        variant="secondary"
        onInputChange={(value) => {
          setAsked(true);
          setTyped(true);
          setTerm(value);
        }}
        onSelectionChange={(key) => {
          const row = rows.find((candidate) => candidate.key === String(key));

          if (!row) return;
          setPicked(row.key);
          setTerm(row.name);
          showAs(row.name, row.price, row.currency);
          onChoice(row.choice);
        }}
      >
        <Label>{t("productLabel", { store: store.name })}</Label>
        <ComboBox.InputGroup>
          <Input
            className={FIELD_CLASS}
            data-testid="grocery-product-field"
            placeholder={canSearch ? t("searchPlaceholder") : t("cannotSearch")}
            style={FIELD_STYLE}
            onFocus={() => setAsked(true)}
          />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover UNSTABLE_portalContainer={portalContainer}>
          <ListBox renderEmptyState={() => null}>
            {knownRows.length > 0 && (
              <ListBox.Section>
                <Header className="text-muted px-2 py-1 text-xs" data-testid="product-group-known">
                  {t("knownGroup")}
                </Header>
                {knownRows.map((row) => (
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
              </ListBox.Section>
            )}
            {(isSearching || shopRows.length > 0) && (
              <ListBox.Section>
                <Header className="text-muted px-2 py-1 text-xs" data-testid="product-group-shop">
                  {isSearching ? t("searching", { store: store.name }) : t("shopGroup")}
                </Header>
                {shopRows.map((row) => (
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
              </ListBox.Section>
            )}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>

      {!canSearch && (
        <p className="text-muted text-xs" data-testid="product-cannot-search">
          {t("cannotSearchHint", { store: store.name })}
        </p>
      )}

      {isSearching && (
        <p className="text-muted text-xs" data-testid="product-searching">
          {t("searching", { store: store.name })}
        </p>
      )}

      {showsPrice && (
        <div className="flex flex-col gap-3 pt-1" data-testid="product-by-hand">
          {foundNothing && !picked && (
            <p className="text-muted text-xs">{t("nothingFound", { store: store.name })}</p>
          )}
          <TextField
            value={manualName}
            onChange={(value) => {
              setByHand(true);
              setManualName(value);
            }}
          >
            <Label>{t("byHandName")}</Label>
            <Input
              className={FIELD_CLASS}
              data-testid="product-by-hand-name"
              style={FIELD_STYLE}
              variant="secondary"
            />
          </TextField>
          <div className="flex gap-3">
            <TextField
              className="flex-1"
              value={manualPrice}
              onChange={(value) => {
                setByHand(true);
                setManualPrice(value);
              }}
            >
              <Label>{t("byHandPrice")}</Label>
              <Input
                className={FIELD_CLASS}
                data-testid="product-by-hand-price"
                inputMode="decimal"
                placeholder="0.00"
                style={FIELD_STYLE}
                variant="secondary"
              />
            </TextField>
            <TextField
              className="w-28"
              value={manualCurrency}
              onChange={(value) => {
                setByHand(true);
                setManualCurrency(value);
              }}
            >
              <Label>{t("byHandCurrency")}</Label>
              <Input
                className={FIELD_CLASS}
                data-testid="product-by-hand-currency"
                maxLength={3}
                placeholder={suggestedCurrency}
                style={FIELD_STYLE}
                variant="secondary"
              />
            </TextField>
          </div>
        </div>
      )}
    </div>
  );
}
