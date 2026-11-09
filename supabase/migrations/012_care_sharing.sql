-- Aplicar após 011_day_conflicts.sql.
-- Compartilhamento somente leitura com um profissional (por exemplo, nutricionista):
--   * o paciente cria um convite de uso único, válido por 7 dias, escolhendo as metas;
--   * quem aceita o convite passa a LER essas metas e seus registros;
--   * o paciente pode mudar as metas compartilhadas ou revogar o acesso a qualquer momento;
--   * gravar, editar e apagar continua exclusivo do dono: nenhuma política de escrita muda.
-- Não altera nem apaga dados existentes.
begin;

-- One row per patient -> professional pair. Names are e-mail snapshots taken when the
-- invite is accepted, because auth.users is not readable from the client.
create table public.care_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '' check (length(owner_name) <= 320),
  viewer_name text not null default '' check (length(viewer_name) <= 320),
  created_at timestamptz not null default now(),
  unique (owner_id, viewer_id),
  unique (id, owner_id),
  check (owner_id <> viewer_id)
);
create index care_links_viewer_idx on public.care_links(viewer_id);

-- Which goals each link shares. Deleting the goal or the link removes the row.
create table public.care_link_goals (
  link_id uuid not null,
  goal_id uuid not null,
  owner_id uuid not null,
  primary key (link_id, goal_id),
  foreign key (link_id, owner_id) references public.care_links(id, owner_id) on delete cascade,
  foreign key (goal_id, owner_id) references public.goal_templates(id, user_id) on delete cascade
);
create index care_link_goals_goal_idx on public.care_link_goals(goal_id);

-- Single-use invitations. Only a SHA-256 hash of the token is stored.
create table public.care_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  goal_ids uuid[] not null check (cardinality(goal_ids) between 1 and 50),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index care_invites_owner_idx on public.care_invites(owner_id);

alter table public.care_links enable row level security;
alter table public.care_link_goals enable row level security;
alter table public.care_invites enable row level security;

-- Both sides see the link and either side can end it. Links are only created by
-- accept_care_invite, so there is no insert or update policy.
create policy "care links select" on public.care_links for select to authenticated
  using ((select auth.uid()) in (owner_id, viewer_id));
create policy "care links delete" on public.care_links for delete to authenticated
  using ((select auth.uid()) in (owner_id, viewer_id));

-- The owner chooses the shared goals; the professional can see the list.
create policy "care goals select" on public.care_link_goals for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1 from public.care_links l
      where l.id = link_id and l.viewer_id = (select auth.uid())
    )
  );
create policy "care goals insert" on public.care_link_goals for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "care goals delete" on public.care_link_goals for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "care invites select" on public.care_invites for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "care invites delete" on public.care_invites for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Supabase grants every privilege on new tables to its API roles by default; RLS would
-- still block the rest, but keep the grants to exactly what the app uses.
revoke all on public.care_links, public.care_link_goals, public.care_invites
  from anon, authenticated;
grant select, delete on public.care_links to authenticated;
grant select, insert, delete on public.care_link_goals to authenticated;
grant select, delete on public.care_invites to authenticated;

-- True when the current user was given read access to this goal.
create or replace function public.is_shared_with_me(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_link_goals g
    join public.care_links l on l.id = g.link_id
    where g.goal_id = p_goal_id and l.viewer_id = auth.uid()
  );
$$;
revoke execute on function public.is_shared_with_me(uuid) from public, anon;
grant execute on function public.is_shared_with_me(uuid) to authenticated;

-- Read-only access for the professional. These SELECT policies are added to the
-- owner's policies (Postgres combines them with OR); write policies are unchanged.
create policy "shared goals select" on public.goal_templates for select to authenticated
  using (public.is_shared_with_me(id));
create policy "shared completions select" on public.goal_completions for select to authenticated
  using (public.is_shared_with_me(goal_id));
create policy "shared history select" on public.goal_history for select to authenticated
  using (public.is_shared_with_me(goal_id));
create policy "shared day details select" on public.goal_day_details for select to authenticated
  using (public.is_shared_with_me(goal_id));

-- Creates an invite for some of the caller's own goals and returns the token once.
-- security definer: users cannot write care_invites directly; ownership of every goal
-- is checked below against auth.uid().
create or replace function public.create_care_invite(p_goal_ids uuid[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_user is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = '28000';
  end if;
  if coalesce(cardinality(p_goal_ids), 0) = 0 then
    raise exception 'Escolha pelo menos uma meta para compartilhar.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_goal_ids) as requested(goal_id)
    where not exists (
      select 1 from public.goal_templates t where t.id = requested.goal_id and t.user_id = v_user
    )
  ) then
    raise exception 'Meta não encontrada.' using errcode = 'P0002';
  end if;
  insert into public.care_invites (owner_id, token_hash, goal_ids, expires_at)
  values (
    v_user,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    (select array_agg(distinct g) from unnest(p_goal_ids) as g),
    now() + interval '7 days'
  );
  return v_token;
end;
$$;

-- Shows who sent an invite and which goals it shares, before accepting it.
create or replace function public.preview_care_invite(p_token text)
returns table (owner_name text, goal_titles text[], expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.care_invites;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para ver o convite.' using errcode = '28000';
  end if;
  select * into v_invite from public.care_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found or v_invite.expires_at < now() then
    raise exception 'Convite inválido ou expirado. Peça um novo convite.' using errcode = 'P0002';
  end if;
  return query
    select
      coalesce((select u.email from auth.users u where u.id = v_invite.owner_id), '')::text,
      array(
        select t.title from public.goal_templates t
        where t.id = any (v_invite.goal_ids) and t.user_id = v_invite.owner_id
        order by t.created_at
      ),
      v_invite.expires_at;
end;
$$;

-- Accepts an invite: creates (or updates) the link and shares the chosen goals.
create or replace function public.accept_care_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.care_invites;
  v_link uuid;
begin
  if v_user is null then
    raise exception 'Entre na sua conta para aceitar o convite.' using errcode = '28000';
  end if;
  select * into v_invite from public.care_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if not found or v_invite.expires_at < now() then
    raise exception 'Convite inválido ou expirado. Peça um novo convite.' using errcode = 'P0002';
  end if;
  if v_invite.owner_id = v_user then
    raise exception 'Este convite é seu. Envie o link para quem vai acompanhar você.'
      using errcode = '22023';
  end if;

  insert into public.care_links (owner_id, viewer_id, owner_name, viewer_name)
  values (
    v_invite.owner_id,
    v_user,
    coalesce((select u.email from auth.users u where u.id = v_invite.owner_id), ''),
    coalesce((select u.email from auth.users u where u.id = v_user), '')
  )
  on conflict (owner_id, viewer_id) do update set viewer_name = excluded.viewer_name
  returning id into v_link;

  insert into public.care_link_goals (link_id, goal_id, owner_id)
  select v_link, t.id, t.user_id
  from public.goal_templates t
  where t.id = any (v_invite.goal_ids) and t.user_id = v_invite.owner_id
  on conflict do nothing;

  -- Single use.
  delete from public.care_invites where id = v_invite.id;
  return v_link;
end;
$$;

revoke execute on function public.create_care_invite(uuid[]) from public, anon;
revoke execute on function public.preview_care_invite(text) from public, anon;
revoke execute on function public.accept_care_invite(text) from public, anon;
grant execute on function public.create_care_invite(uuid[]) to authenticated;
grant execute on function public.preview_care_invite(text) to authenticated;
grant execute on function public.accept_care_invite(text) to authenticated;

notify pgrst, 'reload schema';
commit;
