# Implementation status — 19 September 2026

**Branch:** `feat/complete-inventory-application` · **PR:** #1. This is a functional application, not a static design bundle. It is **not yet a signed-off hosted release**: the dedicated hosted database, Vercel deployment, real Gemini smoke test and final reference-parity review remain open.

## Implemented scope

| Milestone / requirements | Implementation and evidence |
|---|---|
| M1, SCR-01–22 | All 22 independent routes, shared reference-derived emerald layout, responsive navigation/forms/tables/POS, supporting edit/reset/callback routes. Original PRD, notes and all 22 PNGs reviewed. Exact visual sign-off remains open; see VISUAL_QA.md. |
| M2, SCR-02–04, AT-01–10 | Supabase SSR Auth, idempotent empty-store onboarding, real email confirmation/recovery, verified owner scope, RLS/read-only table grants and composite same-store relationships. Real local Auth/PostgREST browser tests pass. |
| M3, SCR-06–09, AT-10–17 | Product/category/supplier CRUD, scoped search/pagination, zero initial balance, immutable referenced SKU/unit, guarded archive/restore/delete and snapshots. Database tests plus fresh-owner browser creation/editing pass. |
| M4, SCR-10–12, AT-18–25 | Versioned drafts without stock effect, atomic receipt, historical stock impact, immutable printing, idempotency and rollback protection. |
| M5, SCR-13–15, AT-26–38 | Responsive cash cart, exact paisa arithmetic, price/stock/tender revalidation, fixed order discount, immutable receipts, last-unit concurrency protection and lost-response recovery. Real Supabase concurrent checkout passes. |
| M6, SCR-05/16–21, AT-39–48 | Consistent dashboard/stock facts, minimum-only replenishment, posting-date reports, full-data aggregates/CSV, Dhaka boundaries and injection-safe text exports. 1,200 products / 50,000 movements reconcile. |
| M7, SCR-22, AT-49–55 | Optional server-only Gemini adapter, provider-neutral contract, strict fact grounding, durable lease/quota/cache, provenance and stale/error states. Unit/database/mock-transport tests pass; no real provider call verified. |
| M8, AT-56–60 | Typecheck/lint/build, database tests, real Supabase browser tests, 132 route/viewport checks, screenshots, print/focus checks and setup/architecture/database/provider documentation. Pixel-perfect parity and external release verification are not claimed. |

These ranges are coverage mappings, **not a claim that every subcase of all 60 acceptance rows passed**. The exact executed evidence and untested cases are in TEST_RESULTS.md.

## Latest verified work

Application CI **35459112450**, commit `173c7e82c22ab5a02383511046d1a1216d9a5fd3`, passed: **10 fresh migrations, 24 database tests, 23 unit tests, typecheck, lint, production build**, the 1,200-product / 50,000-row benchmark, and an authenticated **100,001-row export-limit rejection**. Real local Supabase browser run **35459052949**, commit `61d58c4ac79584d4ab4404446f891b0d1033d8ae`, passed **13/13 tests in 56.4 seconds**, including the updated titles, all canonical routes and the unsaved Orange drink product-form reference state.

The browser checks cover all **22 routes at six viewport sizes (132 route/viewport combinations)**. Its 47 screenshots include all 22 desktop and 22 mobile screens, the correct pre-sale POS/cart states and A4 print output. Both desktop and mobile contact sheets were visually inspected. Remaining composition/state differences are explicitly recorded in VISUAL_QA.md; a passing no-overflow check is not a pixel-parity approval.

Migration 009 keeps deferred ledger invariants while using store/product indexing. Migration 010 confines parameter-aware query planning to the report RPC. The final runner measured purchase-report p95 **102.04 ms**, 20-line receipt **11.71 ms** and checkout **14.25 ms**. These are localhost authenticated SQL timings, **not deployed HTTP latency**. Every balance/ledger chain and full-dataset export reconciled; raw runner measurements are in `docs/verification/performance-2026-09-19.json`.

Feature pushes in this continuation include dialog accessibility (`255f6d7`), scoped ledger validation (`b8ac85e`), bounded streaming request bodies (`2457ead`), real new-owner/concurrent Supabase browser coverage (`0e98d86`), parameter-aware report planning/CI benchmark (`9702caf`), reference-aligned catalog/purchase/inventory screens, bounded CSV streaming, Vercel-native configuration, canonical reference-state tests (`9ef3bc2`), database export-boundary testing (`61d58c4`) and source-handoff CI (`173c7e8`).

## Remaining release gates

1. **Hosted data:** select a dedicated Supabase organization/project and explicitly approve any cost. Apply migrations only to that approved target; configure production site/callback URLs and SMTP. The unrelated TakaTrack database was not modified.
2. **Vercel:** deployment was explicitly attempted through the connected tool, which returned JSON-RPC `-32602: Tool deploy_to_vercel not found`. No deployment ID or live URL was created. A working deployment action or repository import, approved hosted Supabase configuration and hosted workflow verification remain necessary; see README.
3. **Gemini:** securely configure a real key/model and execute the documented Bengali/English smoke test. Missing-key behavior is verified; successful external generation is not.
4. **Visual/acceptance:** reference-derived layouts and all 22 route captures are documented, but composition/state differences remain in VISUAL_QA.md. Exact pixel parity, Safari/Firefox, physical printers, all editor keyboard combinations and production multi-instance latency are not verified. The 100,001-row CSV rejection boundary is covered by both unit tests and an authenticated database test over real source records.

Do not mark the full release checklist complete from a green build alone. Do not expose a seed, time override, direct quantity editor, service key or deterministic AI fallback in production.
