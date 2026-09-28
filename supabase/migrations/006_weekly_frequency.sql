-- Execute depois de 005_generic_checklists.sql e antes do merge desta versão.
-- Todas as metas existentes continuam com dias fixos e preservam seus registros.
alter table public.goal_templates
  add column goal_mode text not null default 'fixed'
    check (goal_mode in ('fixed', 'weekly')),
  add column weekly_target integer not null default 1
    check (weekly_target between 1 and 7),
  add constraint goal_templates_weekly_category_check
    check (goal_mode <> 'weekly' or category <> 'alimentacao');

alter table public.goal_history
  add column goal_mode text not null default 'fixed'
    check (goal_mode in ('fixed', 'weekly')),
  add column weekly_target integer not null default 1
    check (weekly_target between 1 and 7),
  add constraint goal_history_weekly_category_check
    check (goal_mode <> 'weekly' or category <> 'alimentacao');

notify pgrst, 'reload schema';
