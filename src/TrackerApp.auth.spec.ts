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
  resetPassword: vi.fn<(email: string, options: unknown) => Promise<unknown>>(),
  updateUser: vi.fn<(attributes: unknown) => Promise<unknown>>(),
  signIn: vi.fn<(credentials: unknown) => Promise<unknown>>(),
  authRedirect: { recovery: false, error: '' },
  loadCare: vi.fn<() => Promise<unknown>>(),
  previewCareInvite: vi.fn<(token: string) => Promise<unknown>>(),
  acceptCareInvite: vi.fn<(token: string) => Promise<void>>(),
}))
vi.mock('./lib/data', () => ({
  cloudEnabled: true,
  get authRedirect() {
    return mocks.authRedirect
  },
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.subscribe,
      resetPasswordForEmail: mocks.resetPassword,
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signIn,
    },
  },
  loadData: mocks.load,
  loadCare: mocks.loadCare,
  previewCareInvite: mocks.previewCareInvite,
  acceptCareInvite: mocks.acceptCareInvite,
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
  mocks.resetPassword.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.updateUser.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.signIn.mockReset()
  mocks.authRedirect = { recovery: false, error: '' }
  mocks.loadCare.mockReset().mockResolvedValue({ sharing: [], following: [], invites: [] })
  mocks.previewCareInvite.mockReset()
  mocks.acceptCareInvite.mockReset().mockResolvedValue()
  sessionStorage.clear()
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

it('sends a recovery link without revealing whether the account exists', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    await wrapper.get('.auth-forgot').trigger('click')
    expect(wrapper.get('.auth-card h2').text()).toBe('Recuperar senha')
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    await wrapper.get('input[type="email"]').setValue('pessoa@exemplo.com')
    await wrapper.get('.auth-card').trigger('submit')
    await flushPromises()
    expect(mocks.resetPassword).toHaveBeenCalledWith('pessoa@exemplo.com', {
      redirectTo: `${window.location.origin}/`,
    })
    expect(wrapper.get('.inline-alert.info').text()).toContain('Se houver uma conta')
  } finally {
    wrapper.unmount()
  }
})

it('translates sign-in errors from Supabase', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.signIn.mockResolvedValue({ error: new Error('Invalid login credentials') })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    await wrapper.get('input[type="email"]').setValue('pessoa@exemplo.com')
    await wrapper.get('input[type="password"]').setValue('senha-errada')
    await wrapper.get('.auth-card').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.inline-alert').text()).toContain('Email ou senha incorretos.')
  } finally {
    wrapper.unmount()
  }
})

it('asks for a new password after the recovery link and then opens the app', async () => {
  mocks.authRedirect = { recovery: true, error: '' }
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  mocks.load.mockResolvedValue({ goals: [], completions: [], history: [], dayDetails: [] })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.get('.auth-card h2').text()).toBe('Criar nova senha')
    expect(wrapper.find('.dashboard').exists()).toBe(false)
    expect(wrapper.find('.mobile-nav').exists()).toBe(false)
    const [first, second] = wrapper.findAll('input[type="password"]')
    await first!.setValue('nova-senha')
    await second!.setValue('outra-senha')
    await wrapper.get('.auth-card').trigger('submit')
    expect(wrapper.get('.inline-alert').text()).toContain('não coincidem')
    expect(mocks.updateUser).not.toHaveBeenCalled()
    await second!.setValue('nova-senha')
    await wrapper.get('.auth-card').trigger('submit')
    await flushPromises()
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'nova-senha' })
    expect(wrapper.find('.dashboard').exists()).toBe(true)
    expect(wrapper.get('.app-notice').text()).toContain('Senha alterada')
  } finally {
    wrapper.unmount()
  }
})

it('also reacts to the PASSWORD_RECOVERY event from Supabase', async () => {
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  mocks.load.mockResolvedValue({ goals: [], completions: [], history: [], dayDetails: [] })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.find('.dashboard').exists()).toBe(true)
    listener('PASSWORD_RECOVERY', session)
    await flushPromises()
    expect(wrapper.get('.auth-card h2').text()).toBe('Criar nova senha')
    await wrapper
      .findAll('.auth-switch')
      .find((button) => button.text() === 'Agora não')!
      .trigger('click')
    expect(wrapper.find('.dashboard').exists()).toBe(true)
  } finally {
    wrapper.unmount()
  }
})

it('explains an expired recovery link', async () => {
  mocks.authRedirect = { recovery: false, error: 'Email link is invalid or has expired' }
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.get('.inline-alert').text()).toContain('O link expirou ou já foi usado')
  } finally {
    wrapper.unmount()
  }
})

it('asks before accepting a sharing invite and then opens the patients screen', async () => {
  window.history.replaceState(null, '', '/?convite=token-abc')
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  mocks.load.mockResolvedValue({ goals: [], completions: [], history: [], dayDetails: [] })
  mocks.previewCareInvite.mockResolvedValue({
    owner_name: 'paciente@exemplo.com',
    goal_titles: ['Dieta'],
    expires_at: '2026-11-20T00:00:00Z',
  })
  const following = {
    id: 'link',
    owner_id: 'patient',
    viewer_id: 'u',
    owner_name: 'paciente@exemplo.com',
    viewer_name: 'user@example.test',
    created_at: '2026-11-09T12:00:00Z',
    goalIds: ['diet'],
  }
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    // The token leaves the address bar right away.
    expect(window.location.search).toBe('')
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.text()).toContain('paciente@exemplo.com quer compartilhar com você: Dieta')
    expect(mocks.acceptCareInvite).not.toHaveBeenCalled()
    mocks.loadCare.mockResolvedValue({ sharing: [], following: [following], invites: [] })
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect(mocks.acceptCareInvite).toHaveBeenCalledWith('token-abc')
    expect(wrapper.get('.sidebar .nav-button.selected').text()).toContain('Pacientes')
    expect(wrapper.get('.app-notice').text()).toContain('Agora você acompanha paciente@exemplo.com')
  } finally {
    wrapper.unmount()
  }
})

it('keeps the invite through sign-in and explains why', async () => {
  window.history.replaceState(null, '', '/?convite=token-xyz')
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.get('.inline-alert.info').text()).toContain('aceitar o convite')
    expect(sessionStorage.getItem('semana-em-jogo-convite')).toBe('token-xyz')
    expect(mocks.previewCareInvite).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})

it('shows only Pacientes to someone who follows people and has no goals', async () => {
  const following = {
    id: 'link',
    owner_id: 'patient',
    viewer_id: 'u',
    owner_name: 'paciente@exemplo.com',
    viewer_name: 'user@example.test',
    created_at: '2026-11-09T12:00:00Z',
    goalIds: ['diet'],
  }
  localStorage.removeItem('semana-em-jogo-metas-proprias')
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  mocks.load.mockResolvedValue({ goals: [], completions: [], history: [], dayDetails: [] })
  mocks.loadCare.mockResolvedValue({ sharing: [], following: [following], invites: [] })
  const wrapper = mount(TrackerApp)
  try {
    await flushPromises()
    expect(wrapper.findAll('.sidebar .nav-button').map((button) => button.text())).toEqual([
      'Pacientes',
    ])
    expect(wrapper.find('.mobile-nav').exists()).toBe(false)
    await wrapper.get('.own-goals-link').trigger('click')
    expect(wrapper.findAll('.sidebar .nav-button')).toHaveLength(4)
    expect(localStorage.getItem('semana-em-jogo-metas-proprias')).toBe('1')
  } finally {
    wrapper.unmount()
    localStorage.removeItem('semana-em-jogo-metas-proprias')
  }
})
