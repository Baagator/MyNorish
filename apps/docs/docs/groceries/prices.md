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

A priced grocery shows what it costs on the row — its **Line Cost** — with
the packs that were counted beside it, in the shop's own words for the pack:
`€5.98 · 2 × 500 gram`. Underneath is which of the shop's products that
price is for. One pack reads as the **Shelf Price** and the size, `€2.99 ·
150 gram`; the size is left out when the shop states none.

![A shopping list with Line Costs on its rows](/img/screenshots/groceries-prices.png)

The Shelf Price is what one pack costs — the number on the shelf edge, not a
price per kilo. Norish keeps only the price it last read, and refreshes it
when it is more than twelve hours old and you are looking at the list.

### How many packs

Norish counts the packs the way a till does. It reads the **Pack Size** —
what one Shelf Price buys — out of the shop's own size words, and holds your
grocery's amount against it:

- **"700 g flour"** against a 500 g pack is two packs. Packs are whole and
  rounded up strictly: 410 g against a pack of "ca. 405 g" is two, because a
  pack you cannot buy 1.02 of is a pack.
- **"2 cola"** is two of whatever the shop sells: a bare number is a number
  of packs.
- **"12 eggs"** against a box of ten is two boxes: when the shop counts the
  pack in pieces too, a bare number is a number of pieces.
- **"2 pak melk"** is two packs: a container word — pack, box, bottle, can,
  jar, bag — means packs.
- **"700 g bananas"** sold per kilo costs seven tenths of the kilo price. What
  a shop sells loose is priced by weight, so 300 g of it is not rounded up to
  a kilo. The row reads the cost and the weight priced: `€1.39 · 700 g`.
- A grocery with **no amount** costs one pack.

A line Norish cannot work out — a measure against something counted in
pieces, a unit it does not know such as a pinch or a slice, a product it read
no Pack Size for, or more than 24 packs — still shows a price: it counts one
pack, with a quiet note under the product name saying so. A linked product is
never priced at nothing.

### Correcting the Pack Size

Where the reading is wrong, or the shop stated no size, the grocery's own
panel has the fix. Under the **Product** field, beside the price, the **Pack
size** is a quantity and a unit — grams, kilos, millilitres, litres, ounces,
pounds, pieces, or the two forms shops print for what is sold loose, per kg
and per 100 g. Change it and press **Save**, and the row counts its packs
afresh.

![The grocery panel, with the Pack Size under the product](/img/screenshots/groceries-pack-size.png)

A Pack Size you set is the last word: no later reading, match or refresh
overwrites it, and your household sees the correction too. Clear the field
and Norish goes back to reading it from the shop's words. A product you typed
by hand takes a Pack Size the same way, so a shop Norish cannot read still
prices by amount.

### The Store's heading

The Store's heading adds the Line Costs up: every row still to buy under it,
in the shop's own currency. A row the Store cannot price is left out of the
sum rather than guessed at, and a row you tick off leaves it. Each view
prices what it shows: in the plain list every row is its own purchase; when
the list groups similar ingredients, a group is one row and one purchase,
priced from its recipes' amounts added together — 300 g and 0.4 kg of flour
are priced as 700 g, two packs, even though the group still shows them apart.

### While Norish is asking

Adding a grocery never waits on a shop:

- a name the Store already knows is priced in the same breath, with no
  outbound request at all;
- a name it does not know goes to a queue, and the price appears on your list
  the moment it lands — on your housemates' screens too.

While the shop is being asked, the row shows a small loader where the price
will go, so a blank reads as waiting and not as failure. The loader is a fact
about the Store rather than about your screen: your housemates see it on the
same row, and it goes when the answer lands. A shop that does not answer at
all leaves nothing behind, and the name is asked again on a later visit.

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

Picking one fills in the **Product name**, **Price**, **Currency** and
**Pack size** beneath it, so the panel says what this costs where it says
everything else. Nothing is written until you press **Save** or **Add** —
what you do in the dropdown changes nothing your household sees until then.
Norish asks the shop only once you use the field, so opening a grocery to
rename it sends nobody to a supermarket, and a Store with no shop link shows
the field greyed out rather than pretending it can search.

Those fields are yours to correct. Type over the price and it becomes
**your** price for that name at that Store: Norish never writes over a price it
read from a shop's own page, so a correction sits beside what the shop said
rather than through it.

### A shop Norish cannot read

Some shops answer with nothing Norish can read, and some cannot be searched at
all — a shop link Norish could not make a search page out of. A shop that does
not answer at all — down, or turning the visit away — is reported as exactly
that, not as a shop with nothing on its shelf. In every case the field offers to
take a price by hand: a name, prefilled with the
grocery's, and the price and currency you saw. There is nothing to press — a
price you have typed is your choice, and Save writes it like any other. That
makes a Store Product like any other, except that nothing Norish reads will
ever overwrite it: a price you typed is the last word. Type over it later and
it is the same product, corrected, not a second one beside it.

## Sales

A **Sale** is what the shop presents as one: a price with the regular price
it replaces beside it. On the row the regular Line Cost is struck through
next to the Line Cost, with a **Sale** badge, and the shop's own words for
the deal follow the product name — "Weekend actie", "Bonus". The picker shows
the same on each result, so you can see a deal before you choose it.

A deal the shop keeps as a label over its regular price — Albert Heijn's
"2 voor €5.50" — is shown in those words and never worked into the number:
Norish prices what the shop presents as the price, and tells you the rest in
the shop's words so you can act on it at the shelf. A Sale lasts until the
shop presents another price; a refresh that reads the same price keeps it,
and one that reads any other price ends it. A price you typed by hand is
never on Sale.

## What this does not do yet

Deliberately, for now:

- no deal arithmetic: "2 voor €5.50" is shown, never computed;
- no card, membership or login-gated prices — Norish cannot tell a card
  price from a markdown by markup, so a shop that presents its card price as
  the price is priced at it;
- no comparable unit prices (€/kg beside a pack);
- no price history — a Shelf Price is overwritten and the one it replaces is
  gone;
- no tolerance on pack rounding, and no per-line "packs needed" override: the
  amount and the Pack Size are the two knobs;
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
