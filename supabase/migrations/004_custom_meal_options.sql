-- Execute após 003_goal_day_details.sql e antes de publicar esta versão.
-- Metas atuais recebem as quatro opções; registros antigos mantêm as três originais.
alter table public.goal_templates
  add column meal_options jsonb not null default '[{"id":"cafe","label":"Café da manhã"},{"id":"almoco","label":"Almoço"},{"id":"lanche","label":"Lanche da tarde"},{"id":"jantar","label":"Jantar"}]'::jsonb;

alter table public.goal_history
  add column meal_options jsonb not null default '[{"id":"almoco","label":"Almoço"},{"id":"lanche","label":"Lanche da tarde"},{"id":"jantar","label":"Jantar"}]'::jsonb;

alter table public.goal_templates
  add column meal_options_by_weekday jsonb not null default '{}'::jsonb;
alter table public.goal_history
  add column meal_options_by_weekday jsonb not null default '{}'::jsonb;

alter table public.goal_day_details
  add column meal_options jsonb not null default '[{"id":"almoco","label":"Almoço"},{"id":"lanche","label":"Lanche da tarde"},{"id":"jantar","label":"Jantar"}]'::jsonb;

alter table public.goal_templates add constraint goal_templates_meal_options_check
  check (jsonb_typeof(meal_options) = 'array' and jsonb_array_length(meal_options) between 1 and 12);
alter table public.goal_history add constraint goal_history_meal_options_check
  check (jsonb_typeof(meal_options) = 'array' and jsonb_array_length(meal_options) between 1 and 12);
alter table public.goal_day_details add constraint goal_day_details_meal_options_check
  check (jsonb_typeof(meal_options) = 'array' and jsonb_array_length(meal_options) between 1 and 12);
alter table public.goal_templates add constraint goal_templates_weekday_meals_check
  check (jsonb_typeof(meal_options_by_weekday) = 'object');
alter table public.goal_history add constraint goal_history_weekday_meals_check
  check (jsonb_typeof(meal_options_by_weekday) = 'object');

notify pgrst, 'reload schema';
