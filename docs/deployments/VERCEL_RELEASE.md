# Vercel release — approved inventory project

The hosted database was installed and backed up in the prior cutover; do **not** reset it or reapply the original migrations. The approved non-secret target is recorded in `config/deployment-target.json`. Its publishable Supabase key is intentionally public, not a service-role or management credential. Existing backup/archive schemas are never touched by this release tooling.

## Current authorization blocker

On 20 September 2026, the connected Vercel deploy action returned `-32602: Tool deploy_to_vercel not found`. Listing the Vercel team works, but there is no working connected project-create/environment-write/deploy action. A GitHub Actions preflight verified that `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, and `GEMINI_API_KEY` are not configured in the repository. This is an external authorization requirement, not an application test failure.

## Run the prepared deployment

Go to **Settings → Secrets and variables → Actions → New repository secret** in this repository and add:

| Secret | Purpose and permitted destination |
|---|---|
| `VERCEL_TOKEN` | Short-lived Vercel token authorized for `wdmahbuburs-projects`. Sent only to `api.vercel.com`. |
| `SUPABASE_ACCESS_TOKEN` | Supabase management token authorized for `galgetikfkyceqkaqdha`. Used only to verify project identity and read/update its Auth callback origins via `api.supabase.com`. |

Do not send tokens in chat or commit them. Use the shortest practical expiration and revoke them after setup when unattended deployment is not needed. The Supabase management token is never copied into the application or Vercel environment. No administrator database key is required by the application.

Open **Actions → Deploy Smart Inventory to Vercel → Run workflow → master**. Adding a secret alone does not start a run. The workflow also runs when its scripts/target change, but never on untrusted PRs or other branches.

For an existing verified custom domain, set the optional Actions **variable** `APP_URL` to its HTTPS origin. Otherwise the script discovers a verified production `.vercel.app` domain from the actual project. It never invents or purchases a domain and stops if a verified production domain cannot be resolved.

## Automated steps and safeguards

Without deployment credentials available to dependency installation/tests, the workflow runs deployment safety tests and `npm run verify`. It checks the real Supabase Auth endpoint, all 12 anonymous table-access denials and two read-only RPC denials. These checks never create accounts or write stock.

With both required secrets it verifies the exact Supabase ref/name/organization, creates or reuses only the approved Vercel project linked to this repository, upserts production environment variables and deploys the exact verified commit SHA. After a real READY deployment and confirmed production alias, it sets the Supabase Site URL and exact registration/recovery callbacks, preserving other redirects, SMTP, confirmation, sessions and rate limits. It then checks public pages, protected API denial and dashboard redirection on the actual live origin.

The saved report contains actual IDs, URL, source SHA, checks and remaining gates—not management credentials or Auth configuration dumps. Unknown external write outcomes are not blindly replayed. Inspect the saved state/provider dashboard before retrying. Missing credentials explicitly produces **NOT DEPLOYED**, even when the preceding verification job passes.

## Separate release gates

Live read-only checks do not prove authenticated Purchase/POS workflows, email delivery or successful AI output. After deployment, run the new-owner journey and cross-owner/concurrent checkout checks on an approved test account without touching the legacy archives. Existing local/CI results remain in `TEST_RESULTS.md`.

Configure a real SMTP sender in Supabase for general public registration. The built-in sender is restricted and not a production email service. The script preserves SMTP settings and only records whether a custom host exists; it never disables email confirmation to make a test pass.

AI remains optional. For the requested production provider, add `OPENROUTER_API_KEY` as a server-side secret. `OPENROUTER_TEXT_MODEL` may be set to `nvidia/nemotron-3-ultra-550b-a55b:free`; the application also defaults to that reviewed slug. Gemini remains an explicitly supported alternative. Purchase/POS do not require either AI provider.

## Commands and test limits

```sh
node --test tests/deployment/*.test.mjs
node scripts/check-hosted-public.mjs # actual hosted reads; no business writes
# Supply credentials through a secure environment, only for the exact master checkout:
node scripts/deploy-production.mjs
```

Orchestration tests use deterministic HTTP mocks. They do not certify a real Vercel deployment. Record external outcomes separately.

## Official references checked

- https://vercel.com/docs/rest-api/projects/create-a-new-project
- https://vercel.com/docs/rest-api/reference/endpoints/projects/retrieve-project-domains-by-project-by-id-or-name
- https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables
- https://vercel.com/docs/rest-api/deployments/create-a-new-deployment
- https://supabase.com/docs/reference/api/v1-update-auth-service-config
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
- https://ai.google.dev/gemini-api/docs/models
