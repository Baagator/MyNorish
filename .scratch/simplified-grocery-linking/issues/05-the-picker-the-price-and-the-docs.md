# 05 — The picker, the price on the row, and manual prices

Status: ready-for-agent
Blocked by: 04

Spec: `.scratch/simplified-grocery-linking/spec.md`

## What to build

Everything the user actually touches, plus the documentation the feature ships with.

**The row.** A priced Grocery shows `€2.99 · 150 gram`, size omitted where the shop states none. No age line. An unpriced Grocery in a Store with a Search Address shows a quiet invitation to pick a price — never an error, because a Miss is not a failure.

**The picker.** A stage *inside* the grocery panel, not a second panel over it: the content swaps and a back affordance returns. On open it searches the Store for the grocery's name and says so while it works. It shows priced results first, the Store Products already known under "In this store" below, and a free-text field to search a different term. Selecting a result marks it selected and nothing more — the panel's own Save or Add writes the link, in both the add and the edit flow.

**Manual prices.** When a search yields nothing, the picker offers to take a price by hand, pre-filled with the grocery's name: name, price, currency. That creates a manual Store Product and links it.

**Docs.** A documentation page under `apps/docs/docs/` with screenshots, and a `0.23.0-beta` release-notes page — the checkpoint has already run (`current.label` is `0.23.0-beta`) but `apps/docs/docs/release-notes/0.23.0-beta.md` does not exist yet, so create it in the established structure (Summary, Features, Fixes and Improvements, Upgrade notes, Contributors) and add this feature's section. No new environment variables, so nothing changes in `.env.example`.

## Notes

Make it a stage rather than a stacked panel: a positioned overlay inside a vaul Panel needs the portal-container wiring, and a full-viewport modal over one needs `pointer-events-auto` and `z > 1001` because vaul's transform re-roots `position: fixed`. A stage sidesteps both, and it keeps the grocery's name on screen while you choose for it.

Writing on tap reads as "it saved without me saving" — hold the choice in panel state and commit it on Save. Same rule in both flows, so the two never disagree.

UI copy uses the glossary: **Shelf Price**, never "unit price" or "price per unit" — those mean euros-per-kilo to a shopper and this is a different number. Every string is translated across all locales; run the i18n gate.

E2E runs against a fake shop page served by the harness, never the real supermarkets, in the existing `apps/web/__tests__/e2e/` setup. Two scenarios earn their keep: a name that auto-links and shows its price, and a name that opens the picker, is chosen by hand, and is priced after Save. Note the `__tests__` eslint blind spot if any new source lands under that tree.

Screenshots come off a running dev server with `reducedMotion`; the docs screenshot conventions already used elsewhere apply.

## Acceptance criteria

- [ ] A priced Grocery row shows its Shelf Price and the shop's size words, and omits the size where there is none.
- [ ] No age or "checked … ago" line appears on the row.
- [ ] An unpriced Grocery in a searchable Store offers a quiet way into the picker; one in a Store with no Search Address offers nothing.
- [ ] The picker is a stage inside the grocery panel and never a second stacked panel.
- [ ] Opening the picker searches the Store for the grocery's name and shows a searching state until it answers.
- [ ] Only priced results are listed; known Store Products appear under "In this store".
- [ ] A different search term can be run from inside the picker.
- [ ] A selection is visible immediately and written only on Save or Add, in both the add and edit flows.
- [ ] An empty result offers a hand-typed price pre-filled with the grocery's name, and linking it works.
- [ ] All new copy is translated in every locale and `pnpm i18n:check` passes.
- [ ] E2E covers the auto-link path and the pick-by-hand path against a harness-served fake shop.
- [ ] A docs page with screenshots exists, and `apps/docs/docs/release-notes/0.23.0-beta.md` is created with this feature's section.
- [ ] `pnpm lint`, `pnpm test:run`, `pnpm i18n:check` and `pnpm build` pass.
