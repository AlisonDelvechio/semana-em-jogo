-- Execute após 004_custom_meal_options.sql e antes de publicar o app atualizado.
-- Novos campos vazios preservam refeições, conclusões e observações existentes.
alter table public.goal_templates
  add column checklist_options jsonb not null default '[]'::jsonb,
  add column checklist_options_by_weekday jsonb not null default '{}'::jsonb;

alter table public.goal_history
  add column checklist_options jsonb not null default '[]'::jsonb,
  add column checklist_options_by_weekday jsonb not null default '{}'::jsonb;

alter table public.goal_day_details
  add column checklist_options jsonb not null default '[]'::jsonb,
  add column checklist jsonb not null default '{}'::jsonb;

alter table public.goal_templates add constraint goal_templates_checklist_options_check
  check (jsonb_typeof(checklist_options) = 'array' and jsonb_array_length(checklist_options) <= 12
    and jsonb_typeof(checklist_options_by_weekday) = 'object');
alter table public.goal_history add constraint goal_history_checklist_options_check
  check (jsonb_typeof(checklist_options) = 'array' and jsonb_array_length(checklist_options) <= 12
    and jsonb_typeof(checklist_options_by_weekday) = 'object');
alter table public.goal_day_details add constraint goal_day_details_checklist_options_check
  check (jsonb_typeof(checklist_options) = 'array' and jsonb_array_length(checklist_options) <= 12
    and jsonb_typeof(checklist) = 'object');

notify pgrst, 'reload schema';
