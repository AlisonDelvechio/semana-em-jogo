import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { CareLink, CareState } from './lib/data'
import { defaultMealOptions, type Goal } from './types'
import SharingPanel from './components/SharingPanel.vue'
import PatientsView from './views/PatientsView.vue'

const mocks = vi.hoisted(() => ({
  createCareInvite: vi.fn<(goalIds: string[]) => Promise<string>>(),
  setSharedGoal: vi.fn<(link: unknown, goalId: string, shared: boolean) => Promise<void>>(),
  removeCareLink: vi.fn<(id: string) => Promise<void>>(),
  cancelCareInvite: vi.fn<(id: string) => Promise<void>>(),
  loadData: vi.fn<(ownerId?: string) => Promise<unknown>>(),
}))
vi.mock('./lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/data')>()),
  ...mocks,
}))

const goal = (id: string, title: string, category: Goal['category']): Goal => ({
  id,
  user_id: 'patient',
  title,
  category,
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  goal_mode: 'fixed',
  weekly_target: 1,
  free_meals_per_week: 0,
  start_date: null,
  duration_days: null,
  points: 10,
  active: true,
  meal_options: defaultMealOptions,
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
  created_at: '2026-10-01T12:00:00Z',
})
const diet = goal('diet', 'Dieta', 'alimentacao')
const gym = goal('gym', 'Academia', 'treino')
const link: CareLink = {
  id: 'link-1',
  owner_id: 'patient',
  viewer_id: 'nutri',
  owner_name: 'paciente@exemplo.com',
  viewer_name: 'nutri@exemplo.com',
  created_at: '2026-11-01T12:00:00Z',
  goalIds: ['diet'],
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.createCareInvite.mockResolvedValue('token-123')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('patient side', () => {
  const mountPanel = (care: CareState, confirm = vi.fn<() => Promise<boolean>>()) =>
    mount(SharingPanel, { props: { goals: [diet, gym], care, confirm } })

  it('creates an invite for the chosen goals, food goals preselected', async () => {
    const wrapper = mountPanel({ sharing: [], following: [], invites: [] })
    const boxes = wrapper.findAll('.share-goal input')
    expect(boxes.map((box) => (box.element as HTMLInputElement).checked)).toEqual([true, false])
    await boxes[1]!.setValue(true)
    await wrapper.get('.sharing-panel .primary-button').trigger('click')
    await flushPromises()
    expect(mocks.createCareInvite).toHaveBeenCalledWith(['diet', 'gym'])
    expect((wrapper.get('.invite-link input').element as HTMLInputElement).value).toBe(
      `${window.location.origin}/?convite=token-123`,
    )
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('changes the goals a person sees and revokes access only after confirming', async () => {
    const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
    const wrapper = mountPanel({ sharing: [link], following: [], invites: [] }, confirm)
    const person = wrapper.get('.sharing-person')
    expect(person.text()).toContain('nutri@exemplo.com')
    await person.findAll('.share-goal input')[1]!.setValue(true)
    await flushPromises()
    expect(mocks.setSharedGoal).toHaveBeenCalledWith(link, 'gym', true)
    await person.get('.sharing-revoke').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(mocks.removeCareLink).not.toHaveBeenCalled()
    confirm.mockResolvedValue(true)
    await person.get('.sharing-revoke').trigger('click')
    await flushPromises()
    expect(mocks.removeCareLink).toHaveBeenCalledWith('link-1')
  })
})

describe('professional side', () => {
  it('shows the shared records read-only', async () => {
    const today = new Date()
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    mocks.loadData.mockResolvedValue({
      goals: [diet],
      completions: [],
      history: [],
      dayDetails: [
        {
          goal_id: 'diet',
          user_id: 'patient',
          local_date: day,
          meal_options: defaultMealOptions,
          adherence_recorded: true,
          note: 'Jantar fora',
          meals: { jantar: { checked: true, description: 'Pizza', adherent: false } },
        },
      ],
    })
    const wrapper = mount(PatientsView, {
      props: { following: [link], mobileWeek: false, confirm: vi.fn<() => Promise<boolean>>() },
      attachTo: document.body,
    })
    try {
      await flushPromises()
      // Only this patient's data is requested.
      expect(mocks.loadData).toHaveBeenCalledWith('patient')
      // A single patient opens straight on the simplified overview.
      expect(wrapper.get('.overview-heading h1').text()).toBe('paciente@exemplo.com')
      expect(wrapper.find('.overview-summary').exists()).toBe(true)
      expect(wrapper.findAll('.overview-month').length).toBe(3)
      expect(wrapper.find('.day-card').exists()).toBe(false)
      // Details: the usual week, read-only.
      await wrapper.get('.overview-actions .primary-button').trigger('click')
      expect(wrapper.get('.patients-back').text()).toContain('Visão geral')
      // No quick checks, no "Nova meta", and days open for viewing.
      expect(wrapper.find('.task-check').exists()).toBe(false)
      expect(wrapper.find('.heading-action').exists()).toBe(false)
      const viewDay = wrapper.get('.day-card.is-today .day-edit-action')
      expect(viewDay.text()).toBe('Ver dia')
      await viewDay.trigger('click')
      await flushPromises()
      const dialog = document.querySelector('.day-dialog')!
      expect(dialog.querySelector('.eyebrow')!.textContent).toBe('REGISTRO DO DIA')
      expect((dialog.querySelector('fieldset.day-goals') as HTMLFieldSetElement).disabled).toBe(
        true,
      )
      const fields = [...dialog.querySelectorAll('textarea')].map((field) => field.value)
      expect(fields).toEqual(['Pizza', 'Jantar fora'])
      // Instructions on how to edit are not shown to someone who can only read.
      expect(dialog.querySelector('.dialog-help')).toBeNull()
      expect(dialog.querySelector('[type="submit"]')).toBeNull()
      expect(dialog.querySelector('.day-goal-edit')).toBeNull()
      expect(
        [...dialog.querySelectorAll('.adherence-option[aria-pressed="true"]')].map((button) =>
          button.textContent?.trim(),
        ),
      ).toEqual(['Fora do plano'])
    } finally {
      wrapper.unmount()
    }
  })
})

describe('professional with several patients', () => {
  it('lists who needs attention first and opens each overview', async () => {
    const today = new Date()
    const key = (offset: number) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    const day = (owner: string, offset: number, dinner: boolean) => ({
      goal_id: `${owner}-diet`,
      user_id: owner,
      local_date: key(offset),
      meal_options: defaultMealOptions,
      adherence_recorded: true,
      note: '',
      meals: Object.fromEntries(
        defaultMealOptions.map(({ id }) => [
          id,
          { checked: true, description: '', adherent: id === 'jantar' ? dinner : true },
        ]),
      ),
    })
    const created = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString()
    const recordsOf = (owner: string, dinnerOff: boolean) => ({
      goals: [{ ...diet, id: `${owner}-diet`, user_id: owner, created_at: created }],
      completions: [],
      history: [],
      // Every day of the last 20, all recorded; one person often skips the plan at dinner.
      dayDetails: Array.from({ length: 20 }, (_, offset) =>
        day(owner, offset, !(dinnerOff && offset % 2 === 0)),
      ),
    })
    mocks.loadData.mockImplementation(async (owner) =>
      owner === 'calm' ? recordsOf('calm', false) : recordsOf('busy', true),
    )
    const links: CareLink[] = [
      { ...link, id: 'a', owner_id: 'calm', owner_name: 'calma@exemplo.com' },
      { ...link, id: 'b', owner_id: 'busy', owner_name: 'atencao@exemplo.com' },
    ]
    const wrapper = mount(PatientsView, {
      props: { following: links, mobileWeek: false, confirm: vi.fn<() => Promise<boolean>>() },
    })
    await flushPromises()
    const rows = wrapper.findAll('.patient-row')
    expect(rows.map((row) => row.get('.patient-row-main strong').text())).toEqual([
      'atencao@exemplo.com',
      'calma@exemplo.com',
    ])
    expect(rows[0]!.text()).toContain('Registrou hoje')
    expect(rows[0]!.text()).toMatch(/pontos? para conversar/)
    await rows[0]!.trigger('click')
    expect(wrapper.get('.overview-heading h1').text()).toBe('atencao@exemplo.com')
    expect(wrapper.get('.overview-talk').text()).toContain(
      'Jantar: é a refeição que mais sai do plano.',
    )
    await wrapper.get('.patients-back').trigger('click')
    expect(wrapper.findAll('.patient-row')).toHaveLength(2)
    wrapper.unmount()
  })
})
