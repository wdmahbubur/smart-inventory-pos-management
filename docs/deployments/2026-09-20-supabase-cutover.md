# Hosted Supabase cutover — 20 September 2026

## Target and authorization

Project: `inventory-management-v2`, reference `galgetikfkyceqkaqdha`, region `ap-northeast-2`. The user explicitly selected this project and authorized retaining a backup and installing the new schema. No new project was created. The unrelated TakaTrack project was not modified.

Application SQL source: the ten migrations in `supabase/migrations` at commit `a9a2e3442e0662b891c74b29e5c494b3531c06ea`. Installed function bodies were compared against this source, ignoring SQL line comments and whitespace: **35 expected, 35 matching, zero mismatches**.

Final database verification: **2026-09-20 04:50:17 UTC / 10:50:17 Asia/Dhaka**. This document records a completed database operation, not a Vercel deployment or a real Gemini generation.

## Backup and preservation

The earlier table-list estimate of zero rows was not an exact count. Pre-cutover `COUNT(*)` found **70 existing rows**, all preserved:

| Legacy table | Exact original rows | Archived original rows | Backup-copy rows |
|---|---:|---:|---:|
| users | 4 | 4 | 4 |
| categories | 4 | 4 | 4 |
| products | 9 | 9 | 9 |
| orders | 8 | 8 | 8 |
| order_items | 11 | 11 | 11 |
| restock_queue | 4 | 4 | 4 |
| activity_logs | 30 | 30 | 30 |
| **Total** | **70** | **70** | **70** |

`legacy_inventory_backup_20260920` contains separate row-copy tables plus `backup_manifest` and `schema_metadata`. Source tables were locked during copying. Counts and both directions of `EXCEPT ALL` were checked before committing the backup. Metadata includes column/default definitions, constraints, indexes, triggers, original ACL/RLS state, enum labels, trigger-function definition and sequence state. The copy tables use `LIKE INCLUDING ALL`; PostgreSQL does not copy foreign keys or triggers through LIKE, so these are recorded in metadata and preserved on the original archived tables.

`legacy_inventory_20260920` contains the original seven tables, not reconstructed replacements. All original table OIDs remain unchanged. All eight legacy foreign keys, associated indexes and data were retained; none of those foreign keys points into the new public application tables. The original `order_number_seq` is retained at last_value **1009**, is_called **true**. The five enum types and `set_updated_at()` trigger function were moved into the same archive. The trigger function now has a fixed empty search_path.

The archive step acquired access-exclusive table locks and compared the live originals with their backup copies again before moving anything. A source change would have aborted the archive transaction. Post-installation row-by-row comparison again found no difference for all seven tables.

Both schemas deny USAGE and table/sequence access to PUBLIC, anon, authenticated and service_role. The original archive tables additionally have RLS enabled with no end-user policies. **Do not expose either schema in the Data API.** Legacy password hashes remain only in the protected database copies; they were not exported into this repository or sent to an AI provider.

**Backup limitation:** these are two preserved copies inside the same hosted database, not an offsite, PITR or independently downloaded disaster-recovery backup. Loss/deletion of the entire project could affect both. Obtain a separately stored, securely handled database backup for disaster recovery. Do not publish raw legacy data or credentials.

## New application schema

All ten application migrations applied successfully. New public tables are `profiles`, `stores`, `categories`, `suppliers`, `products`, `inventory_balances`, `purchases`, `purchase_items`, `sales`, `sale_items`, `stock_movements`, and `ai_insights`.

Verification found:

- **12/12 public tables have RLS**, with 12 owner-scoped SELECT policies.
- Anon has no SELECT or write permission on the application tables.
- Authenticated users have SELECT subject to RLS, but no direct INSERT/UPDATE/DELETE/TRUNCATE permissions.
- **17 public RPC entrypoints** are callable by authenticated users, not anon, and use SECURITY DEFINER with a fixed empty search_path and owner checks.
- Internal `private` schema is inaccessible to normal API roles.
- The signup trigger on `auth.users` invokes `private.on_auth_user_created()`.
- No unvalidated new table constraints remain.
- Report-only planner settings from migrations 009 and 010 are installed; global planner settings were not changed.

The legacy catalog/order schema was not silently converted into the new purchase/sales ledger. At final verification, the new public application tables contained **zero business rows**, and `auth.users` contained **zero users**. Old `legacy_inventory_20260920.users` accounts are not Supabase Auth accounts. Owners must register through the new application. Existing operational data remains available to a privileged operator in the archive for a separately specified import, without inventing opening stock or rewriting historical orders as posted purchases.

## Hosted smoke verification

A small transaction-level smoke test ran against the installed hosted PostgreSQL functions using two temporary Auth identities and the `authenticated` SQL role. It did not call the GoTrue HTTP API, send email, launch a browser or contact Gemini.

The completed test recorded 12 verification groups:

1. All seven archive tables equal their backup row copies.
2. Onboarding is idempotent and a new workspace starts empty.
3. Catalog RPCs create a zero-stock product; paginated reads work.
4. A purchase draft affects neither stock nor received totals.
5. Receiving ten units posts once; identical and already-received retries do not duplicate stock.
6. Selling three units at BDT 100 with BDT 20 discount and BDT 500 tender yields net BDT 280, change BDT 220 and stock seven; retry returns the same receipt.
7. Changed-payload key reuse and oversell are rejected without partial sale effects.
8. Direct authenticated balance updates are rejected by permissions.
9. Later catalog edits preserve receipt snapshots; sales, purchases, inventory, exports and deferred ledger checks reconcile. Actual received value is BDT 700; changing reference cost to BDT 90 gives a current estimate of BDT 630 without a stock movement.
10. Read-only AI facts reconcile and the durable generation lease SQL can be acquired/released without a provider call.
11. A second owner cannot read the first owner's products, sales, movements, entity, operation result or fact totals.
12. All temporary Auth users and business rows were rolled back; no demo accounts or stock remain.

The first smoke-script attempt hit a variable/column ambiguity in its direct-write test statement. That attempt rolled back; exact post-failure counts confirmed no retained fixtures. The test statement was qualified correctly and the full smoke test then passed. This was a test-harness correction; no application posting function was changed.

The successful record is stored at `legacy_inventory_backup_20260920.schema_metadata`, kind `verification`, object_name `smart_inventory_cutover`. Sequence allocations consumed during rolled-back tests may leave normal ledger-sequence gaps; no business document, quantity or test owner was retained. This verification is separate from the previous local/CI browser and concurrency tests documented in TEST_RESULTS.md. No new hosted concurrent HTTP checkout, email-delivery, browser, Vercel or successful Gemini smoke test is claimed here.

## Security Advisor result

The post-cutover Security Advisor returned **no ERROR-level findings**. The old seven public RLS-disabled errors and mutable legacy function search_path warning are no longer present.

It still reports **17 WARN** findings for authenticated-callable SECURITY DEFINER functions and **7 INFO** findings for RLS-enabled archive tables without policies. The RPC warnings describe the intentionally restricted mutation/read entrypoints required by this application's architecture; ownership, search_path and grants were checked, including a two-owner SQL smoke test. The archive no-policy state is intentional deny-by-default behavior. These findings are disclosed rather than described as a clean independent security audit.

Official explanations:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Migration history and future changes

The Supabase migration tool recorded its actual execution timestamps:

| Recorded version | Operation |
|---|---|
| 20260920043751 | Backup legacy tables |
| 20260920043855 | Archive verified originals |
| 20260920044022 | Application 001 — schema/security/identity |
| 20260920044110 | Application 002 — catalog |
| 20260920044200 | Application 003 — atomic posting |
| 20260920044254 | Application 004 — read models |
| 20260920044338 | Application 005 — reports |
| 20260920044357 | Application 006 — stock attention |
| 20260920044424 | Application 007 — insights |
| 20260920044445 | Application 008 — AI quota fix |
| 20260920044453 | Application 009 — scoped ledger verification |
| 20260920044501 | Application 010 — report planning |
| 20260920044755 | Successful rollback-only smoke validation |

A subsequent baseline-recording migration added `private.app_migrations` with the original ten source filenames and their SHA-256 checksums, after function-body verification. The final Supabase history contains **14 records**, while the application checksum ledger contains **10 source migrations**. No history was deleted or falsified to make the version numbers look identical.

**For this target, use the repository's checksum-aware `npm run db:migrate` runner for future new migrations**, with the existing explicit remote-target confirmation and securely supplied administrator connection. It will skip these ten unchanged sources and reject edited historical files. Do not run an unreconciled `supabase db push` or reset against this database: MCP timestamps differ from local CLI filenames. Switching migration tools requires a deliberate history-reconciliation procedure. Do not reapply the initial schema, remove the archives or restore unrestricted legacy grants.

## Remaining integration steps

The dedicated hosted schema is ready. Vercel project/import/environment setup, the app's approved APP_URL and Supabase email/callback configuration, and hosted Auth/browser end-to-end verification remain. Gemini configuration and an actual provider smoke test remain optional external setup. This cutover did not deploy the frontend or set an AI key.
