# Executed verification — 19 September 2026

## Reproducible evidence

| Check | Result | Environment / evidence |
|---|---|---|
| TypeScript | PASS | `npm run typecheck`; local and GitHub Actions. |
| ESLint | PASS | `npm run lint`, zero warnings in application source checks. |
| Unit tests | **23 / 23 PASS** | `npm test`; money/dates/CSV/cart/schemas, AI contract/grounding/errors/staleness, bounded request streaming, streamed CSV chunks and 100,001-row rejection. |
| Database tests | **24 / 24 PASS** | `npm run test:database`; disposable PostgreSQL, authenticated role/JWT contexts. Repeated after all 10 migrations on a fresh local database. |
| Production build | PASS | `npm run verify` in Actions, Next.js 16.3.3, Node 22.16.0 / npm 10.9.2. Google fonts fetched by the online runner. |
| Real Supabase browser tests | **13 / 13 PASS, 56.4s** | Final run [35459052949](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459052949), commit `61d58c4ac79584d4ab4404446f891b0d1033d8ae`. |
| Application CI | PASS | Final run [35459112450](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459112450), commit `173c7e82c22ab5a02383511046d1a1216d9a5fd3`; fresh migrations, 24 SQL tests, 23 unit tests, performance/export-boundary acceptance and production build. |
| Responsive route checks | **132 / 132 PASS** | All 22 screens at 360, 390, 768, 1024, 1440 and 1920 CSS pixels; heading/error/no-page-overflow assertions. |
| Screenshots | Captured and reviewed | 22 desktop and 22 mobile route images, plus pre-sale POS/cart and A4 print capture. Exact parity has remaining differences; VISUAL_QA.md. |
| Synthetic dataset | PASS | 1,200 products, 500 receipts, 50,000 item/movement rows; full exports, all catalog pages and ledger chains reconcile. |
| Hosted Supabase / Vercel / Gemini | **NOT VERIFIED** | No approved dedicated hosted Supabase project, no verified live Vercel deployment, and no provider credentials. |

The final browser evidence is available in artifact [10589101705](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459052949/artifacts/10589101705). It contains browser results and the responsive screenshot set, not test account credentials. The final application verification artifact is [10589182295](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459112450/artifacts/10589182295), with a clean tracked-source handoff in artifact `10589137658`. Artifacts expire; use the run pages as the canonical execution record.

## What was exercised

**Database boundary:** empty/idempotent onboarding; invalid onboarding rollback; owner isolation and cross-store relationships; normalized SKU uniqueness; zero starting stock and blocked quantity assignment; referenced SKU/unit immutability; unused deletion versus referenced archive restrictions; draft dependency/version/numbering rules; receipt/sale atomicity and injected mid-post rollback; identical concurrent calls and changed-payload idempotency conflicts; last-unit oversell protection; immutable document snapshots and direct-write rejection; ledger reconstruction; report and fact ownership; durable AI lease/quota/cache restrictions. Added tests cover varying actual costs versus later reference-cost edits, Dhaka midnight across a month boundary, and stable same-name pagination.

**Real browser/Auth/PostgREST:** actual registration, local email confirmation, empty account, logout, local recovery email and changed-password login; real JWT owner separation and forbidden direct balance writes; authenticated export and foreign-origin rejection; saved draft retaining stock; mobile cart completion; intentionally lost committed checkout response followed by same-receipt recovery; missing Gemini with source facts retained; keyboard modal entry/Escape/focus restoration; unauthenticated routes/services/exports denied; 22 routes across all six viewport sizes.

**Fresh owner journey:** create category/supplier/product, confirm stock zero, receive 10 units at BDT 70 (purchase BDT 700), save another 4-unit draft without changing stock, sell 8 units at BDT 100 with BDT 20 discount and BDT 1000 tender. Verify net BDT 780, change BDT 220, remaining stock 2, replenishment-to-minimum 3, reconciled reports, and unchanged receipt after raising the catalog price. A4/thermal print styling is checked without reposting; this is not a physical printer certification. Deletion is covered at the database boundary, not every create/edit/delete interaction in the browser.

**Real concurrent HTTP RPC:** two independently keyed authenticated PostgREST checkout requests for the last unit yield exactly one successful sale and one `INSUFFICIENT_STOCK`; replaying the successful key returns the same receipt, with balance zero.

**Fixture reconciliation:** post-sale stock Coke 28 / Sprite 15 / Chips 17 / Milk 3 / Rice 4 / Shampoo 2 / Bread 0; 69 total selling units; 3 in stock, 3 low, 1 out; BDT 5355 estimate; BDT 330 today's net sales, BDT 2050 today's received goods; draft BDT 2450 excluded. The prior-day P-0011 opening fixture explains lifetime supplier totals of 2 / BDT 5585.

## Performance measurements

Local PostgreSQL **17.11**, Linux x86-64, Node **22.16.0**, 30 warm samples after three warmups, authenticated SQL role round trips. These measurements exclude public HTTP/TLS, cold starts, cross-region latency and hosting limits. Raw results: [docs/verification/performance-2026-09-19.json](docs/verification/performance-2026-09-19.json).

| Operation | p50 ms | p95 ms | PRD target ms | Local result |
|---|---:|---:|---:|---|
| Catalog page | 7.67 | 10.26 | 800 | PASS |
| Workspace aggregates | 13.52 | 16.42 | 800 | PASS |
| Purchase report aggregate | 78.76 | 96.19 | 800 | PASS |
| Movement page | 252.94 | 331.54 | 800 | PASS |
| 20-line receipt | 8.77 | 10.80 | 1500 | PASS |
| 20-line checkout | 10.98 | 14.91 | 1500 | PASS |

The initial benchmark revealed an unscoped product-ledger scan and a generic cached report plan. Migration 009 retains deferred ledger validation but uses its store/product index; migration 010 uses parameter-aware plans only for the report function. No integrity check or global planner setting was disabled. The final benchmark verifies all 1,200 inventory rows and 50,000 receipt source rows, then reconstructs balances and before/after chains after measured writes. CI then grows only that isolated synthetic store to exactly 100,001 matching source rows and verifies the authenticated report RPC rejects the complete export with `EXPORT_ROW_LIMIT` rather than returning a truncated success.

## Limits and open checks

This is not a declaration that every subcase of AT-01–60 passed. Not executed: real hosted email deliverability, a hosted two-owner session/cache smoke test, deployed multi-instance latency and provider quota behavior, a successful Gemini generation, physical printer output, Safari/Firefox/mobile operating-system browsers, or all keyboard combinations in every editor. The 50,000-row dataset verifies complete export beyond ordinary API page limits; unit coverage verifies stream chunking/cancellation and the 100,001-row boundary, while final database CI independently verifies an authenticated 100,001-row report is rejected with `EXPORT_ROW_LIMIT`. Model transport tests stub the provider; they do not prove billing or availability.

The runner reported deprecated ESLint 9.35.0 support, older Action runtimes being forced to Node 24, deprecated Supabase `[inbucket]` naming and a prior Next.js standalone/`next start` warning; standalone output has since been removed for Vercel-native builds. Verification still passed; maintenance cleanup and current dependency/security review remain required before production. No fresh comprehensive dependency-audit or client-bundle secret scan is claimed by this report.
