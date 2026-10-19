import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  read: vi.fn<
    (table: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
  >(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const result = mocks.read(table)
        return Object.assign(result, { order: () => result })
      },
    }),
  }),
}))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
it('retries cloud startup reads when one table rejects a freshly issued JWT', async () => {
  vi.useFakeTimers()
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-public-key')
  let goalReads = 0
  mocks.read.mockImplementation(async (table) =>
    table === 'goal_templates' && ++goalReads === 1
      ? { data: null, error: { message: 'JWT issued at future' } }
      : { data: [], error: null },
  )
  const { loadData } = await import('./data')
  const result = loadData()
  await vi.advanceTimersByTimeAsync(500)
  expect(await result).toEqual({ goals: [], completions: [], history: [], dayDetails: [] })
  expect(goalReads).toBe(2)
  expect(mocks.read).toHaveBeenCalledTimes(8)
})
