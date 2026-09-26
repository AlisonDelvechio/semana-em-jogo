create extension if not exists pgcrypto;

create table public.goal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  category text not null check (category in ('alimentacao', 'treino', 'outro')),
  scheduled_weekdays integer[] not null check (array_length(scheduled_weekdays, 1) between 1 and 7 and scheduled_weekdays <@ array[0,1,2,3,4,5,6]),
  points integer not null check (points between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goal_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  local_date date not null,
  completed_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goal_templates(id, user_id) on delete cascade,
  unique (goal_id, local_date)
);

create index goal_templates_user_id_idx on public.goal_templates(user_id);
create index goal_completions_user_date_idx on public.goal_completions(user_id, local_date);

alter table public.goal_templates enable row level security;
alter table public.goal_completions enable row level security;

create policy "own goals select" on public.goal_templates for select to authenticated using ((select auth.uid()) = user_id);
create policy "own goals insert" on public.goal_templates for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own goals update" on public.goal_templates for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own goals delete" on public.goal_templates for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own completions select" on public.goal_completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own completions insert" on public.goal_completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own completions update" on public.goal_completions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own completions delete" on public.goal_completions for delete to authenticated using ((select auth.uid()) = user_id);
