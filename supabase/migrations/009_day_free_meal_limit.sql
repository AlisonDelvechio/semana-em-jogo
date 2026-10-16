-- Aplicar após 008_free_meals.sql e antes de publicar o app.
-- NULL mantém a regra histórica. Um valor é usado apenas após uma correção
-- explícita no registro da data. Nenhum registro existente é reclassificado.
begin;
alter table public.goal_day_details
  add column free_meals_limit_override integer
    check (free_meals_limit_override between 0 and 84);
notify pgrst, 'reload schema';
commit;
