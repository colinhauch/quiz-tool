-- RLS decides which rows; the role still needs table-level privileges.
grant select, insert on public.answers to authenticated;
grant select, insert, delete on public.pack_selection to authenticated;
grant select, insert, update on public.pack_selection_state to authenticated;
