-- Apply after 001_initial.sql. Existing goals keep their current plan as the
-- baseline; previous edits cannot be reconstructed retroactively.
create table public.goal_history (
  goal_id uuid not null,
  user_id uuid not null,
  valid_until date not null,
  title text not null,
  category text not null check (category in ('alimentacao', 'treino', 'outro')),
  scheduled_weekdays integer[] not null,
  points integer not null,
  active boolean not null,
  primary key (goal_id, valid_until),
  foreign key (goal_id, user_id) references public.goal_templates(id, user_id) on delete cascade
);

create index goal_history_user_id_idx on public.goal_history(user_id);
alter table public.goal_history enable row level security;

create policy "own goal history select" on public.goal_history for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own goal history insert" on public.goal_history for insert to authenticated
  with check ((select auth.uid()) = user_id);
