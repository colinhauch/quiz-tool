-- Atomic whole-set rewrite of a user's pack selection, in one transaction, so a
-- replace can never half-apply (delete succeeds, insert fails) the way three
-- separate PostgREST calls could. SECURITY INVOKER: runs as the caller, so RLS
-- and auth.uid() apply exactly as in a direct query.
create or replace function public.set_pack_selection(p_pack_ids text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.pack_selection where user_id = (select auth.uid());

  if array_length(p_pack_ids, 1) is not null then
    insert into public.pack_selection (pack_id)
    select unnest(p_pack_ids);
  end if;

  insert into public.pack_selection_state (saved_at) values (now())
  on conflict (user_id) do update set saved_at = excluded.saved_at;
end;
$$;

revoke execute on function public.set_pack_selection(text[]) from public, anon;
grant execute on function public.set_pack_selection(text[]) to authenticated;
