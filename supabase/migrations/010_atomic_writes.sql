-- Aplicar após 009_day_free_meal_limit.sql e antes de publicar o app.
-- Cria duas funções que gravam em uma única transação:
--   update_goal_with_history: snapshot do plano anterior + alteração da meta;
--   save_day: todos os registros e conclusões de uma data.
-- Não altera tabelas nem dados existentes. As funções rodam com os privilégios
-- de quem chama (security invoker), então as políticas RLS continuam valendo.
-- Se o app for publicado antes desta migração, ele volta a gravar etapa por etapa.
begin;

create or replace function public.update_goal_with_history(
  p_goal_id uuid,
  p_input jsonb,
  p_today date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_goal public.goal_templates;
begin
  if v_user is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;

  select * into v_goal
  from public.goal_templates
  where id = p_goal_id and user_id = v_user
  for update;
  if not found then
    raise exception 'Meta não encontrada.' using errcode = 'P0002';
  end if;

  -- Várias edições no mesmo dia preservam apenas o primeiro plano do dia.
  insert into public.goal_history (
    goal_id, user_id, valid_until, title, category, scheduled_weekdays, points, active,
    meal_options, meal_options_by_weekday, checklist_options, checklist_options_by_weekday,
    goal_mode, weekly_target, start_date, duration_days, free_meals_per_week
  ) values (
    v_goal.id, v_goal.user_id, p_today, v_goal.title, v_goal.category,
    v_goal.scheduled_weekdays, v_goal.points, v_goal.active,
    v_goal.meal_options, v_goal.meal_options_by_weekday,
    v_goal.checklist_options, v_goal.checklist_options_by_weekday,
    v_goal.goal_mode, v_goal.weekly_target, v_goal.start_date, v_goal.duration_days,
    v_goal.free_meals_per_week
  )
  on conflict (goal_id, valid_until) do nothing;

  update public.goal_templates set
    title = p_input->>'title',
    category = p_input->>'category',
    scheduled_weekdays = array(
      select jsonb_array_elements_text(p_input->'scheduled_weekdays')::integer
    ),
    points = (p_input->>'points')::integer,
    active = (p_input->>'active')::boolean,
    meal_options = p_input->'meal_options',
    meal_options_by_weekday = coalesce(p_input->'meal_options_by_weekday', '{}'::jsonb),
    checklist_options = coalesce(p_input->'checklist_options', '[]'::jsonb),
    checklist_options_by_weekday = coalesce(p_input->'checklist_options_by_weekday', '{}'::jsonb),
    goal_mode = coalesce(p_input->>'goal_mode', 'fixed'),
    weekly_target = coalesce((p_input->>'weekly_target')::integer, 1),
    start_date = (p_input->>'start_date')::date,
    duration_days = (p_input->>'duration_days')::integer,
    free_meals_per_week = coalesce((p_input->>'free_meals_per_week')::integer, 0)
  where id = p_goal_id and user_id = v_user;
end;
$$;

create or replace function public.save_day(
  p_local_date date,
  p_details jsonb,
  p_completions jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
begin
  if v_user is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_details, '[]'::jsonb)) loop
    insert into public.goal_day_details (
      goal_id, user_id, local_date, meals, meal_options, checklist, checklist_options,
      adherence_recorded, free_meals_limit_override, note
    ) values (
      (v_item->>'goal_id')::uuid, v_user, p_local_date,
      coalesce(v_item->'meals', '{}'::jsonb),
      v_item->'meal_options',
      coalesce(v_item->'checklist', '{}'::jsonb),
      coalesce(v_item->'checklist_options', '[]'::jsonb),
      coalesce((v_item->>'adherence_recorded')::boolean, false),
      (v_item->>'free_meals_limit_override')::integer,
      coalesce(v_item->>'note', '')
    )
    on conflict (goal_id, local_date) do update set
      meals = excluded.meals,
      meal_options = excluded.meal_options,
      checklist = excluded.checklist,
      checklist_options = excluded.checklist_options,
      adherence_recorded = excluded.adherence_recorded,
      free_meals_limit_override = excluded.free_meals_limit_override,
      note = excluded.note;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_completions, '[]'::jsonb)) loop
    if (v_item->>'completed')::boolean then
      insert into public.goal_completions (goal_id, user_id, local_date)
      values ((v_item->>'goal_id')::uuid, v_user, p_local_date)
      on conflict (goal_id, local_date) do nothing;
    else
      delete from public.goal_completions
      where goal_id = (v_item->>'goal_id')::uuid
        and local_date = p_local_date
        and user_id = v_user;
    end if;
  end loop;
end;
$$;

revoke execute on function public.update_goal_with_history(uuid, jsonb, date) from public, anon;
revoke execute on function public.save_day(date, jsonb, jsonb) from public, anon;
grant execute on function public.update_goal_with_history(uuid, jsonb, date) to authenticated;
grant execute on function public.save_day(date, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
