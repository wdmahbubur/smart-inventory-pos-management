# AI-generated predictions and suggestions — v3

## What the AI actually does

The production model now generates its own product-level **next-7-day expected sales**, **low/high ranges**, **business recommendations**, **reorder quantities or test discounts**, and **explanations**. It is no longer limited to selecting `summary_key` and `section_keys`. The older ranking implementation remains only as compatibility code and its old database functions remain available during rollout; it is not used by the new page or Generate path.

`GET /api/insights?language=en` reads observed store data and the latest compatible saved prediction from PostgreSQL. It does not configure or call an external model. `POST /api/insights` always requests a fresh external inference for an authenticated, quota-eligible user. A supplied legacy `regenerate:false` cannot enable cache reuse. There is no cached-result return branch in `begin_prediction` or the generation service. Missing configuration, quota exhaustion, concurrent requests and provider errors are explicit failures, not fake successful AI responses.

## Default provider

```env
AI_PROVIDER=openrouter
OPENROUTER_TEXT_MODEL=apodex/apodex-1.1-mini:free
OPENROUTER_API_KEY=<server-side secret only>
AI_PROMPT_VERSION=inventory-predictions-v3
AI_MAX_OUTPUT_TOKENS=6000
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_REQUESTS_PER_HOUR=10
```

An explicit model environment value overrides the source default. Legacy `inventory-insights-v1` / `inventory-suggestions-v2` prompt versions upgrade to v3; an old 1500-token ranking budget upgrades to 6000 for full output. Other output budgets must be 2000–12000. Prompt variants must retain the `inventory-predictions-v3-...` namespace because the output contract is versioned. No provider key is sent to the browser, committed or persisted in business tables. The app has no automatic fallback to a paid model or another vendor.

OpenRouter uses an uncached `POST /api/v1/chat/completions` with exactly one requested `submit_inventory_prediction` function output. This is a JSON output interface, not an executable database tool. Gemini remains a replaceable structured-JSON adapter. Both now implement `PredictionProvider` and return the generated output plus provider response ID/model metadata. Response bodies are bounded to 128 KiB and model output to 40,000 characters. Retries are limited to one additional transient/network attempt, within the request timeout.

Official references checked for this implementation:
- https://openrouter.ai/docs/guides/features/tool-calling
- https://openrouter.ai/apodex/apodex-1.1-mini:free
- https://supabase.com/docs/guides/database/functions

Model catalog support is not proof of a successful live inference in this application.

## Observed inputs, not preset answers

`get_prediction_context()` returns a tenant-scoped `prediction-facts-v3` snapshot. It includes 56 complete Asia/Dhaka business days of zero-filled daily sales; 7-day, previous-7-day and 30-day counts; partial sales today separately; current stock/minimums; current price/reference cost; observed product lifetime; and latest-sale recency. Future-dated sales are excluded from the product history. Last-sale recency is not the age of the remaining batch and does not imply expiry. Products with no sale are dated from their first receipt where available.

The request is bounded to 24 active products, prioritizing low-stock items and sales history. Total product count and truncation are explicit. Output is bounded to 12 predictions and 8 recommendations. Totals in the UI are labeled as covering the products predicted, not necessarily the whole catalog. The model does not receive the old deterministic `forecast` object, preset card wording or a list of approved suggestion keys.

Live weather, local events, competitor prices, supplier lead times, expiry data and operating expenses are not ingested. The prompt forbids claiming that these are known; conditional assumptions and missing-data limitations must be stated. Names/SKUs are untrusted data, not instructions. Passwords, customer contact data, emails and full receipts are not included.

## Output validation and limitations

The model's numbers and prose are kept, not replaced with templates or silently overwritten by a heuristic. Runtime and database validation check the output shape, allowed product references, unique predictions/actions, integer bounds, nonnegative ordered ranges, evidence keys and action-specific values. High confidence is rejected for very short/sparse recorded histories. Discount suggestions require stocked products, positive reference cost and at least a 10% margin on the **discounted** price; other prices/quantities remain advisory.

These checks do **not** prove that generated explanations are factually correct, that demand is predictable, or that ranges are calibrated statistical intervals. The UI explicitly labels the output as AI estimates. Review assumptions and recorded inputs before buying stock or discounting. The model cannot edit prices, stock, sales or purchases. Links only open existing review forms; an AI reorder quantity is not automatically posted into a purchase.

## Persistence and provenance

Apply `202610020001_ai_generated_predictions.sql` before deploying the new UI. It adds `get_prediction_context`, `latest_prediction`, `begin_prediction`, and `finish_prediction`, plus private validators. Existing business schemas and v1/v2 RPCs remain unchanged.

A successful result is saved in `ai_insights.content`:

```json
{
  "schema_version": "ai-prediction-v3",
  "output": {
    "summary": "Model-written overview",
    "predictions": [],
    "suggestions": [],
    "assumptions": [],
    "limitations": []
  },
  "provider_response_id": "Provider response ID, when supplied",
  "response_model": "Provider-reported model, when supplied"
}
```

This abbreviated example shows the envelope only, not a valid complete output. Real saved output must satisfy all required fields/array bounds.

The server/DB preserve provider, requested model, prompt version, generated time, input snapshot and hash. `GET` returns `source:database` (or `none`) and status `ready`, `stale`, `not_generated`, `legacy_result` or `invalid_saved_result`. Successful `POST` returns `source:provider`, `provider_called:true`, `cached:false` and the new saved result. These markers describe the application code path; they are not a cryptographic third-party attestation. Database RPC writes remain owner-scoped, so a privileged administrator or owner with direct RPC access can alter their own insight records.

Older ranking records are not presented as full AI predictions. Previous valid v3 output is retained on failure, and the client ignores late GET responses that would overwrite a just-generated result. A changed business day, revision or input hash marks saved predictions stale. Each language has separate saved output and concurrency leases; both languages share the bounded store hourly quota. Up to 20 v3 results per language are retained.

## Verification and rollout

Unit tests instrument the provider adapter and generation service: unchanged data still makes two provider calls across two Generate operations; GET makes none; model-written quantities/prose survive; failures do not save; unsafe outputs are rejected. Database tests exercise persistence, no-cache leases, owner isolation, shared quota, raw-day boundaries and legacy detection against a disposable PostgreSQL database. The browser AI-output test explicitly mocks the HTTP response to test rendering/reload/failure behavior; it is not a real provider smoke test.

After deployment, run a live English/Bengali generation with the configured provider, confirm the response/model/ID in the UI and saved row, click Generate twice on unchanged data to see two new provider responses, reload to observe a database read, and verify failure keeps the last dated result. Never report a mocked provider response as a successful live inference.
