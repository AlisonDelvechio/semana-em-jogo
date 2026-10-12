-- Aplicar após 006_weekly_frequency.sql e antes de publicar o app atualizado.
-- Apenas acrescenta campos; registros existentes permanecem inalterados.
alter table public.goal_templates
  add column start_date date,
  add column duration_days integer check (duration_days between 1 and 365),
  add constraint goal_templates_period_check
    check ((start_date is null) = (duration_days is null));

alter table public.goal_history
  add column start_date date,
  add column duration_days integer check (duration_days between 1 and 365),
  add constraint goal_history_period_check
    check ((start_date is null) = (duration_days is null));

alter table public.goal_day_details
  add column adherence_recorded boolean not null default false;

notify pgrst, 'reload schema';
