# Read-only, replaceable AI

## Contract and boundaries

`InventoryInsightProvider.generateInventoryInsights(facts, language, requestContext)` is the provider-neutral capability. Input is a server-created, owner-scoped fact snapshot; output is untrusted structured text, not SQL, tools or business mutations. `src/lib/ai/service.ts` orchestrates authorization, quota/lease/cache, the provider call, independent validation, persistence and current/stale delivery. UI, POS and database posting code do not import a Gemini API.

`providers/gemini.ts` is the only vendor-specific implementation. It uses Google's REST `generateContent` endpoint with structured JSON output and a bounded AbortSignal, at most one retry for transient rate-limit/server failures within the same deadline. No provider SDK is imported elsewhere. `providers/test.ts` is deterministic and explicitly test-only; production configuration cannot silently fall back to it.

## Grounded output, not generated arithmetic

Facts include version/hash, snapshot timestamp, Dhaka date, revision, stock status counts, bounded attention examples and shortages, current reference-cost estimate/category values, and today's posted sales/purchases. Totals cover all records; attention examples have explicit truncation metadata. Emails, passwords, tokens, customer/supplier phone numbers and full receipts are not sent.

The application prepares approved short summary/section templates bound to fact placeholders. Gemini selects appropriate wording/sections from that policy. Independent validation requires exact approved text and fact IDs; persistence stores only validated selection keys. Display resolves numbers from the server fact map, including Bengali digits. This is intentionally more restrictive than a free-form chatbot: the provider does not invent quantities, calculate profit or predict demand. Unknown IDs/placeholders, numeric claims outside the approved policy, HTML, arbitrary URLs and oversized output are rejected. Product names remain untrusted data rendered as escaped text, never instructions or HTML.

A successful response carries provider, model, language, prompt version, facts hash, store revision, business date, snapshot and generation times. The previous response becomes stale when data changes or the Dhaka business date rolls over. A result completed after a concurrent mutation retains the old provenance and stale marker.

## Cache and reliability

Generation requires an explicit UI action. `begin_insight` atomically reuses an exact matching cache entry or acquires one short-lived lease per store/language and consumes the bounded store/hour allowance. The external call happens after the database transaction releases its locks. `finish_insight` validates grounded selection keys and retains the latest 20 successful results per store/language. Failures release the lease and do not produce a successful insight row. Source facts and all business features remain available on missing key, unsupported configuration, rate limit, timeout or invalid provider output.

Application quota defaults to 10 generations per store/hour, is bounded in SQL, and is not a statement of Google's quota. Cache hits do not consume another generation. No email/contact retention promises are made for the external provider; the interface tells the owner that necessary business facts are sent externally.

## Configuration and model verification

`.env.example` selects `AI_PROVIDER=gemini` and `GEMINI_TEXT_MODEL=gemini-3.8-flash`. Google's current model documentation lists `gemini-3.8-flash` as a stable Gemini 3 model, and the structured-output documentation demonstrates schema-constrained JSON output with that model. Checked **19 September 2026**. This is a documentation-checked configuration example, **not a claim that this account successfully called it**. No real Gemini credentials were supplied; a production model smoke test remains unexecuted.

Before enabling generation, verify the chosen model is available to the project's API key/billing/region and supports the required generateContent structured-output configuration. Set the key server-side, not NEXT_PUBLIC. Start with a 30000ms timeout and 1500 output tokens; adjust within the validated application limits after measuring that model. Unsupported model configuration fails visibly rather than guessing an alternate model or returning fixture prose.

Official references:
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/api/generate-content

## Add or switch a provider

1. Implement `InventoryInsightProvider` in a new server-only adapter file. Translate the same neutral facts/policy to that provider's request and return the neutral structured output. Do not give it database write credentials or tool execution.
2. Register the adapter and its validated configuration in the registry/config module. Extend only the provider configuration and provenance validation where necessary, not POS, forms, report SQL or the facts schema.
3. Run contract, adversarial grounding, timeout, quota and stale-result tests. With approved credentials, run a real provider smoke test on a dedicated test store and record model/date/results.
4. Deploy and select that implemented provider using configuration. Switching between adapters that already exist requires configuration plus restart/redeploy; adding a new vendor necessarily requires its adapter code and credentials.

The current release has one real provider, Gemini, plus the test-only deterministic adapter. Merely changing AI_PROVIDER to an unimplemented vendor is not supported.

## Required real smoke test

On a dedicated test deployment, make a real category/product/purchase/sale, open Insights, generate in Bengali and English, verify the displayed fact-bound values against reports, and confirm a successful persisted provenance row. Repeat without changing data to inspect the cache; change a reference cost or receive goods and verify stale labeling; temporarily remove the key and verify that source facts and checkout remain functional. Do not mark this test passed from mocked fetch responses or deterministic adapter tests.
