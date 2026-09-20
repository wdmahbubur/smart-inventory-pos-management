# Application architecture

## Execution boundaries

The browser renders real HTML/CSS/SVG components. Next.js Server Components make initial owner-scoped reads; Client Components manage forms, pickers, the cart, modal focus and operation recovery. The browser is never authoritative for stock, prices, totals, store ownership or posting timestamps.

```text
Browser / SSR page
  -> verified Supabase Auth user (cookies + getUser)
  -> Next.js server data-access layer / validated route handler
  -> authenticated Supabase RPC
  -> store-first PostgreSQL lock, validation, snapshots, balances + movements

Explicit AI generation
  -> owner-scoped consistent fact snapshot + durable quota/lease
  -> provider-neutral contract -> explicit OpenRouter/Gemini adapter (server only)
  -> strict grounding validation -> controlled persistence
  -> application-rendered values and stale/current provenance
```

`src/proxy.ts` refreshes the Supabase session. `src/lib/supabase/server.ts` adapts cookies; `src/lib/server/data.ts` verifies identity again for protected reads/services. Hiding navigation is not authorization. The SQL RPCs independently derive `auth.uid()` and the owned store. Every exposed business table has owner-scoped read RLS; authenticated direct table writes are revoked.

`src/lib/server/http.ts` supplies private/no-store responses and sanitized errors. Cookie-authenticated JSON writes must have the approved origin and JSON content type, and are limited to 128 KiB while reading, including chunked bodies. Runtime Zod schemas reject unexpected fields; database constraints/RPCs revalidate direct callers. Public Supabase URL/publishable key are not privileged credentials. No service-role key is used in ordinary business requests.

## Module map

| Location | Responsibility |
|---|---|
| `src/app/(auth)` | Registration/login/recovery/reset/verification pages and safe callback. |
| `src/app/(app)` | Authenticated shell, 18 business screens, supporting editors. |
| `src/components` | Design tokens' shared controls, native dialog, sidebar, paginated pickers, tables and SVG/CSS charts. |
| `src/features` | Catalog CRUD, purchase editor, POS/cart, receipt printing, reports and insight presentation. |
| `src/lib/domain.ts`, `database.types.ts`, `schemas.ts` | Typed service contracts, database RPC argument/result maps, runtime validation. |
| `src/lib/money.ts`, `dates.ts`, `csv.ts`, `cart.ts` | Exact money, Dhaka boundaries, safe CSV and nonauthoritative cart operations. |
| `src/lib/server` | Identity, owner scope, read-model and mutation transport. |
| `src/lib/ai` | Provider-independent facts/output contracts, prompt, registry, grounding, cache orchestration, adapters. |
| `supabase/migrations` | Schema, grants, constraints, functions, deferred ledger invariants and read-query planning. |
| `scripts` | Controlled migrations, local fixtures and synthetic performance acceptance. |
| `tests` | Unit, SQL role/isolation/concurrency, real Supabase browser and visual captures. |

## Source-to-route mapping

All source PNG names are preserved in the screenshot artifact naming. Source files are 2x exports; the CSS reference width is 1440, not 2880. The original design files remain in the supplied Project bundle; the app does not render them as backgrounds.

| Screen | Reference | Route |
|---|---|---|
| SCR-01 | 01-Landing.png | `/` |
| SCR-02 | 02-Registration.png | `/register` |
| SCR-03 | 03-Login.png | `/login` |
| SCR-04 | 04-Password-Recovery.png | `/forgot-password` |
| SCR-05 | 05-Dashboard.png | `/dashboard` |
| SCR-06 | 06-Products.png | `/products` |
| SCR-07 | 07-Add-Product.png | `/products/new` |
| SCR-08 | 08-Categories.png | `/categories` |
| SCR-09 | 09-Suppliers.png | `/suppliers` |
| SCR-10 | 10-Purchase-History.png | `/purchases` |
| SCR-11 | 11-New-Purchase.png | `/purchases/new` |
| SCR-12 | 12-Purchase-Details.png | `/purchases/[id]` |
| SCR-13 | 13-POS.png | `/pos` |
| SCR-14 | 14-Sales-History.png | `/sales` |
| SCR-15 | 15-Sales-Receipt.png | `/sales/[id]` |
| SCR-16 | 16-Current-Inventory.png | `/inventory` |
| SCR-17 | 17-Stock-Movement.png | `/inventory/movements` |
| SCR-18 | 18-Low-Stock.png | `/inventory/low-stock` |
| SCR-19 | 19-Sales-Report.png | `/reports/sales` |
| SCR-20 | 20-Purchase-Report.png | `/reports/purchases` |
| SCR-21 | 21-Inventory-Report.png | `/reports/inventory` |
| SCR-22 | 22-AI-Insights.png | `/insights` |

`/reports` redirects to sales reports. Additional routes are `/products/[id]/edit`, `/purchases/[id]/edit`, `/verify-email`, `/reset-password`, and `/auth/callback`; existing form/auth designs are reused. Category/supplier/store editors are native dialogs, not separate invented screens.

## Mutation and recovery protocol

`/api/mutate` dispatches allowlisted operations to typed RPCs. `useOperation` generates a cryptographic request ID and keeps the exact payload/key in per-store session storage while it is pending or its outcome is unknown. Catalog stock is never stored there. If a response is lost after commit, `/api/operations` queries only the owned operation's result and recovers the same receipt. A definite validation rejection allows correction; an uncertain network result retains the original key and payload. Successful posting clears the cart, navigates to the saved document and refreshes affected read models.

Product price/version mismatches return explicit conflict details for review, not a silent new charge. Draft versions prevent lost updates. The database performs idempotency replay before version/stock revalidation, so a successfully committed retry is not rejected simply because stock/version has since changed.

## Read consistency and responsive behavior

Workspace, reports and AI facts are assembled by stable SQL read RPCs under a consistent statement snapshot. Totals cover all matching data, independently of paginated rows. POS and pickers request bounded pages; the selected cart survives discovery filters. Text search is debounced, sort fields are allowlisted, and IDs break ties.

The shared desktop sidebar is 224px with a 78px header. Below tablet thresholds navigation becomes a focus-managed drawer; mobile grids stack and tables scroll inside their own containers, never the whole page. The mobile POS uses a same-route cart view with visible item count/total, not a second inconsistent cart state. Reduced motion, keyboard focus, labels and text chart equivalents are included. Browser rendering and exact design sign-off are separate checks; see VISUAL_QA.md.

## Deliberate scope limits

No independent quantity editor, accounting cost layers, returns/reversals, due balances, cash drawer, staff roles, AI database tools, voice services or external analytics backend exist. Current reference-cost value is not profit or confirmed supplier payment. Historical document snapshots are independent of current product/supplier/store labels. Future stock reversals require a separately designed, audited feature rather than an undocumented direct edit.
