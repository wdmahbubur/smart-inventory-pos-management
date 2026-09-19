# Visual QA — Smart Inventory reference set

**Reference set:** 22 original desktop PNGs, logical width 1440 CSS px (2× exports).  
**Implementation checks:** authenticated demo fixtures, Chromium, 1440×1024 and 390px captures plus automated 360/390/768/1024/1440/1920 route overflow checks.  
**Status:** all screens are implemented and recognizably match the approved emerald/light design system. Exact pixel identity is not claimed; responsive mobile layouts are implementation-derived because no mobile references were supplied.

## Shared design verification

- Emerald `#117956`, primary text `#192D25`, background `#F7F9F8`, white surfaces, active-nav green tint and thin `#E4EBE6`-style borders are used consistently.
- Desktop uses the reference-style fixed sidebar/top bar/content rhythm; tablet/mobile collapse navigation and stack cards/forms without page-level horizontal scrolling.
- Tables remain contained on narrow viewports; POS keeps cart totals/checkout reachable; dialogs enter focus, close on Escape and restore focus.
- Reference pages are rebuilt as real HTML/components/charts. No screenshot is used as a page background.
- Inter + Noto Sans Bengali are loaded by Next.js for the intended typography. CI production builds verify the font fetch; an offline network-restricted build can fail at the Google font download step.

## Screen-by-screen comparison

| ID | Route | Fixture | Visual result / deliberate difference |
|---|---|---|---|
| 01 | `/` | public | Landing hero, navigation, package illustration, three-step explanation, CTAs and footer reproduced; responsive stacking verified. |
| 02 | `/register` | public | Split auth layout and registration fields/actions reproduced; real validation/Auth states added. |
| 03 | `/login` | public | Login composition, password visibility, remember-me, recovery/register links reproduced. |
| 04 | `/forgot-password` | public | Recovery form layout reproduced; neutral success/error states added for real Supabase flow. |
| 05 | `/dashboard` | post-sale | Reference card grid, stock-attention and recent-activity structure reproduced. Heading copy aligned to “Your store, at a glance”. |
| 06 | `/products` | post-sale | Extra dashboard-like stat cards removed; filters, `Product catalog` card, product-count badge, table density and stock notice aligned. Archived view remains available as a compact secondary link because the PRD requires it. |
| 07 | `/products/new` | empty/new | Reference product form and “Starting stock: 0 / stock cannot be edited here” behavior reproduced; current quantity remains read-only on edit. |
| 08 | `/categories` | post-sale | Extra stat cards removed; `Categories` card/count badge and explanatory notice aligned to reference. |
| 09 | `/suppliers` | post-sale | Supplier cards/table follow reference. **Intentional numeric difference:** ledger-correct fixture includes historical P-0011, so lifetime received count/value are 2 / BDT 5,585 rather than the screenshot's 1 / BDT 2,050 sample-only values. |
| 10 | `/purchases` | post-sale | Heading, count tabs, filters, `Purchase records` card and received-total badge aligned. Draft P-0013 remains visible but excluded from received totals. |
| 11 | `/purchases/new` / draft edit | draft | Two-column purchase editor, item table and summary match the reference task. Draft route keeps the reference-facing “Record a purchase” title while indicating the draft number in supporting copy. |
| 12 | `/purchases/[id]` | post-sale | Read-only received-document layout, item totals and historical before/after stock impact reproduced; heading aligned to `Purchase P-0012`. |
| 13 | `/pos` | pre-sale | Product grid/cart split, category/search controls, selected items, discount/tender/change and checkout composition reproduced. Mobile cart access verified separately. |
| 14 | `/sales` | post-sale | Summary cards/table reproduced; heading aligned to `Sales`. Only completed sales are represented, per PRD. |
| 15 | `/sales/[id]` | post-sale | Centered immutable receipt, totals/tender/change and print controls reproduced; heading aligned to `Receipt S-0021`. A4 and thermal print modes verified. |
| 16 | `/inventory` | post-sale | Extra stat cards removed; filter row, `Stock on hand` card, global value badge, quantities/cost/value/status columns and estimate notice aligned. |
| 17 | `/inventory/movements` | post-sale | Read-only signed movement ledger and filters reproduce the reference; deterministic sequence ordering is implementation-only integrity detail. |
| 18 | `/inventory/low-stock` | post-sale | Out/low counts, suggested-to-minimum quantities and purchase-prefill actions reproduced. |
| 19 | `/reports/sales` | post-sale | Summary/reconciliation chart/table composition reproduced; implementation adds text equivalents required for accessibility. |
| 20 | `/reports/purchases` | post-sale | Received-only totals and product/supplier breakdown reproduced; drafts excluded. |
| 21 | `/reports/inventory` | post-sale | Current value/category/status visualizations reproduced with text equivalents and an explicit snapshot timestamp. |
| 22 | `/insights` | post-sale | Source-facts panel and generated-summary layout reproduced. With no real Gemini key in verification, the UI intentionally shows the truthful “AI not configured” state while retaining source facts rather than faking the screenshot's generated prose. |

## Responsive/browser evidence

The real-Supabase Playwright suite checks every one of the 22 routes at **360, 390, 768, 1024, 1440 and 1920 CSS pixels** (132 route/viewport assertions) and captures the desktop/mobile comparison set. It additionally checks POS mobile completion, print styles, modal focus/Escape restoration, auth flows and protected-route failures.

## Reference-data caveat

The source images contain pre-existing stock but no source transactions that created it. The fixture therefore adds **P-0011 on 17 September 2026** for the six non-zero opening quantities, as required by PRD §12.4. This preserves the reference's current post-sale quantities and today's totals while making lifetime movement/supplier history reconstructable. It is the one deliberate numeric difference from the supplier reference and must not be “fixed” by hardcoding unexplained stock.

## Remaining visual limits

- No mobile PNG references exist, so mobile QA can verify consistency/usability but not pixel parity against supplied artwork.
- Chromium is verified; Safari/Firefox and physical printers are not certified.
- The AI generated-copy state requires a real Gemini credential to compare a live provider response; source-fact and provider-error states are verified.
- Small icon glyph, font rasterization and browser-native form-control differences may vary by OS/browser even with the same CSS.
