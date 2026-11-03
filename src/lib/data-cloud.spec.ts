import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultMealOptions, type Goal } from '../types'
import type { BackupRecord } from './report'

type ApiError = { message: string; code?: string } | null
const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  // Simulates the project's "Max rows" setting on the Data API.
  maxRows: 1000,
  read: vi.fn<
    (
      table: string,
      from: number,
      to: number,
    ) => Promise<{ data: unknown[] | null; error: ApiError; count: number | null }>
  >(),
  insert: vi.fn<(table: string, rows: unknown) => Promise<{ error: ApiError }>>(),
  upsert: vi.fn<
    (table: string, rows: unknown, options: unknown) => Promise<{ error: ApiError }>
  >(),
  rpc: vi.fn<(name: string, args: unknown) => Promise<{ error: ApiError }>>(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-b' } } }, error: null }),
    },
    rpc: (name: string, args: unknown) => mocks.rpc(name, args),
    from: (table: string) => ({
      select: () => {
        const builder = {
          order: () => builder,
          range: (from: number, to: number) => mocks.read(table, from, to),
        }
        return builder
      },
      insert: (rows: unknown) => mocks.insert(table, rows),
      upsert: (rows: unknown, options: unknown) => mocks.upsert(table, rows, options),
    }),
  }),
}))

async function cloudData() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-public-key')
  return import('./data')
}

beforeEach(() => {
  mocks.tables = {}
  mocks.maxRows = 1000
  mocks.read.mockReset().mockImplementation(async (table, from, to) => {
    const rows = mocks.tables[table] || []
    const size = Math.min(to - from + 1, mocks.maxRows)
    return { data: rows.slice(from, from + size), error: null, count: rows.length }
  })
  mocks.insert.mockReset().mockResolvedValue({ error: null })
  mocks.upsert.mockReset().mockResolvedValue({ error: null })
  mocks.rpc.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

it('retries cloud startup reads when one table rejects a freshly issued JWT', async () => {
  vi.useFakeTimers()
  let goalReads = 0
  mocks.read.mockImplementation(async (table) =>
    table === 'goal_templates' && ++goalReads === 1
      ? { data: null, error: { message: 'JWT issued at future' }, count: null }
      : { data: [], error: null, count: 0 },
  )
  const { loadData } = await cloudData()
  const result = loadData()
  await vi.advanceTimersByTimeAsync(500)
  expect(await result).toEqual({ goals: [], completions: [], history: [], dayDetails: [] })
  expect(goalReads).toBe(2)
  expect(mocks.read).toHaveBeenCalledTimes(8)
})

describe('loading large accounts', () => {
  it('reads every page instead of stopping at the server row limit', async () => {
    mocks.maxRows = 300
    mocks.tables.goal_completions = Array.from({ length: 2500 }, (_, index) => ({
      id: `c${index}`,
    }))
    const { loadData } = await cloudData()
    const data = await loadData()
    expect(data.completions).toHaveLength(2500)
    expect(new Set(data.completions.map((entry) => entry.id)).size).toBe(2500)
    expect(mocks.read.mock.calls.filter(([table]) => table === 'goal_completions')).toHaveLength(9)
  })

  it('stops when rows disappear between pages', async () => {
    let calls = 0
    mocks.read.mockImplementation(async (table) =>
      table === 'goal_day_details' && ++calls === 1
        ? { data: [{ goal_id: 'g' }], error: null, count: 5 }
        : { data: [], error: null, count: 5 },
    )
    const { loadData } = await cloudData()
    expect((await loadData()).dayDetails).toHaveLength(1)
  })
})

describe('atomic writes', () => {
  const detail = {
    goal_id: 'goal',
    local_date: '2026-11-03',
    meals: {},
    meal_options: defaultMealOptions,
    checklist_options: [{ id: 'a', label: ' Aquecer ' }],
    checklist: { a: { checked: true, description: '' } },
    note: ' ok ',
  }

  it('saves a whole day in one database call', async () => {
    const { saveDay } = await cloudData()
    await saveDay('2026-11-03', [{ detail, completed: true }])
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('save_day', {
      p_local_date: '2026-11-03',
      p_details: [
        expect.objectContaining({
          goal_id: 'goal',
          note: 'ok',
          checklist_options: [{ id: 'a', label: 'Aquecer' }],
        }),
      ],
      p_completions: [{ goal_id: 'goal', completed: true }],
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('falls back to separate writes while migration 010 is not applied', async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: 'PGRST202', message: 'Could not find the function public.save_day' },
    })
    const { saveDay } = await cloudData()
    await saveDay('2026-11-03', [{ detail, completed: true }])
    expect(mocks.upsert.mock.calls.map(([table]) => table)).toEqual([
      'goal_day_details',
      'goal_completions',
    ])
  })

  it('surfaces other database errors instead of falling back', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '23514', message: 'violates check' } })
    const { saveDay } = await cloudData()
    await expect(saveDay('2026-11-03', [{ detail }])).rejects.toThrow('violates check')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('updates a goal and its history through one function call', async () => {
    const { updateGoal } = await cloudData()
    const input = {
      title: 'Treino',
      category: 'treino' as const,
      scheduled_weekdays: [1],
      goal_mode: 'fixed' as const,
      weekly_target: 1,
      start_date: null,
      duration_days: null,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [],
      checklist_options_by_weekday: {},
    }
    await updateGoal('goal', input)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'update_goal_with_history',
      expect.objectContaining({ p_goal_id: 'goal', p_input: input }),
    )
  })
})

describe('restoring a backup from another account', () => {
  const originalId = '11111111-1111-4111-8111-111111111111'
  const record: BackupRecord = {
    version: 1,
    goal: {
      id: originalId,
      user_id: '',
      title: 'Academia',
      category: 'treino',
      scheduled_weekdays: [1],
      goal_mode: 'fixed',
      weekly_target: 1,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [],
      checklist_options_by_weekday: {},
      created_at: '2026-09-01T12:00:00.000Z',
    } as Goal,
    history: [],
    completions: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        goal_id: originalId,
        user_id: '',
        local_date: '2026-09-07',
        completed_at: '2026-09-07T20:00:00.000Z',
      },
    ],
    dayDetails: [],
  }

  it('gives the goal a stable new id when the original belongs to another account', async () => {
    mocks.insert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    const { importGoalBackup, scopedGoalId } = await cloudData()
    const newId = scopedGoalId('user-b', originalId)
    expect(await importGoalBackup([record])).toMatchObject({ goals: 1, completions: 1 })
    expect(mocks.insert.mock.calls[1]?.[1]).toMatchObject({ id: newId, user_id: 'user-b' })
    expect(mocks.upsert).toHaveBeenCalledWith(
      'goal_completions',
      [expect.objectContaining({ goal_id: newId, user_id: 'user-b' })],
      { onConflict: 'goal_id,local_date', ignoreDuplicates: true },
    )

    // A second import finds the remapped goal and adds nothing.
    mocks.tables.goal_templates = [{ ...record.goal, id: newId }]
    mocks.tables.goal_completions = [{ goal_id: newId, local_date: '2026-09-07' }]
    mocks.insert.mockClear()
    mocks.upsert.mockClear()
    expect(await importGoalBackup([record])).toEqual({
      goals: 0,
      history: 0,
      dayDetails: 0,
      completions: 0,
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('creates valid, deterministic UUIDs per account', async () => {
    const { scopedGoalId } = await cloudData()
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(scopedGoalId('user-b', originalId)).toMatch(uuid)
    expect(scopedGoalId('user-b', originalId)).toBe(scopedGoalId('user-b', originalId))
    expect(scopedGoalId('user-c', originalId)).not.toBe(scopedGoalId('user-b', originalId))
  })
})
