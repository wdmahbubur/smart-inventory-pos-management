-- Reports vary materially by owner, date window, supplier and export mode.
-- A generic cached plan regressed after five calls on the 50,000-line fixture:
-- p95 ~800ms versus 87.76ms with a parameter-aware custom plan (30 warm calls).
-- Scope the planning preference to this read RPC, not to the whole database.
alter function public.get_report(text,jsonb,boolean) set plan_cache_mode=force_custom_plan;
