# Smart Inventory + Simple POS

Responsive Next.js / TypeScript / Supabase application implementing the supplied Smart Inventory PRD and 22-screen design set. Feature commits are delivered sequentially. See `IMPLEMENTATION_STATUS.md` for actual progress and verification; a scaffold is not a completed release.

## Source of truth

The complete PRD, design notes and all 22 reference PNGs are available in the ChatGPT Project. The previous provisional README incorrectly reported them unavailable. The PRD supersedes the previous tax/returns/credit/roles assumptions.

## Business rules

New product stock is zero. Only a received purchase or completed cash sale changes stock, through an authenticated atomic PostgreSQL function. Drafts do not affect stock or received totals. Posted documents and snapshots are immutable. No returns, manual adjustments, credit, tax, profit accounting, staff roles or voice features.

BDT amounts use integer poisha (`_paisa`) and JSON decimal strings. Dates use Asia/Dhaka. Inventory value is a reference-cost estimate. Gemini is optional, read-only and isolated behind a replaceable provider adapter.

## Development

Node 22.16.0 / npm 10.9.2. Install with `npm ci` once the generated lockfile is committed. Copy `.env.example` to `.env.local`, configure a dedicated Supabase project and apply version-controlled migrations. `npm run dev` starts Next.js.

Never use the unrelated TakaTrack database. Never commit keys, passwords or business records. Full migration, test, AI and deployment instructions are being added with their respective features.
