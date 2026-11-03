import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TrackerApp from './TrackerApp.vue'
type TestSession = {
  access_token: string
  user: { id: string; email: string; user_metadata: object }
}
const mocks = vi.hoisted(() => ({
  load: vi.fn<() => Promise<unknown>>(),
  getSession: vi.fn<() => Promise<unknown>>(),
  subscribe: vi.fn<
    (callback: (event: string, next: TestSession | null) => void) => {
      data: { subscription: { unsubscribe: () => void } }
    }
  >(),
  unsubscribe: vi.fn<() => void>(),
}))
vi.mock('./lib/data', () => ({
  cloudEnabled: true,
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.subscribe } },
  loadData: mocks.load,
  createGoal: vi.fn<() => void>(),
  deleteGoal: vi.fn<() => void>(),
  importGoalBackup: vi.fn<() => void>(),
  saveDay: vi.fn<() => void>(),
  updateGoal: vi.fn<() => void>(),
}))
const session = {
  access_token: 'user-token',
  user: { id: 'u', email: 'user@example.test', user_metadata: {} },
}
let listener: (event: string, next: typeof session | null) => void
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  mocks.load.mockReset()
  mocks.unsubscribe.mockClear()
  mocks.subscribe.mockImplementation((callback: typeof listener) => {
    listener = callback
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('defers sign-in reads outside the auth callback and unsubscribes on unmount', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.load.mockResolvedValue({ goals: [], completions: [], history: [], dayDetails: [] })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    listener('SIGNED_IN', session)
    expect(mocks.load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(mocks.load).toHaveBeenCalledOnce()
    listener('INITIAL_SESSION', session)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.load).toHaveBeenCalledOnce()
  } finally {
    wrapper.unmount()
  }
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
})
it('ignores a late data response after sign-out', async () => {
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  let finish!: (result: unknown) => void
  mocks.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(mocks.load).toHaveBeenCalledOnce()
    listener('SIGNED_OUT', null)
    finish({
      goals: [{ id: 'private', title: 'Private old goal' }],
      completions: [],
      history: [],
      dayDetails: [],
    })
    await flushPromises()
    expect(wrapper.find('.auth-card').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Private old goal')
    expect(wrapper.find('.app-notice').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
it('clears visible data immediately when an auth event replaces the user', async () => {
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  mocks.load.mockResolvedValue({
    goals: [
      {
        id: 'a',
        user_id: 'u',
        title: 'Private old goal',
        category: 'outro',
        scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        created_at: '2026-01-01T12:00:00',
        meal_options: [],
        meal_options_by_weekday: {},
      },
    ],
    completions: [],
    history: [],
    dayDetails: [],
  })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.text()).toContain('Private old goal')
    listener('SIGNED_IN', {
      ...session,
      access_token: 'different-user-token',
      user: { ...session.user, id: 'other-user' },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Private old goal')
  } finally {
    wrapper.unmount()
  }
})
