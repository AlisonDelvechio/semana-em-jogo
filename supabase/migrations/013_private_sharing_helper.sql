-- Aplicar após 012_care_sharing.sql.
-- Move a função auxiliar das políticas de compartilhamento para um schema que a API do
-- Supabase não expõe. Antes ela podia ser chamada em /rest/v1/rpc/is_shared_with_me;
-- não revelava nada além do acesso de quem chama, mas não precisa estar na API.
-- As políticas continuam com a mesma regra. Não altera dados.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_shared_with_me(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_link_goals g
    join public.care_links l on l.id = g.link_id
    where g.goal_id = p_goal_id and l.viewer_id = auth.uid()
  );
$$;
-- Policies run with the caller's privileges, so signed-in users need EXECUTE.
revoke execute on function private.is_shared_with_me(uuid) from public, anon;
grant execute on function private.is_shared_with_me(uuid) to authenticated;

drop policy "shared goals select" on public.goal_templates;
drop policy "shared completions select" on public.goal_completions;
drop policy "shared history select" on public.goal_history;
drop policy "shared day details select" on public.goal_day_details;

create policy "shared goals select" on public.goal_templates for select to authenticated
  using (private.is_shared_with_me(id));
create policy "shared completions select" on public.goal_completions for select to authenticated
  using (private.is_shared_with_me(goal_id));
create policy "shared history select" on public.goal_history for select to authenticated
  using (private.is_shared_with_me(goal_id));
create policy "shared day details select" on public.goal_day_details for select to authenticated
  using (private.is_shared_with_me(goal_id));

drop function public.is_shared_with_me(uuid);

notify pgrst, 'reload schema';
commit;
