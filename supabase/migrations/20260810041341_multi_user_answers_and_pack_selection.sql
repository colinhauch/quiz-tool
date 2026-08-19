-- Multi-user schema for the geography learning MVP (#55/#57).
-- Every user-side row carries user_id, defaulted to the caller's auth.uid()
-- and pinned by RLS so a user can only ever read/write their own rows.

-- ---------------------------------------------------------------------------
-- answers: the answer log. Flat MVP shape (card ref, input, correctness, time).
-- ---------------------------------------------------------------------------
create table public.answers (
  id       bigint generated always as identity primary key,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id  text not null,
  input    text not null,
  correct  boolean not null,
  asked_at timestamptz not null
);

-- RLS lookups and the natural "my answers in order" read both filter on user_id.
create index answers_user_id_idx on public.answers (user_id, id);

alter table public.answers enable row level security;
alter table public.answers force row level security;

create policy answers_select on public.answers
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy answers_insert on public.answers
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- pack_selection: which packs the learner chose. Was a singleton preference;
-- now per-user. The whole set is rewritten on save (delete-then-insert).
-- ---------------------------------------------------------------------------
create table public.pack_selection (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_id text not null,
  primary key (user_id, pack_id)
);

alter table public.pack_selection enable row level security;
alter table public.pack_selection force row level security;

create policy pack_selection_select on public.pack_selection
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy pack_selection_insert on public.pack_selection
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy pack_selection_delete on public.pack_selection
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- pack_selection_state: one row per user, recording that a selection was ever
-- saved. Keeps "deselected down to nothing" distinct from a first run, so
-- read() can return null (=> default to all packs) only when truly unset.
-- ---------------------------------------------------------------------------
create table public.pack_selection_state (
  user_id  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  saved_at timestamptz not null
);

alter table public.pack_selection_state enable row level security;
alter table public.pack_selection_state force row level security;

create policy pack_selection_state_select on public.pack_selection_state
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy pack_selection_state_upsert on public.pack_selection_state
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy pack_selection_state_update on public.pack_selection_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
