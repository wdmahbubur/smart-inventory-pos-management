# Implementation status — 21 September 2026

**Default branch:** `master`. Implementation was pushed feature-by-feature on `feat/complete-inventory-application` and merged through **PR #1**. This is a functional application, not a static design bundle. The approved hosted Supabase schema is installed and verified through migration 013; the new net-profit migration is source-ready but has not been applied to the hosted project in this change. It is **not yet a signed-off hosted release**: Vercel publication, hosted Auth/browser verification, a real provider smoke test and final reference-parity review remain open.

## Net-profit feature checkpoint — 21 September

- Added **Net profit today** to Dashboard and **Net profit** plus captured-cost reconciliation to Sales Report.
- Formula: **net sales after order discount − sold units’ reference cost captured at sale completion**. The UI labels this as before operating expenses; it is not FIFO/weighted-average accounting profit.
- `sale_items` gains immutable `unit_cost_paisa` and `line_cost_paisa`. Existing sale lines are backfilled once from the product reference cost at migration time; new sales capture cost at checkout, so later catalog cost edits do not rewrite historical profit.
- Sales CSV exports captured unit/line cost, margin before order discount, the order discount once, and net-profit contribution.
- Demo reconciliation: BDT 330 net sales − BDT 230 captured cost = **BDT 100 net profit**.
- Local verification on the latest migration chain: all **14 migrations applied cleanly**, **24/24 database tests passed**, and the feature snapshot also passed TypeScript, lint and unit tests. Production webpack build passed with test-only offline Google-font responses because this sandbox cannot reach Google Fonts.
- **Hosted Supabase migration 202609210001 was not applied in this change.** The hosted database remains at the previously verified migration baseline until a live-schema update is explicitly authorized.

## Latest release checkpoint — 20 September

Implemented and pushed the target-scoped **Deploy Smart Inventory to Vercel** workflow and guarded REST scripts in `be8112f5586150e069b5ba58baae01cac1268857`; added deployment tests/configuration to application CI/source handoff in `c0202e93d6b511efccfed4d1e11b935825f0fb16`.

Release workflow **35491076004** passed **15 deployment-safety/mock orchestration tests**, **23 unit tests**, typecheck, lint and production build, plus **15 actual hosted Supabase read-only HTTP checks**. Application CI **35491134851** at `c0202e93` completed successfully, including fresh migrations, SQL-role tests and the full benchmark. Real local-Supabase browser workflow **35491076092** at `be8112f5` also completed successfully.

**Vercel was NOT deployed.** The connected action again returned `-32602: Tool deploy_to_vercel not found`. Repository Actions preflight **35490716023** confirmed `VERCEL_TOKEN` and `SUPABASE_ACCESS_TOKEN` are absent. The release workflow's actual publish step was explicitly **skipped**; its green verification/credential-check job is not evidence of deployment. `GEMINI_API_KEY` was also absent.

The owner must add those two deployment credentials as GitHub **Actions secrets**, not paste them into chat, then run the prepared workflow on `master`. The script is designed to verify the exact target, configure Vercel environment values, deploy the verified SHA, confirm READY/production alias, configure Supabase callback origins and perform live read-only checks. External writes remain unverified until credentials permit a real run. No archive or business data was modified in this continuation.

Exact results, run IDs and remaining setup: [Release verification](docs/verification/release-2026-09-20.md) and [Vercel release guide](docs/deployments/VERCEL_RELEASE.md).

## Hosted database checkpoint — 20 September

On the explicitly approved `inventory-management-v2` project (`galgetikfkyceqkaqdha`), retained all **70 legacy rows** in original archived tables and in separate verified in-database backup copies. Exact counts corrected the earlier table-list estimate of zero. Originals, eight foreign keys, indexes, five enum types, trigger function and sequence were preserved. Archive and backup API access is denied.

Installed all **10 application source migrations**; verified **12 public tables with RLS**, 12 owner-read policies, blocked direct table writes, 17 authenticated/owner-checked RPC entrypoints and **35/35 normalized function-body matches** against source commit `a9a2e3442e0662b891c74b29e5c494b3531c06ea`. The hosted transaction-level smoke test passed 12 verification groups covering onboarding, catalog, zero stock, draft isolation, receipt/sale idempotency, oversell rejection, direct-write denial, immutable snapshots, reconciled reports/ledger/AI facts and two-owner isolation. All temporary test identities and business rows were rolled back. This is SQL-role verification, not hosted HTTP Auth/browser testing.

Security Advisor reports no ERROR findings; 17 authenticated SECURITY DEFINER WARN notices and seven archive no-policy INFO notices remain and are documented. This is not a claim of a complete security audit. Backups are inside the same project, not offsite disaster-recovery backups.

Full evidence, row counts, locations, restore precautions and migration-tool guidance: [Hosted cutover record](docs/deployments/2026-09-20-supabase-cutover.md). Future migrations for this target use `npm run db:migrate` with the recorded ten-source checksum baseline; do not run an unreconciled CLI db push/reset. No old password hashes or legacy stock balances were silently imported into the new Auth/ledger model.

## Implemented scope

| Milestone / requirements | Implementation and evidence |
|---|---|
| M1, SCR-01–22 | All 22 independent routes, shared emerald layout, responsive navigation/forms/tables/POS, supporting edit/reset/callback routes. Original PRD, notes and all PNGs reviewed. |
| M2, SCR-02–04 | Supabase SSR Auth, idempotent empty-store onboarding, email confirmation/recovery, verified owner scope, RLS/read-only grants and same-store relationships. Real local Auth/PostgREST tests pass. |
| M3, SCR-06–09 | Catalog CRUD, search/pagination, zero initial stock, immutable referenced SKU/unit, history-safe archive/restore/delete. SQL tests and fresh-owner browser creation/editing pass. |
| M4, SCR-10–12 | Versioned drafts with no stock effect, atomic receipt, historical stock impact, immutable documents, idempotency and rollback protection. |
| M5, SCR-13–15 | Responsive cash cart, exact integer-money calculations, price/stock/tender revalidation, order discount, receipts, last-unit concurrency and lost-response recovery. |
| M6, SCR-05/16–21 | Consistent dashboard/stock facts, minimum-only replenishment, posting-date reports, complete aggregates/streamed CSV, Dhaka boundaries and formula-safe exports. |
| M7, SCR-22 | Optional server-only OpenRouter (default) and Gemini adapters, provider-neutral contract, grounded outputs, durable lease/quota/cache, provenance and stale/error states. OpenRouter Nemotron transport/grounding tests are included; a successful live provider call is still a separate check. |
| M8, AT-56–60 | Typecheck/lint/build, database tests, real Supabase browser tests, 132 route/viewport checks, desktop/mobile/print captures, setup and architecture/database/provider documentation. Exact parity and external release approval are not claimed. |

These mappings do **not** assert every subcase of all 60 acceptance rows passed. See TEST_RESULTS.md and VISUAL_QA.md for exact evidence and open cases.

## Earlier verified checkpoints

Application CI **35459112450**, commit `173c7e82c22ab5a02383511046d1a1216d9a5fd3`, passed **10 fresh migrations, 24 database tests, 23 unit tests, typecheck, lint, production build**, the 1,200-product / 50,000-row benchmark, and an authenticated **100,001-row export-limit rejection**. Real local Supabase browser run **35459052949**, commit `61d58c4ac79584d4ab4404446f891b0d1033d8ae`, passed **13/13 tests in 56.4 seconds**, including the updated titles, canonical routes and unsaved Orange drink form example. These are explicit tested checkpoints; subsequent documentation updates do not imply another unexecuted code test.

All **22 routes at 360/390/768/1024/1440/1920px** passed page-overflow/rendering checks. The artifact has **47 PNGs**: 22 desktop, 22 mobile, correct pre-sale POS/cart states and an A4 print capture. Desktop/mobile contact sheets were inspected. Specific composition/state gaps remain documented; no-overflow is not pixel-parity approval.

Migration 009 preserves deferred ledger invariants while using store/product indexing; migration 010 confines parameter-aware planning to the report RPC. That runner's purchase-report p95 was **102.04 ms**, 20-line receipt **11.71 ms** and checkout **14.25 ms**. These are localhost authenticated SQL timings, **not deployed HTTP latency**. Full exports, balances and ledger chains reconciled. Raw runner evidence: `docs/verification/performance-2026-09-19.json`.

Feature pushes include dialog accessibility (`255f6d7`), scoped ledger validation (`b8ac85e`), bounded request streams (`2457ead`), real owner/concurrent Supabase browser coverage (`0e98d86`), report planning (`9702caf`), reference-aligned UI, streamed CSV, canonical visual states (`9ef3bc2`), database export-boundary coverage (`61d58c4`) and clean source-handoff CI (`173c7e8`).

## Remaining release gates

1. **Vercel authorization and publication:** add the two required Actions secrets and run the prepared workflow on master. No working live URL is claimed. The selected hosted database schema is ready.
2. **Hosted Supabase integration:** the backup/archive/schema installation is complete and public Auth/anonymous-denial HTTP checks pass. Configure the production site/callback URLs through the release script and configure SMTP, then verify real hosted Auth and authenticated browser workflows. Unrelated TakaTrack data was not modified.
3. **AI provider:** configure `OPENROUTER_API_KEY` server-side and run the documented Bengali/English smoke test using `nvidia/nemotron-3-ultra-550b-a55b:free`. Core operations and source facts work without AI; successful external generation is not yet verified.
4. **Visual/acceptance:** remaining panel/form composition and populated-state differences are recorded in VISUAL_QA.md. Exact pixel parity, Safari/Firefox, physical printers, every keyboard combination, hosted cache/secret auditing and deployed multi-instance latency remain unverified. Both unit and actual database coverage verify the 100,001-row export rejection.

Do not mark the whole release complete from a green build alone. Never expose demo seeding, clock override, direct stock editing, service keys or a deterministic AI fallback in production.
