# Smart Inventory + Simple POS

A responsive Next.js App Router / TypeScript application for one owner and one store. Catalog, received purchases, cash POS, immutable receipts, inventory, reports and source facts use authenticated Supabase data. AI is optional and cannot write stock.

**Default branch:** `master`; implementation PR #1 was merged after green verification. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [TEST_RESULTS.md](TEST_RESULTS.md) and [VISUAL_QA.md](VISUAL_QA.md) for implemented scope, executed checks and remaining release gates. A live deployment or successful Gemini call is not implied by a production build.

## Requirements and install

Use Node **22.16.0**, npm **10.9.2**, PostgreSQL **17**, and Supabase CLI **2.117.0** for the documented test environment. Dependencies are pinned in `package-lock.json`. Docker is needed only for the local Supabase stack. The initial install, Chromium download and Google font build fetch require network access.

```sh
git clone https://github.com/wdmahbubur/smart-inventory-pos-management.git
cd smart-inventory-pos-management
nvm use
npm ci
cp .env.example .env.local
```

## Local Supabase: a real database and Auth, not a UI mock

Do not link this app to the unrelated TakaTrack project. From the repository root:

```sh
supabase start
supabase status
```

The CLI applies all `supabase/migrations/*.sql` to the new local database. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` from the local status output. A local legacy anon key may fill the publishable-key variable; **never use a service-role or secret key there**. Set `APP_URL=http://127.0.0.1:3000` consistently with `supabase/config.toml`.

```sh
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`, register a new owner/store, then open the confirmation link in the local mail viewer at `http://127.0.0.1:54324`. New accounts are empty. Create a category, supplier and product; receive a purchase before attempting a sale. Password recovery uses the same local mail service.

`supabase db reset` **destroys this local stack's data** and reapplies migrations. Use it only for the disposable development/test environment. `supabase stop` stops that stack.

## Dedicated hosted Supabase

Create a **new, dedicated** project in an explicitly selected organization after reviewing its cost. Configure its site URL and exact callback allowlist to the deployed app origin:

- `https://YOUR-APP/auth/callback`
- `https://YOUR-APP/auth/callback?next=/reset-password`

Use Supabase CLI `supabase link --project-ref YOUR_NEW_PROJECT_REF` and `supabase db push` only after checking the target. The SQL migrations are the schema source of truth. Configure production SMTP, email delivery, confirmation and Auth rate limits; local mail tests do not verify real email deliverability. Do not copy the permissive local test email rate limits to production.

As an alternative for an **empty hosted Supabase database**, `DATABASE_URL=... ALLOW_REMOTE_MIGRATIONS=I_HAVE_CONFIRMED_THE_DEDICATED_PROJECT npm run db:migrate` uses a private migration checksum ledger. Do not mix this runner with the CLI on an already-migrated database: the two tools maintain different migration histories. `DATABASE_URL` belongs only in controlled administrator tooling, never the running app or browser.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public build/runtime | Dedicated project's API URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public build/runtime | Publishable/anon client key; RLS and grants enforce security. |
| `APP_URL` | Server | Exact approved origin, including local port. |
| `AI_PROVIDER` | Server | `openrouter` by default; `gemini` remains supported. |
| `OPENROUTER_API_KEY` | Server secret | Optional; required only for OpenRouter generation. Never expose to the browser. |
| `OPENROUTER_TEXT_MODEL` | Server | Defaults to `nvidia/nemotron-3-ultra-550b-a55b:free`. |
| `GEMINI_API_KEY` | Server secret | Optional alternative-provider key. |
| `GEMINI_TEXT_MODEL` | Server | Required only when `AI_PROVIDER=gemini`. |
| `AI_REQUEST_TIMEOUT_MS` | Server | 30000 by default. |
| `AI_MAX_REQUESTS_PER_HOUR` | Server | 10 maximum per store; application quota, not Google's quota. |
| `AI_MAX_OUTPUT_TOKENS` | Server | 1500 default. |
| `AI_PROMPT_VERSION` | Server | `inventory-suggestions-v2`; legacy `inventory-insights-v1` is upgraded by the application. |

Changes to public values require a rebuild. Never paste secrets into issues, commits, client components or support logs. Missing Supabase configuration displays an explicit setup state rather than fabricated business data. Missing AI configuration does not block inventory or checkout. OpenRouter free-model availability and quotas are external to this application.

## Tests

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run verify` combines those four checks. For database tests, create a **separate disposable localhost database named `smart_inventory_test`**, not the local Supabase application's `postgres` database:

```sh
export DATABASE_TEST_URL=postgresql://postgres:postgres@127.0.0.1:54322/smart_inventory_test
createdb --maintenance-db=postgresql://postgres:postgres@127.0.0.1:54322/postgres smart_inventory_test
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/database/bootstrap-role-context.sql
for file in supabase/migrations/*.sql; do psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -f "$file"; done
npm run test:database
npx tsx scripts/performance.ts
```

These tests deliberately simulate verified SQL roles/JWT contexts in standalone PostgreSQL. They are **not a replacement** for the real Auth/PostgREST tests. The performance script creates 1,200 products and 50,000 receipt-item/movement records through real posting RPCs, checks all exports/pages and measures 30 warm samples. It rejects remote targets and database names not ending `_test`. It creates a new synthetic owner per run; dispose of the test database afterward.

For browser tests, use the actual local Supabase stack. Export its URL, anon key, service key and PostgreSQL connection **only in the test runner shell** as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_TEST_SERVICE_KEY`, and `DATABASE_URL` respectively:

```sh
export APP_URL=http://127.0.0.1:3000
export SEED_ALLOW_LOCAL_DEMO=1
npx tsx scripts/prepare-browser-fixtures.ts
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Playwright starts the production server. It tests real email verification/recovery in local mail, ownership through real JWT/PostgREST, checkout timeout recovery, the new-owner operational journey, concurrent last-unit checkout, keyboard modal focus, print styles and all 22 routes at 360, 390, 768, 1024, 1440 and 1920 pixels. Screenshots are under `test-results/screenshots/{390,1440}`. GitHub Actions runs both isolated database checks and disposable Supabase browser checks; artifacts are retained for a limited time.

## Controlled fixtures

`prepare-browser-fixtures.ts` creates explicitly marked **new local demo owners** and writes test login information to ignored `.local-browser-fixtures.json` with mode 0600. Never publish this file. The seed runner rejects remote databases, non-demo stores and nonempty stores. To reproduce a single fixture after explicitly creating an empty local demo owner:

```sh
SEED_ALLOW_LOCAL_DEMO=1 DATABASE_URL=... DEMO_OWNER_ID=... DEMO_STATE=post-sale npm run db:seed
```

`DEMO_STATE=pre-sale` omits the sale. P-0011 is the documented fixture-only opening receipt (17 September 2026, BDT 3535), P-0012 receives BDT 2050 on 18 September, P-0013 remains a BDT 2450 draft, and S-0021 sells BDT 330 net with BDT 170 change. Every seeded quantity has a document/item/movement chain. Supplier lifetime totals are therefore **two received purchases / BDT 5585**, not the reference's displayed single sample receipt. Only the local administrator seed can adjust fixture timestamps; the production APIs cannot set posting time, stock or demo status.

## Deployment to Vercel

`vercel.json` selects Next.js, `npm ci`, the production build, and a 60-second AI function limit. In Vercel, import this GitHub repository and select the completed implementation branch (or the reviewed merge into `master`). Use Node 22.x and set the three required Supabase/origin variables in the intended environment before building. Set optional AI provider variables only as server-side environment values. For the requested OpenRouter setup, add `OPENROUTER_API_KEY`; the reviewed model slug is the default. Keep preview callback URLs separately allowlisted; do not reuse an unrelated application's project or database.

After a deployment reaches Ready, verify on the **actual live origin**: register/confirm, empty catalog, create product, receive goods, save a separate draft, complete a discounted cash sale, print, inspect movements/low stock, export reports, deny another owner, and verify AI setup/error or one real generated suggestion explanation. A Vercel build does not apply database migrations.

A live deployment is not claimed until a dedicated hosted Supabase project is explicitly approved, migrated, and connected to Vercel. The connected Vercel account is available; production environment/import and the optional real Gemini smoke test are release setup steps that must be verified on the actual live origin.

## Operational guarantees and limitations

Stock starts at zero. Only a received purchase or completed cash sale changes it. Drafts and carts reserve nothing. Store-first locks, exact integer poisha, deferred ledger checks and idempotent operation keys protect posting. Received purchases, sales, items and movement history are immutable. Product/reference-cost changes affect current estimates, never historical document prices.

No returns, refunds, posted cancellations, manual adjustments, credit/dues, tax, accounting valuation, staff/multi-store access, voice input or hardware integration are included. Dashboard and sales reports show net profit as net sales minus the reference cost captured for each sold item at checkout; this is a sales-margin metric before rent, salaries, utilities, tax and other operating expenses, not FIFO or weighted-average accounting profit. Current inventory estimate remains current quantity times editable reference cost. CSV exports reject more than 100,000 source rows rather than silently truncating, and sales exports include captured cost plus a profit-contribution column. Order discounts appear once per sale in the export. Remember-me controls persistent versus session cookies, not a custom password store; browser session-restore behavior can retain session cookies.

Troubleshooting: use the supplied operation-status recovery after an unknown checkout outcome; do not create a new key/cart until it resolves. Resolve stale draft/product versions by reloading. For archive failures, remove/reassign saved drafts and reduce stock only through legitimate sales. Missing AI or a provider outage never justifies a manual stock rewrite.

See [architecture](docs/ARCHITECTURE.md), [database contracts](docs/DATABASE.md) and [AI adapter guide](docs/AI_PROVIDER_GUIDE.md).
