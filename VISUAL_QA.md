# Visual QA — Smart Inventory reference set

**Reference set:** 22 original desktop PNGs, logical width 1440 CSS px (2× exports).  
**Implementation checks:** authenticated demo fixtures, Chromium, 1440×1024 and 390px captures plus automated 360/390/768/1024/1440/1920 route overflow checks.  
**Status:** all screens are functional and use the approved emerald/light design system. Desktop and mobile captures were inspected, but **final reference-parity sign-off remains open**; specific differences are listed below. Mobile layouts are implementation-derived because no mobile references were supplied.

## Shared design verification

- Emerald `#117956`, primary text `#192D25`, background `#F7F9F8`, white surfaces, active-nav green tint and thin borders are used throughout.
- Desktop uses a fixed sidebar/top bar; tablet/mobile collapse navigation and stack cards/forms without page-level horizontal scrolling in tested routes.
- Tables remain contained on narrow viewports; POS cart totals/checkout are reachable; the tested category modal enters focus, closes on Escape and restores focus.
- Reference pages are rebuilt as HTML/components/charts. No screenshot is used as a page background.
- Inter + Noto Sans Bengali are loaded by Next.js. Online CI verifies the font fetch; an offline build may fail at the Google font download step. No font binaries are included in the source handoff.

## Screen-by-screen comparison

| ID | Route | Fixture | Visual result / difference |
|---|---|---|---|
| 01 | `/` | public | Landing hero, navigation, package illustration, three-step explanation, CTAs and footer implemented; responsive stacking inspected. |
| 02 | `/register` | public | Split auth layout and registration fields/actions implemented; real validation/Auth states added. |
| 03 | `/login` | public | Login composition, password visibility, remember-me and recovery/register links implemented. |
| 04 | `/forgot-password` | public | Recovery form layout implemented with neutral success/error states for real Supabase flow. |
| 05 | `/dashboard` | post-sale | Summary cards, stock attention and activity structure implemented; title is “Your store, at a glance”. The lower AI shortcut differs from the source's lower stock-summary composition. |
| 06 | `/products` | post-sale | Extra stat cards removed; filters, Product catalog card, count badge, table and stock notice aligned. Archived view remains a secondary link required by the PRD. |
| 07 | `/products/new` | unsaved Orange drink example | Capture fills Orange drink 1L / DR-003 / Drinks / bottle / minimum 10 / reference cost 60 / sell 90 without saving an eighth fixture product. Zero-stock notice is present. Pricing and appearance use separate cards rather than the exact source preview composition. |
| 08 | `/categories` | post-sale | Extra stat cards removed; Categories card/count badge and explanatory notice aligned. Missing optional descriptions are not invented. |
| 09 | `/suppliers` | post-sale | Supplier metrics/table implemented. **Intentional numeric difference:** historical opening P-0011 means lifetime received count/value are 2 / BDT 5,585 rather than the source's sample-only 1 / BDT 2,050. |
| 10 | `/purchases` | post-sale | Heading, count tabs, filters, Purchase records card and received-total badge aligned. Draft P-0013 appears but does not affect received totals. |
| 11 | `/purchases/new` | empty unsaved editor | Canonical new-purchase route, two-column editor, summary and stock preview captured. The screenshot is empty, not the source's populated Coke/Sprite editor. Populated receipt and saved-draft workflows are tested separately; exact populated visual-state comparison remains open. |
| 12 | `/purchases/[id]` | post-sale | Received-document layout, item totals and historical before/after stock impact implemented; title Purchase P-0012. |
| 13 | `/pos` | pre-sale comparison | Product/cart split, search/category selection, line quantities, discount/tender/change and checkout implemented. Use the dedicated pre-sale images below, not the ordinary empty-cart route capture. |
| 14 | `/sales` | post-sale | Summary cards/table and title Sales aligned. Completed sales only, per PRD. |
| 15 | `/sales/[id]` | post-sale | Centered immutable receipt, totals/tender/change and print controls implemented; title Receipt S-0021. A4 and thermal print CSS exercised; no physical printer test. |
| 16 | `/inventory` | post-sale | Extra stat cards removed; filters, Stock on hand card, global value badge, cost/quantity/value/status columns and estimate notice aligned. |
| 17 | `/inventory/movements` | post-sale | Signed read-only ledger and filters implemented. Stable sequence ordering is an integrity addition, not a screenshot feature. |
| 18 | `/inventory/low-stock` | post-sale | Out/low counts, minimum-shortage quantities and purchase-prefill actions implemented. |
| 19 | `/reports/sales` | post-sale | Summary/reconciliation/chart/table composition implemented, with text equivalents. Product amounts are labeled gross before order discount. |
| 20 | `/reports/purchases` | post-sale | Received-only totals and product/supplier breakdown implemented; drafts excluded. |
| 21 | `/reports/inventory` | post-sale | Current value/category/status visuals implemented with text equivalents and snapshot timestamp. |
| 22 | `/insights` | post-sale source facts | Source-facts and summary panels implemented. No provider key was supplied: verification captures the truthful not-generated/source-facts state and tests configuration errors, rather than fabricating the source's generated Bengali prose. |

## Responsive/browser evidence

Latest verified browser run: [35459052949](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459052949), commit `61d58c4ac79584d4ab4404446f891b0d1033d8ae`: **13 tests passed in 56.4s**, none skipped, flaky or failed. Artifact `10589101705` contains `browser-results.json` and **47 PNGs**. ZIP SHA-256: `969728772cb880d050e2a6fd0b03d4f9e4a934a234bb369aaecf2d9b0e097503`.

Relative artifact paths are `screenshots/1440/01-Landing.png` through `22-AI-Insights.png`, with corresponding files under `screenshots/390/`. For SCR-13, use **`screenshots/1440/13-POS-presale.png`** and **`screenshots/390/13-POS-cart-presale.png`** for the reference transaction state. The ordinary `13-POS.png` shows an empty cart in the post-sale store and is not its numeric comparison. Print capture: `screenshots/1440/receipt-a4.png`. All desktop/mobile route captures were visually inspected in contact sheets after this run.

The real-Supabase Playwright suite checks every one of the 22 canonical routes at **360, 390, 768, 1024, 1440 and 1920 CSS pixels** (132 route/viewport combinations). It also checks mobile POS completion, print styles, modal focus/Escape restoration, Auth flows and protected-route failures. Heading and no-overflow assertions do not establish full pixel parity or every interaction on every screen.

## Reference-data caveat

The source images contain pre-existing stock but no source transactions creating it. The fixture adds **P-0011 on 17 September 2026** for the six nonzero opening quantities, per PRD §12.4. Current post-sale quantities and today's totals still match; lifetime movements and supplier metrics remain reconstructable. Never hide this difference with hardcoded totals or unexplained balances.

## Remaining visual limits

- Dashboard lower-panel composition, product pricing/appearance-card arrangement, some panel heights, sidebar/typographic density, icons and table control placement still differ. The new-purchase capture does not yet reproduce its populated reference state.
- Narrow filter selects truncate some visible option text on mobile; labels/controls remain accessible, but the layout could be improved. Dense tables use contained horizontal scrolling rather than showing every column simultaneously.
- No automated full-page pixel-difference threshold was run. The 132 combinations assert route rendering and no page-level overflow, not every active-nav, focus, keyboard or touch interaction.
- No mobile PNG references exist. Chromium is verified; Safari/Firefox/mobile operating-system browsers and physical printers are not certified.
- Successful live AI output requires a real provider credential. Source-fact and missing-provider error states are verified; generated-copy comparison is not.
- Browser-native controls, icon glyphs and font rasterization may also vary by operating system.


## User-requested profit metric deviation

The original 22-screen design set did not contain profit metrics. The latest product request intentionally adds a fifth Dashboard KPI card for **Net profit today** and a fifth Sales Report KPI card plus cost/profit reconciliation columns. This is an approved functional deviation from the original desktop references. Responsive rules keep the five-card set at five columns on wide desktop, three on tablet, and two on mobile.
