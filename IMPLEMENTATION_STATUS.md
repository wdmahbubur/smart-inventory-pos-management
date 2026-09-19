# Implementation status — 19 September 2026

**Default branch:** `master`. Implementation was pushed feature-by-feature on `feat/complete-inventory-application` and merged through **PR #1**. This is a functional application, not a static design bundle. It is **not yet a signed-off hosted release**: dedicated hosted data, Vercel deployment, a real Gemini smoke test and final reference-parity review remain open.

## Implemented scope

| Milestone / requirements | Implementation and evidence |
|---|---|
| M1, SCR-01–22 | All 22 independent routes, shared emerald layout, responsive navigation/forms/tables/POS, supporting edit/reset/callback routes. Original PRD, notes and all PNGs reviewed. |
| M2, SCR-02–04 | Supabase SSR Auth, idempotent empty-store onboarding, email confirmation/recovery, verified owner scope, RLS/read-only grants and same-store relationships. Real local Auth/PostgREST tests pass. |
| M3, SCR-06–09 | Catalog CRUD, search/pagination, zero initial stock, immutable referenced SKU/unit, history-safe archive/restore/delete. SQL tests and fresh-owner browser creation/editing pass. |
| M4, SCR-10–12 | Versioned drafts with no stock effect, atomic receipt, historical stock impact, immutable documents, idempotency and rollback protection. |
| M5, SCR-13–15 | Responsive cash cart, exact integer-money calculations, price/stock/tender revalidation, order discount, receipts, last-unit concurrency and lost-response recovery. |
| M6, SCR-05/16–21 | Consistent dashboard/stock facts, minimum-only replenishment, posting-date reports, complete aggregates/streamed CSV, Dhaka boundaries and formula-safe exports. |
| M7, SCR-22 | Optional server-only Gemini adapter, provider-neutral contract, grounded outputs, durable lease/quota/cache, provenance and stale/error states. Test adapter/transport and database checks pass; no successful real provider call. |
| M8, AT-56–60 | Typecheck/lint/build, database tests, real Supabase browser tests, 132 route/viewport checks, desktop/mobile/print captures, setup and architecture/database/provider documentation. Exact parity and external release approval are not claimed. |

These mappings do **not** assert every subcase of all 60 acceptance rows passed. See TEST_RESULTS.md and VISUAL_QA.md for exact evidence and open cases.

## Verified checkpoints

Application CI **35459112450**, commit `173c7e82c22ab5a02383511046d1a1216d9a5fd3`, passed **10 fresh migrations, 24 database tests, 23 unit tests, typecheck, lint, production build**, the 1,200-product / 50,000-row benchmark, and an authenticated **100,001-row export-limit rejection**. Real local Supabase browser run **35459052949**, commit `61d58c4ac79584d4ab4404446f891b0d1033d8ae`, passed **13/13 tests in 56.4 seconds**, including the updated titles, canonical routes and unsaved Orange drink form example. These are explicit tested checkpoints; subsequent documentation updates do not imply another unexecuted code test.

All **22 routes at 360/390/768/1024/1440/1920px** passed page-overflow/rendering checks. The artifact has **47 PNGs**: 22 desktop, 22 mobile, correct pre-sale POS/cart states and an A4 print capture. Desktop/mobile contact sheets were inspected. Specific composition/state gaps remain documented; no-overflow is not pixel-parity approval.

Migration 009 preserves deferred ledger invariants while using store/product indexing; migration 010 confines parameter-aware planning to the report RPC. The final runner's purchase-report p95 was **102.04 ms**, 20-line receipt **11.71 ms** and checkout **14.25 ms**. These are localhost authenticated SQL timings, **not deployed HTTP latency**. Full exports, balances and ledger chains reconciled. Raw runner evidence: `docs/verification/performance-2026-09-19.json`.

Feature pushes include dialog accessibility (`255f6d7`), scoped ledger validation (`b8ac85e`), bounded request streams (`2457ead`), real owner/concurrent Supabase browser coverage (`0e98d86`), report planning (`9702caf`), reference-aligned UI, streamed CSV, canonical visual states (`9ef3bc2`), database export-boundary coverage (`61d58c4`) and clean source-handoff CI (`173c7e8`).

## Remaining release gates

1. **Hosted Supabase:** choose a dedicated organization/project and approve any cost before creation/migrations. Configure production site/callback URLs and SMTP. Unrelated TakaTrack data was not modified.
2. **Vercel:** the connected deploy action was attempted and returned JSON-RPC `-32602: Tool deploy_to_vercel not found`. No deployment ID/live URL was created. A working action or repository import, approved hosted database configuration and live workflow verification remain necessary.
3. **Gemini:** configure a server-side key/model securely and run the documented Bengali/English smoke test. Core operations and source facts work without AI; successful external generation is not verified.
4. **Visual/acceptance:** remaining panel/form composition and populated-state differences are recorded in VISUAL_QA.md. Exact pixel parity, Safari/Firefox, physical printers, every keyboard combination, hosted cache/secret auditing and deployed multi-instance latency remain unverified. Both unit and actual database coverage verify the 100,001-row export rejection.

Do not mark the whole release complete from a green build alone. Never expose demo seeding, clock override, direct stock editing, service keys or a deterministic AI fallback in production.
