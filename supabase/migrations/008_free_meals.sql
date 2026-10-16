-- Aplicar após 007_goal_period_and_adherence.sql e antes de publicar o app.
-- Apenas adiciona colunas. Metas existentes começam sem refeições livres
-- até que o usuário configure seu limite. Refeições anteriores não são reclassificadas.
begin;

alter table public.goal_templates
  add column free_meals_per_week integer not null default 0
    check (free_meals_per_week between 0 and 84);

alter table public.goal_history
  add column free_meals_per_week integer not null default 0
    check (free_meals_per_week between 0 and 84);

notify pgrst, 'reload schema';
commit;
