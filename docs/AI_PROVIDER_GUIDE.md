# Read-only, replaceable AI

## Contract and boundaries

`InventoryInsightProvider.generateInventoryInsights(facts, language, requestContext)` is the provider-neutral capability. Input is a server-created, owner-scoped fact snapshot; output is untrusted structured text, not SQL, tools or business mutations. `src/lib/ai/service.ts` orchestrates authorization, quota/lease/cache, provider calls, independent grounding validation, persistence, provenance and stale/current delivery.

The production registry currently supports two explicit adapters:

- **OpenRouter** — the default production provider for this deployment.
- **Gemini** — retained as an alternative adapter.
- The deterministic adapter is test-only and cannot be selected in production.

POS, purchases, reports and database posting code do not import either provider.

## OpenRouter / Nemotron configuration

Default configuration:

```text
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=<server-side secret>
OPENROUTER_TEXT_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_REQUESTS_PER_HOUR=10
AI_MAX_OUTPUT_TOKENS=1500
AI_PROMPT_VERSION=inventory-suggestions-v2
```

The API key is server-only. Never prefix it with `NEXT_PUBLIC_`, commit it, expose it in browser code, or store it in Supabase business tables.

OpenRouter's model page for `nvidia/nemotron-3-ultra-550b-a55b:free` was checked on **20 September 2026**. It lists the model as a free, rate-limited text model and reports tool-calling support, while `response_format` is not supported. The adapter therefore uses OpenRouter's OpenAI-compatible `POST /api/v1/chat/completions` endpoint and forces exactly one function/tool call whose JSON Schema is generated from the application's approved wording. It does **not** rely on free-form JSON mode. The returned function arguments are parsed and then passed through the same independent grounding validator used by every provider.

Official references:
- https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free
- https://openrouter.ai/developers

The free endpoint is rate limited and its model page warns against sending confidential or personal data. This application already excludes emails, passwords, customer/supplier phone numbers and full receipts from AI facts, but inventory metrics and bounded product/category names are still business data. The store owner should enable this provider only if that disclosure is acceptable under the provider's current terms.

## Grounded output, not generated arithmetic

Facts include version/hash, snapshot timestamp, Dhaka date, revision, stock status counts, bounded attention examples and shortages, current reference-cost estimate/category values, and today's posted sales/purchases. Totals cover all records; attention examples have explicit truncation metadata.

The database deterministically prepares bounded product-level demand forecasts and business signals from posted sales, captured product costs, current stock, margin, recency and a store-wide weekday factor. The application then prepares approved suggestion/explanation templates bound to those verified values. The provider may only select and prioritize approved strings and fact IDs; persistence stores only validated selection keys. Display resolves numbers from the server fact map, including Bengali digits.

The provider still cannot invent quantities, weather, market events, demand elasticity, URLs, SQL or stock changes. Forecasts are estimates rather than guarantees, and discount opportunities are controlled tests that retain a margin floor over current reference cost. Unknown IDs/placeholders, numeric claims outside the approved policy, HTML, arbitrary URLs and oversized output are rejected. Product/category names remain untrusted data, never instructions.

A successful response records provider, model, language, prompt version, facts hash, store revision, business date, snapshot and generation time. A previous response becomes stale when data changes or the Dhaka business date rolls over.

## Cache and reliability

Generation requires an explicit UI action. `begin_insight` atomically reuses an exact matching cache entry or acquires one short-lived lease per store/language and consumes the bounded store/hour allowance. The external request happens after the database transaction releases its locks.

Failures release the lease and do not create a successful insight row. Source facts and all non-AI business features remain usable when the key is missing, the selected model is unavailable, the free route is rate limited, the provider times out, or the returned output fails grounding.

Application quota defaults to 10 generations per store/hour. That is an application safety limit, not a statement about OpenRouter's current free-model quota.

## Gemini alternative

Gemini remains supported by selecting:

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=<server-side secret>
GEMINI_TEXT_MODEL=<supported Gemini model>
```

The Gemini adapter continues to use Google's structured JSON response schema. No automatic provider fallback occurs: an explicit provider failure is surfaced rather than silently sending the same facts to another vendor.

## Add or switch a provider

1. Implement `InventoryInsightProvider` in a server-only adapter.
2. Register it explicitly in `src/lib/ai/registry.ts` and validate its configuration in `src/lib/ai/config.ts`.
3. If provider/model provenance is constrained in PostgreSQL, add a version-controlled migration rather than loosening it ad hoc.
4. Run contract, adversarial grounding, timeout, retry, quota/cache and stale-result tests.
5. With an approved key, run a real provider smoke test against the dedicated demo store and record the actual provider/model provenance.

## Required live smoke test

After `OPENROUTER_API_KEY` is configured in Vercel, log into the dedicated demo store, open Insights, generate once in Bengali and once in English, verify the displayed fact-bound values against reports, and confirm the saved insight records `provider=openrouter` and model `nvidia/nemotron-3-ultra-550b-a55b:free`.

Repeat without changing data to inspect cache reuse; change a catalog reference cost or receive goods and verify stale labeling. Temporarily removing the key should make generation unavailable while source facts, Purchase and POS remain functional. Mock transport tests do not count as this live-provider smoke test.
