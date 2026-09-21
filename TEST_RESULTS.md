# Executed verification — 19 September 2026

## Net-profit feature verification — 21 September 2026

| Check | Result | Evidence |
|---|---|---|
| Feature TypeScript / lint / unit baseline | PASS | Recovered application workspace: typecheck and lint pass; 23/23 baseline unit tests pass with the new CSV profit assertion. |
| Fresh migration chain | PASS | Disposable PostgreSQL applied all **14 source migrations** in order, including hosted-era migrations 011–013 and new migration 202609210001. |
| Database tests | **24 / 24 PASS** | Fresh 14-migration disposable database, authenticated role/JWT contexts. |
| Dashboard profit | PASS | Sample workspace returns COGS BDT 230 and net profit BDT 100 for net sales BDT 330. |
| Sales report profit | PASS | Report summary and source-row contributions reconcile to BDT 100. |
| Historical stability | PASS | Raising product reference cost after a completed sale does not change captured historical COGS/profit. |
| Production build | PASS (offline-font verification) | `next build --webpack` completed with test-only mocked Google Fonts responses; normal sandbox build cannot reach Google Fonts. |
| Hosted Supabase migration | NOT RUN | Production database intentionally unchanged by this feature commit; migration 202609210001 remains pending explicit live-schema authorization. |

Profit formula under test: `net sales - captured sale-line reference cost`. This is a sales-margin metric before operating expenses, not FIFO/weighted-average accounting profit.

## Reproducible evidence

| Check | Result | Environment / evidence |
|---|---|---|
| TypeScript | PASS | `npm run typecheck`; local and GitHub Actions. |
| ESLint | PASS | `npm run lint`, zero warnings in application source checks. |
| Unit tests | **23 / 23 PASS** | `npm test`; money/dates/CSV/cart/schemas, AI contract/grounding/errors/staleness, bounded request streaming, streamed CSV chunks and 100,001-row rejection. |
| Database tests | **24 / 24 PASS** | `npm run test:database`; disposable PostgreSQL, authenticated role/JWT contexts. Repeated after all 10 migrations on a fresh local database. |
| Production build | PASS | `npm run verify` in Actions, Next.js 16.3.3, Node 22.16.0 / npm 10.9.2. Google fonts fetched by the online runner. |
| Real Supabase browser tests | **13 / 13 PASS, 56.4s** | Run [35459052949](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459052949), commit `61d58c4ac79584d4ab4404446f891b0d1033d8ae`. |
| Application CI | PASS | Run [35459112450](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459112450), commit `173c7e82c22ab5a02383511046d1a1216d9a5fd3`; 10 fresh migrations, 24 SQL tests, 23 unit tests, typecheck/lint/build and the real 100,001-row export boundary. |
| Responsive route checks | **132 / 132 PASS** | All 22 screens at 360, 390, 768, 1024, 1440 and 1920 CSS pixels; heading/error/no-page-overflow assertions. |
| Screenshots | Captured and reviewed | 22 desktop and 22 mobile route images, plus pre-sale POS/cart and A4 print capture. Exact parity has remaining differences; VISUAL_QA.md. |
| Synthetic dataset | PASS | 1,200 products, 500 receipts, 50,000 item/movement rows; full exports, all catalog pages and ledger chains reconcile. |
| Hosted Supabase / Vercel / Gemini | **NOT VERIFIED** | No approved dedicated hosted Supabase project, no verified live Vercel deployment, and no provider credentials. |

Browser artifact [10589101705](https://github.com/wdmahbubur/smart-inventory-pos-management/actions/runs/35459052949/artifacts/10589101705) contains `browser-results.json` and 47 PNGs, not test credentials. ZIP SHA-256: `969728772cb880d050e2a6fd0b03d4f9e4a934a234bb369aaecf2d9b0e097503`. Application evidence is artifact `10589182295` in run 35459112450; the clean tracked-source artifact is `10589137658`. Artifacts expire, so retain downloaded evidence. These commits are explicit tested checkpoints; subsequent documentation-only commits do not imply additional application changes or an unexecuted test run.

## What was exercised

**Database boundary:** empty/idempotent onboarding; invalid onboarding rollback; owner isolation and cross-store relationships; normalized SKU uniqueness; zero starting stock and blocked quantity assignment; referenced SKU/unit immutability; unused deletion versus referenced archive restrictions; draft dependency/version/numbering rules; receipt/sale atomicity and injected mid-post rollback; identical concurrent calls and changed-payload idempotency conflicts; last-unit oversell protection; immutable document snapshots and direct-write rejection; ledger reconstruction; report and fact ownership; durable AI lease/quota/cache restrictions. Added tests cover varying actual costs versus later reference-cost edits, Dhaka midnight across a month boundary, and stable same-name pagination.

**Real browser/Auth/PostgREST:** actual registration, local email confirmation, empty account, logout, local recovery email and changed-password login; real JWT owner separation and forbidden direct balance writes; authenticated export and foreign-origin rejection; saved draft retaining stock; mobile cart completion; intentionally lost committed checkout response followed by same-receipt recovery; missing Gemini with source facts retained; keyboard modal entry/Escape/focus restoration; unauthenticated routes/services/exports denied; 22 canonical routes across all six viewport sizes. The product-form visual example remains unsaved and does not alter the seven-product fixture.

**Fresh owner journey:** create category/supplier/product, confirm stock zero, receive 10 units at BDT 70 (purchase BDT 700), save another 4-unit draft without changing stock, sell 8 units at BDT 100 with BDT 20 discount and BDT 1000 tender. Verify net BDT 780, change BDT 220, remaining stock 2, replenishment-to-minimum 3, reconciled reports, and unchanged receipt after raising the catalog price. A4/thermal print styling is checked without reposting; this is not a physical printer certification. Deletion is covered at the database boundary, not every create/edit/delete interaction in the browser.

**Real concurrent HTTP RPC:** two independently keyed authenticated PostgREST checkout requests for the last unit yield exactly one successful sale and one `INSUFFICIENT_STOCK`; replaying the successful key returns the same receipt, with balance zero.

**Fixture reconciliation:** post-sale stock Coke 28 / Sprite 15 / Chips 17 / Milk 3 / Rice 4 / Shampoo 2 / Bread 0; 69 total selling units; 3 in stock, 3 low, 1 out; BDT 5355 estimate; BDT 330 today's net sales, BDT 2050 today's received goods; draft BDT 2450 excluded. The prior-day P-0011 opening fixture explains lifetime supplier totals of 2 / BDT 5585.

## Performance measurements

GitHub Actions Ubuntu runner with disposable localhost PostgreSQL **17.11**, Linux x86-64, Node **22.16.0**, 30 warm samples after three warmups, authenticated SQL role round trips. These measurements exclude public HTTP/TLS, cold starts, cross-region latency and hosting limits. Raw results: [docs/verification/performance-2026-09-19.json](docs/verification/performance-2026-09-19.json), copied unchanged from the successful runner artifact, recorded at 17:47:30 UTC.

| Operation | p50 ms | p95 ms | PRD target ms | Runner result |
|---|---:|---:|---:|---|
| Catalog page | 11.98 | 12.16 | 800 | PASS |
| Workspace aggregates | 16.18 | 16.94 | 800 | PASS |
| Purchase report aggregate | 99.38 | 102.04 | 800 | PASS |
| Movement page | 260.38 | 270.59 | 800 | PASS |
| 20-line receipt | 11.01 | 11.71 | 1500 | PASS |
| 20-line checkout | 13.27 | 14.25 | 1500 | PASS |

The initial benchmark revealed an unscoped product-ledger scan and a generic cached report plan. Migration 009 retains deferred ledger validation but uses its store/product index; migration 010 uses parameter-aware plans only for the report function. No integrity check or global planner setting was disabled. The benchmark verifies all 1,200 inventory rows and 50,000 receipt source rows, then grows only that synthetic store to exactly **100,001 received source rows** and verifies the authenticated export RPC rejects it with `EXPORT_ROW_LIMIT`, rather than returning a truncated success. It then rechecks every balance and before/after ledger chain.

## Limits and open checks

This is not a declaration that every subcase of AT-01–60 passed. Not executed: real hosted email deliverability, a hosted two-owner session/cache smoke test, deployed multi-instance latency and provider quota behavior, a successful live external-provider generation, physical printer output, Safari/Firefox/mobile operating-system browsers, or all keyboard combinations in every editor. The 50,000-row dataset verifies complete export beyond ordinary API page limits; unit coverage verifies UTF-8 CSV output beyond 4.5 MB, 64 KiB chunk bounds, cancellation and the 100,001-row boundary. The SQL report independently rejected a real 100,001-row dataset in CI. A large CSV has not yet been downloaded through a hosted Vercel function. Model transport tests stub providers; they do not prove OpenRouter free-route availability, quota, or successful live generation.

The runner reported deprecated ESLint 9.35.0 support, older Action runtimes being forced to Node 24, deprecated Supabase `[inbucket]` naming and a prior Next.js standalone/`next start` warning; standalone output has since been removed for Vercel-native builds. Verification passed; maintenance cleanup and current dependency/security review remain required before production. No fresh comprehensive dependency-audit or client-bundle secret scan is claimed by this report. Vercel deployment was attempted but returned `-32602: Tool deploy_to_vercel not found`; a green build is not a live deployment.
