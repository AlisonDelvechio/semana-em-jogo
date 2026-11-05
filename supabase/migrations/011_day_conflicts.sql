-- Aplicar após 010_atomic_writes.sql e antes de publicar o app atualizado.
-- Impede que um dispositivo sobrescreva, sem saber, um dia salvo por outro:
--   1. goal_day_details ganha updated_at, mantido por um gatilho em toda gravação;
--   2. save_day passa a conferir, para cada registro, se ele ainda é a versão que o
--      app abriu (campo expected_updated_at). Se outro dispositivo salvou depois,
--      nada é gravado e o app avisa.
-- Clientes antigos, que não enviam expected_updated_at, continuam gravando como antes.
-- Não altera nem apaga dados: registros existentes recebem a data desta migração.
begin;

alter table public.goal_day_details
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_goal_day_details()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists goal_day_details_touch on public.goal_day_details;
create trigger goal_day_details_touch
  before insert or update on public.goal_day_details
  for each row execute function public.touch_goal_day_details();

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
  v_current timestamptz;
begin
  if v_user is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_details, '[]'::jsonb)) loop
    -- Conflict check only when the client says which version it opened.
    if v_item ? 'expected_updated_at' then
      select updated_at into v_current
      from public.goal_day_details
      where goal_id = (v_item->>'goal_id')::uuid
        and local_date = p_local_date
        and user_id = v_user
      for update;
      if found and (
        v_item->>'expected_updated_at' is null
        or v_current is distinct from (v_item->>'expected_updated_at')::timestamptz
      ) then
        raise exception 'Este dia foi alterado em outro dispositivo depois que você o abriu. Feche e abra o dia de novo para ver a versão atual.'
          using errcode = '40001', hint = 'day_conflict';
      end if;
    end if;

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

revoke execute on function public.save_day(date, jsonb, jsonb) from public, anon;
grant execute on function public.save_day(date, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
