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

`1fa6b7d1648af02ecd5dddb19d38381edd71b07f` passed application CI with **23 unit tests, 24 database tests**, the 1,200-product / 50,000-line benchmark and production build. Application run: `35458667747`. The latest completed real Supabase browser suite at `0e98d86f2408743bdee3f8c1bc406007a292ea21` passed **13 browser tests** with no failures (run `35457664045`); a newer browser run covering the UI/export changes is tracked separately until it completes.

Migration 010 additionally scopes custom query planning to the report RPC. All **10 migrations** applied cleanly to a new disposable database, and the **24 database tests** passed again locally. The final local 50,000-line benchmark passed every reconciliation and recorded 96.19ms purchase-report p95; these are localhost SQL measurements, not deployed latency. The CI workflow repeats this benchmark and the authenticated 100,001-row export-limit check; the final run passed both.

Feature pushes in this continuation include dialog accessibility (`255f6d7`), scoped ledger validation (`b8ac85e`), bounded streaming request bodies (`2457ead`), real new-owner/concurrent Supabase browser coverage (`0e98d86`), parameter-aware report planning/CI benchmark (`9702caf`), reference-aligned Products/Categories/Purchases/Inventory screens (`dc91667`–`3144a33`), streamed bounded CSV exports (`6742c2f`–`1fa6b7d`), Vercel-native config (`4ee049f` / `07493ef`) and release QA/documentation.

## Remaining release gates

1. **Hosted data:** select a dedicated Supabase organization/project and explicitly approve any cost. Apply migrations only to that approved target; configure production site/callback URLs and SMTP. The unrelated TakaTrack database was not modified.
2. **Vercel:** the connected Vercel team is available, but this app is not yet linked/deployed because the dedicated hosted Supabase target must be approved first. Environment/import and hosted workflow verification remain necessary; see README.
3. **Gemini:** securely configure a real key/model and execute the documented Bengali/English smoke test. Missing-key behavior is verified; successful external generation is not.
4. **Visual/acceptance:** all 22 references have a documented comparison in VISUAL_QA.md and the major Products/Categories/Purchases/Inventory heading/layout mismatches were corrected. Exact pixel identity, Safari/Firefox, physical printers, all dialog keyboard combinations and production multi-instance latency are not verified. The 100,001-row CSV rejection boundary is now covered by unit tests.

Do not mark the full release checklist complete from a green build alone. Do not expose a seed, time override, direct quantity editor, service key or deterministic AI fallback in production.
