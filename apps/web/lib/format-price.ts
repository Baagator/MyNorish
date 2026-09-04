/**
 * A Shelf Price as a shopper reads it: the shop's own currency, the reader's
 * own locale. Never a price per kilo — that is a different number Norish does
 * not show.
 */
export function formatShelfPrice(locale: string, price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(price);
  } catch {
    // An unknown currency code is the shop's business, not a reason to show
    // the reader nothing.
    return `${currency} ${price.toFixed(2)}`;
  }
}
