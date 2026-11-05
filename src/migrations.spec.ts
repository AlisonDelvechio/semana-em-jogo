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
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
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
    insert into auth.users values ('${user}');
    select set_config('test.uid', '${user}', false);
    insert into public.goal_templates (id, user_id, title, category, scheduled_weekdays, points)
    values ('${goal}', '${user}', 'Dieta', 'alimentacao', '{1}', 10);
  `)
}, 60_000)

it('applies every migration in order', () => {
  expect(Object.keys(migrations).length).toBeGreaterThanOrEqual(11)
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
