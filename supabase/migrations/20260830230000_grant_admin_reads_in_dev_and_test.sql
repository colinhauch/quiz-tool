-- The admin visualizer can now read any Environment, not just prod (spec #171,
-- issue #172). Its grants never followed it there.
--
-- 20260827000000 granted the service_role its read privileges in `public`
-- only, and said so explicitly: "Prod lives in `public`; the admin reads prod,
-- so this scopes to the public schema." That premise expired the moment the
-- environment selector shipped. The service_role has no USAGE on `dev` or
-- `test` at all, so every cross-user surface 500s the moment either is
-- selected — which is immediately, since the SPA's first-run default is `dev`,
-- where the real data lives.
--
-- USAGE is the half that is easy to miss: 20260830203511 already granted
-- SELECT on `dev.feedback` and `test.feedback`, but without USAGE on the
-- schema itself those grants are unreachable, so Feedback was broken in dev
-- too despite looking correctly granted.
--
-- Read-only and least-privilege, matching 20260827000000: SELECT on exactly
-- the tables `AdminReadStore` reads, nothing wider. `pack_selection` and
-- `pack_selection_state` are deliberately omitted — the admin does not read
-- them in any Environment. The service_role bypasses RLS, so this is the only
-- gate standing between the key and these rows; keep it narrow.
--
-- Grants only. No table is created, altered, or dropped, and no row is touched.
--
-- APPLIED 2026-08-30 to the live project via the Supabase MCP `apply_migration`,
-- as every migration before it was — there is no auto-apply pipeline (see
-- docs/deploy/migrations.md and issue #88).
do $$
declare
  s text;
begin
  foreach s in array array['dev', 'test'] loop
    execute format($f$
      grant usage on schema %1$I to service_role;

      grant select on %1$I.answers to service_role;
      grant select on %1$I.pack_ability to service_role;
      grant select on %1$I.card_difficulty to service_role;
      -- Already granted by 20260830203511, but that grant was unreachable
      -- without the schema USAGE above. Repeated here so this migration is
      -- self-contained and idempotent.
      grant select on %1$I.feedback to service_role;
    $f$, s);
  end loop;
end $$;
