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
words for the pack beside it — `€2.99 · 150 gram` — and, underneath, which of
the shop's products that price is for. The size is left out when the shop
states none.

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
hesitate: your grocery's name is a product's name to the letter, or every word
of it appears in exactly one product's name. Anything less certain is left to
you. A name that matches to the letter is taken however many listings carry
it, the first in the shop's own order; a product the shop lists twice under
two product numbers counts once in the dropdown, since there is nothing to
choose between.

## Choosing the product yourself

Which of the shop's products a grocery is, is a field of the grocery's own
panel — beside its store, where it belongs. Open a grocery and the **Product**
field reads whatever it is linked to now; open the dropdown and Norish asks the
shop about the grocery's own name, or about whatever you type instead.

The dropdown answers in two groups, because the two are not the same kind of
fact. **Already known** is what this Store has stored from earlier — there
instantly, no shop involved. **From the shop** is what the shop is answering
right now, and while a slow supermarket is still being read that group says
so, so you can see it working rather than guess.

![The product field in a grocery's panel, offering priced results from the shop](/img/screenshots/groceries-picker.png)

Picking one fills in the **Product name**, **Price** and **Currency** beneath
it, so the panel says what this costs where it says everything else. Nothing is
written until you press **Save** or **Add** — what you do in the dropdown
changes nothing your household sees until then. Norish asks the shop only once
you use the field, so opening a grocery to rename it sends nobody to a
supermarket, and a Store with no shop link shows the field greyed out rather
than pretending it can search.

Those three fields are yours to correct. Type over the price and it becomes
**your** price for that name at that Store: Norish never writes over a price it
read from a shop's own page, so a correction sits beside what the shop said
rather than through it.

### A shop Norish cannot read

Some shops answer with nothing Norish can read. When a search comes back
empty, the field offers to take a price by hand: a name, prefilled with the
grocery's, and the price and currency you saw. There is nothing to press — a
price you have typed is your choice, and Save writes it like any other. That
makes a Store Product like any other, except that nothing Norish reads will
ever overwrite it: a price you typed is the last word.

## What this does not do yet

Deliberately, for now:

- no amount × price arithmetic: a Store's heading adds up one Shelf Price per
  line still to buy, and a line the Store cannot price is left out of it;
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
