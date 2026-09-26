-- Execute depois de 002_goal_history.sql, antes de publicar o app atualizado.
create table public.goal_day_details (
  goal_id uuid not null,
  user_id uuid not null,
  local_date date not null,
  meals jsonb not null default '{}'::jsonb,
  note text not null default '' check (length(note) <= 500),
  primary key (goal_id, local_date),
  foreign key (goal_id, user_id) references public.goal_templates(id, user_id) on delete cascade
);

create index goal_day_details_user_date_idx on public.goal_day_details(user_id, local_date);
alter table public.goal_day_details enable row level security;

create policy "own day details select" on public.goal_day_details for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own day details insert" on public.goal_day_details for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own day details update" on public.goal_day_details for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Explicitly limit Data API grants to the actions used by the client.
revoke all on public.goal_day_details from anon;
grant select, insert, update on public.goal_day_details to authenticated;
notify pgrst, 'reload schema';
