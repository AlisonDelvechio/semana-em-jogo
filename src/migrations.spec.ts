// @vitest-environment node
// Runs every migration in supabase/migrations on a real Postgres (PGlite, WebAssembly)
// and checks the database rules the app relies on, starting with the day conflict check
// from 011. Supabase-specific pieces (auth schema, roles) are replaced by small stand-ins.
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const migrations = import.meta.glob<string>('../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const user = '00000000-0000-4000-8000-000000000001'
const goal = '00000000-0000-4000-8000-0000000000aa'
const day = '2026-11-05'
let db: PGlite

const detail = (extra: Record<string, unknown> = {}) =>
  JSON.stringify([
    {
      goal_id: goal,
      meals: {},
      meal_options: [{ id: 'almoco', label: 'Almoço' }],
      checklist: {},
      checklist_options: [],
      adherence_recorded: true,
      free_meals_limit_override: null,
      note: '',
      ...extra,
    },
  ])
const save = (details: string) =>
  db.query(`select public.save_day($1, $2::jsonb, '[]'::jsonb)`, [day, details])
const current = async () =>
  (
    await db.query<{ updated_at: string; note: string }>(
      `select updated_at::text, note from public.goal_day_details
       where goal_id = $1 and local_date = $2`,
      [goal, day],
    )
  ).rows[0]!

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    -- Supabase grants table access to its API roles by default; RLS then decides.
    grant usage on schema public, auth to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated, anon;
  `)
  for (const file of Object.keys(migrations).sort()) {
    // pgcrypto is only used for gen_random_uuid(), built into current Postgres;
    // NOTIFY targets PostgREST, which does not exist here.
    const sql = migrations[file]!.replace(
      /^create extension if not exists pgcrypto;$/m,
      '',
    ).replace(/^\s*notify pgrst.*$/m, '')
    await db.exec(sql)
  }
  await db.exec(`
    insert into auth.users values ('${user}', 'paciente@exemplo.com');
    select set_config('test.uid', '${user}', false);
    insert into public.goal_templates (id, user_id, title, category, scheduled_weekdays, points)
    values ('${goal}', '${user}', 'Dieta', 'alimentacao', '{1}', 10);
  `)
}, 60_000)

it('applies every migration in order', () => {
  expect(Object.keys(migrations).length).toBeGreaterThanOrEqual(13)
})

describe('save_day conflict check (011)', () => {
  it('lets each device save the version it opened and refuses stale saves', async () => {
    await save(detail({ expected_updated_at: null, note: 'A' }))
    const first = await current()
    await save(detail({ expected_updated_at: first.updated_at, note: 'A2' }))
    const second = await current()
    expect(second.updated_at).not.toBe(first.updated_at)

    // Another device still holding the first version, or one that never saw the record.
    await expect(
      save(detail({ expected_updated_at: first.updated_at, note: 'B' })),
    ).rejects.toThrow('alterado em outro dispositivo')
    await expect(save(detail({ expected_updated_at: null, note: 'B' }))).rejects.toThrow(
      'alterado em outro dispositivo',
    )
    expect((await current()).note).toBe('A2')
  })

  it('keeps old clients, which send no version, working', async () => {
    await save(detail({ note: 'cliente antigo' }))
    expect((await current()).note).toBe('cliente antigo')
  })

  it('refuses calls without a session', async () => {
    await db.exec(`select set_config('test.uid', '', false)`)
    await expect(save(detail())).rejects.toThrow('Sua sessão expirou')
    await db.exec(`select set_config('test.uid', '${user}', false)`)
  })
})

describe('read-only sharing with a professional (012)', () => {
  const nutri = '00000000-0000-4000-8000-000000000002'
  const stranger = '00000000-0000-4000-8000-000000000003'
  const training = '00000000-0000-4000-8000-0000000000bb'
  // Runs as the API role with RLS enforced, like a request from the app.
  async function as<T>(uid: string, run: () => Promise<T>): Promise<T> {
    await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`)
    try {
      return await run()
    } finally {
      await db.exec(`reset role; select set_config('test.uid', '${user}', false);`)
    }
  }
  const visibleGoals = (uid: string) =>
    as(uid, async () =>
      (
        await db.query<{ title: string }>('select title from public.goal_templates order by title')
      ).rows.map((row) => row.title),
    )
  const invite = (uid: string, goals: string[]) =>
    as(
      uid,
      async () =>
        (
          await db.query<{ token: string }>(
            'select public.create_care_invite($1::uuid[]) as token',
            [goals],
          )
        ).rows[0]!.token,
    )
  const accept = (uid: string, token: string) =>
    as(uid, () => db.query('select public.accept_care_invite($1)', [token]))

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users values ('${nutri}', 'nutri@exemplo.com'), ('${stranger}', 'outra@exemplo.com');
      insert into public.goal_templates (id, user_id, title, category, scheduled_weekdays, points)
      values ('${training}', '${user}', 'Academia', 'treino', '{1}', 10);
      insert into public.goal_completions (goal_id, user_id, local_date)
      values ('${training}', '${user}', '${day}');
    `)
  })

  it('shares only the chosen goals, after the invite is accepted', async () => {
    expect(await visibleGoals(user)).toEqual(['Academia', 'Dieta'])
    const token = await invite(user, [goal])
    expect(await visibleGoals(nutri)).toEqual([])

    const preview = await as(nutri, () =>
      db.query<{ owner_name: string; goal_titles: string[] }>(
        'select * from public.preview_care_invite($1)',
        [token],
      ),
    )
    expect(preview.rows[0]).toMatchObject({
      owner_name: 'paciente@exemplo.com',
      goal_titles: ['Dieta'],
    })
    await accept(nutri, token)
    expect(await visibleGoals(nutri)).toEqual(['Dieta'])
    // Records of the shared goal are visible; the training goal stays private.
    const details = await as(nutri, () => db.query('select goal_id from public.goal_day_details'))
    expect(details.rows.length).toBeGreaterThan(0)
    const completions = await as(nutri, () => db.query('select * from public.goal_completions'))
    expect(completions.rows).toHaveLength(0)
    // Nobody else sees anything.
    expect(await visibleGoals(stranger)).toEqual([])
  })

  it('never lets the professional change the patient data', async () => {
    const updated = await as(nutri, () =>
      db.query(`update public.goal_day_details set note = 'alterado' where goal_id = $1`, [goal]),
    )
    expect(updated.affectedRows).toBe(0)
    const removed = await as(nutri, () =>
      db.query('delete from public.goal_templates where id = $1', [goal]),
    )
    expect(removed.affectedRows).toBe(0)
    await expect(
      as(nutri, () =>
        db.query(
          `insert into public.goal_completions (goal_id, user_id, local_date) values ($1, $2, $3)`,
          [goal, user, '2026-11-06'],
        ),
      ),
    ).rejects.toThrow('row-level security')
    // The patient's own save function cannot be used on someone else's goal either.
    await expect(
      as(nutri, () =>
        db.query(`select public.save_day($1, $2::jsonb, '[]'::jsonb)`, [day, detail()]),
      ),
    ).rejects.toThrow(/row-level security|foreign key/)
    expect((await current()).note).not.toBe('alterado')
  })

  it('uses each invite once and only for the right people', async () => {
    const token = await invite(user, [goal])
    await expect(accept(user, token)).rejects.toThrow('Este convite é seu')
    await accept(stranger, token)
    await expect(accept(nutri, token)).rejects.toThrow('Convite inválido ou expirado')
    // Clean up: the patient removes the stranger.
    await as(user, () => db.query('delete from public.care_links where viewer_id = $1', [stranger]))
    expect(await visibleGoals(stranger)).toEqual([])
    // Expired invites are refused.
    const expired = await invite(user, [goal])
    await db.exec(`update public.care_invites set expires_at = now() - interval '1 minute'`)
    await expect(accept(nutri, expired)).rejects.toThrow('Convite inválido ou expirado')
  })

  it('only lets owners invite for and share their own goals', async () => {
    await expect(invite(nutri, [goal])).rejects.toThrow('Meta não encontrada')
    const link = await as(
      user,
      async () =>
        (
          await db.query<{ id: string }>('select id from public.care_links where viewer_id = $1', [
            nutri,
          ])
        ).rows[0]!.id,
    )
    await expect(
      as(stranger, () =>
        db.query(
          'insert into public.care_link_goals (link_id, goal_id, owner_id) values ($1, $2, $3)',
          [link, training, user],
        ),
      ),
    ).rejects.toThrow('row-level security')
    // The owner can add and remove goals from the link at any time.
    await as(user, () =>
      db.query(
        'insert into public.care_link_goals (link_id, goal_id, owner_id) values ($1, $2, $3)',
        [link, training, user],
      ),
    )
    expect(await visibleGoals(nutri)).toEqual(['Academia', 'Dieta'])
    await as(user, () =>
      db.query('delete from public.care_link_goals where link_id = $1 and goal_id = $2', [
        link,
        training,
      ]),
    )
    expect(await visibleGoals(nutri)).toEqual(['Dieta'])
  })

  it('keeps the policy helper out of the public API schema (013)', async () => {
    const found = await db.query<{ schema: string }>(
      `select n.nspname as schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'is_shared_with_me'`,
    )
    expect(found.rows.map((row) => row.schema)).toEqual(['private'])
  })

  it('ends all access when the link is revoked', async () => {
    await as(user, () => db.query('delete from public.care_links where viewer_id = $1', [nutri]))
    expect(await visibleGoals(nutri)).toEqual([])
    const left = await as(nutri, () => db.query('select * from public.care_link_goals'))
    expect(left.rows).toHaveLength(0)
  })
})
