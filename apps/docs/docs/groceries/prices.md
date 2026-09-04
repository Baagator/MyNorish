---
sidebar_position: 1
title: Prices
description: Point a Store at a real shop and Norish shows what a grocery costs there, reading the shop's own pages without an AI provider.
---

# Prices

A **Store** in Norish is a heading your groceries are grouped under: a name, a
colour, an order you chose. A Store can additionally point at a real shop's
website, and once it does, Norish can show what the things on your list cost
there.

Everything on this page is optional. A Store with no website is an ordinary
Store and always was.

## Pointing a Store at a shop

Open **Manage Stores**, add or edit a store, and paste a link into **Shop
link**. You never have to write a template: paste either

- the shop's homepage — `https://www.example.nl` — and Norish looks for its
  search page, or
- a search you just ran there — `https://www.example.nl/zoeken?query=kaas` —
  and Norish takes the term out of it.

Underneath the field you see what Norish made of the paste: the **Search
Address**, with `{query}` marking where a search term goes, and an example of
it resolved. The field stays yours to correct — if the guess picked the wrong
part of the address, move `{query}` yourself.

![The store form, showing the Search Address derived from a pasted link](/img/screenshots/groceries-store-link.png)

When you save, Norish tries the address once and tells you what it found:
how many priced products came back, that the shop answered but stated no
prices, or that it did not answer at all. It saves either way — the message is
there so a wrong link is caught while you are still holding it.

:::note Which term is used to test
If your paste contained a real search, Norish tests the address with **your**
word, because that word is known to have results at that shop. A fixed English
probe would report "no products found" against a Polish shop that works
perfectly.
:::

## What a grocery costs

A priced grocery shows its **Shelf Price** on the row, with the shop's own
words for the pack beside it: `€2.99 · 150 gram`. The size is left out when
the shop states none.

![A shopping list with prices on its rows](/img/screenshots/groceries-prices.png)

The Shelf Price is what one pack costs — the number on the shelf edge, not a
price per kilo. Norish keeps only the price it last read, and refreshes it
when it is more than twelve hours old and you are looking at the list.

Adding a grocery never waits on a shop:

- a name the Store already knows is priced in the same breath, with no
  outbound request at all;
- a name it does not know goes to a queue, and the price appears on your list
  the moment it lands — on your housemates' screens too.

Norish links a grocery to a product by itself only where you would not
hesitate: the names match, or every word of your grocery's name appears in
exactly one product's name. Anything less certain is left to you.

## Choosing the price yourself

An unpriced grocery in a Store with a Search Address offers **Add a price** on
its row. That opens the picker inside the grocery's own panel: it searches the
shop for the grocery's name, says so while it works, and offers what came
back. Products this Store already knows are listed underneath, and you can
search the shop for a different term.

![The picker, offering priced results from the shop](/img/screenshots/groceries-picker.png)

Your choice is marked immediately and written when you press **Save** or
**Add** — tapping around in the picker never changes what your household sees.

### A shop Norish cannot read

Some shops answer with nothing Norish can read. When a search comes back
empty, the picker offers to take a price by hand: a name, prefilled with the
grocery's, and the price you saw. That makes a Store Product like any other,
except that nothing Norish reads will ever overwrite it — a price you typed is
the last word.

## What this does not do yet

Deliberately, for now:

- no line totals or store totals, and no amount × price arithmetic;
- no comparable unit prices (€/kg) and no pack-size conversion;
- no sale badges, stock or availability;
- no price history — a Shelf Price is overwritten and the one it replaces is
  gone;
- prices are a web surface: they do not appear in the mobile app.

## For self-hosting operators

- **No AI provider is needed.** Shop pages are read with a fixed ladder over
  the structured data a shop already publishes for search engines, plus a pass
  over the product cards for the prices. There is no model in this path and
  nothing to pay for.
- **No new environment variables.** Nothing to change when you upgrade.
- **Norish will not hammer a shop on your behalf.** Store visits run on one
  always-on queue, one visit at a time, paced. There is no scheduled sweep:
  Norish never visits a supermarket for a list nobody is shopping.
- **Some shops need a browser.** A shop that turns a plain fetch away, or
  answers it with a bot challenge, is fetched through Obscura — the same
  headless browser Norish already uses for recipe imports. Without Obscura
  running, shops that answer a plain fetch still work, and the rest can be
  covered with hand-typed prices.
