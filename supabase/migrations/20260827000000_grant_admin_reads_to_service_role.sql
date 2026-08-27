-- The @geo/admin BFF reads across all users with the `service_role` key. That
-- role bypasses RLS, but PostgREST still enforces table-level privileges, and
-- the original grants (20260810041542, 20260825120000) targeted `authenticated`
-- only — so the admin's Results/Population surfaces got "permission denied for
-- table ..." (see packages/admin/src/supabase-read-store.ts). Grant the
-- read-only privileges the admin actually needs. Prod lives in `public`; the
-- admin reads prod, so this scopes to the public schema.
grant select on public.answers to service_role;
grant select on public.pack_ability to service_role;
grant select on public.card_difficulty to service_role;
