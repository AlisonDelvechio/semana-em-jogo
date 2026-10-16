import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TrackerApp from './TrackerApp.vue'
import { createGoal, loadData } from './lib/data'
import { goalForDate, isGoalDone } from './lib/dates'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('lets a past day use the current limit only after explicitly applying and saving it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-16T12:00:00'))
  const input = {
    title: 'Minha dieta',
    category: 'alimentacao' as const,
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed' as const,
    weekly_target: 1,
    free_meals_per_week: 2,
    start_date: null,
    duration_days: null,
    points: 10,
    active: true,
    meal_options: [{ id: 'almoco', label: 'Almoço' }],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
  }
  const goal = await createGoal(input)
  const data = JSON.parse(localStorage.getItem('semana-em-jogo-v1')!)
  data.goals[0].created_at = '2026-09-01T12:00:00Z'
  data.history = [
    {
      ...input,
      free_meals_per_week: 0,
      goal_id: goal.id,
      user_id: 'local',
      valid_until: '2026-10-16',
    },
  ]
  data.dayDetails = [
    {
      goal_id: goal.id,
      user_id: 'local',
      local_date: '2026-10-15',
      meal_options: input.meal_options,
      meals: { almoco: { checked: true, description: 'Livre planejada', adherent: 'free' } },
      adherence_recorded: true,
      note: '',
    },
  ]
  localStorage.setItem('semana-em-jogo-v1', JSON.stringify(data))
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    const openPastDay = async () => {
      await wrapper.get('[aria-label="Abrir registros de 15/10/2026"]').trigger('click')
      await wrapper.get('.day-limit-correction summary').trigger('click')
    }
    await openPastDay()
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 0 permitidas')
    await wrapper.get('.use-current-limit').trigger('click')
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 2 permitidas')
    expect((await loadData()).dayDetails[0]?.free_meals_limit_override).toBeUndefined()
    await wrapper.get('.day-dialog .dialog-close').trigger('click')
    await openPastDay()
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 0 permitidas')
    await wrapper.get('.use-current-limit').trigger('click')
    await wrapper.get('.day-dialog form').trigger('submit')
    await flushPromises()
    const saved = await loadData()
    expect(saved.dayDetails[0]?.free_meals_limit_override).toBe(2)
    expect(saved.history[0]?.free_meals_per_week).toBe(0)
    const historical = goalForDate(saved.goals[0]!, saved.history, new Date(2026, 9, 15))
    expect(isGoalDone(historical, '2026-10-15', [], saved.dayDetails)).toBe(true)
    await openPastDay()
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 2 permitidas')
  } finally {
    wrapper.unmount()
  }
})

it('edits the allowance and saves a compliant day with an optional free meal on mobile', async () => {
  await createGoal({
    title: 'Minha dieta',
    category: 'alimentacao',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    goal_mode: 'fixed',
    weekly_target: 1,
    free_meals_per_week: 2,
    start_date: null,
    duration_days: null,
    points: 10,
    active: true,
    meal_options: [
      { id: 'almoco', label: 'Almoço' },
      { id: 'jantar', label: 'Jantar' },
    ],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
  })
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    await wrapper.get('[aria-label="Editar Minha dieta"]').trigger('click')
    await wrapper.get('[aria-describedby="free-meal-help"]').setValue('1')
    await wrapper.get('.goal-form').trigger('submit')
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect((await loadData()).goals[0]?.free_meals_per_week).toBe(1)

    await wrapper.findAll('.mobile-nav button')[0]!.trigger('click')
    await wrapper.get('.day-edit-action').trigger('click')
    const meals = wrapper.findAll('.meal-row')
    for (const meal of meals) {
      await meal.get('input[type="checkbox"]').setValue(true)
      await meal.get('select').setValue('free')
    }
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('2 de 1 permitidas')
    expect(wrapper.findAll('.free-meal-warning')).toHaveLength(1)
    await meals[1]!.get('select').setValue('true')
    expect(wrapper.findAll('.free-meal-warning')).toHaveLength(0)
    expect(wrapper.get('.day-dialog .free-meal-summary').text()).toContain('1 de 1 permitidas')
    await wrapper.get('.day-dialog form').trigger('submit')
    await flushPromises()
    const data = await loadData()
    expect(data.dayDetails[0]?.meals.almoco?.adherent).toBe('free')
    expect(data.dayDetails[0]?.meals.jantar?.adherent).toBe(true)
    expect(isGoalDone(data.goals[0]!, data.dayDetails[0]!.local_date, [], data.dayDetails)).toBe(
      true,
    )
  } finally {
    wrapper.unmount()
  }
})

it('confirms deletion, supports Escape and restores focus without deleting on cancel', async () => {
  const goal = await createGoal({
    title: 'Academia',
    category: 'treino',
    scheduled_weekdays: [1],
    goal_mode: 'fixed',
    weekly_target: 3,
    points: 10,
    active: true,
    meal_options: [],
    meal_options_by_weekday: {},
    checklist_options: [],
    checklist_options_by_weekday: {},
    start_date: null,
    duration_days: null,
  })
  const wrapper = mount(TrackerApp, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.findAll('.mobile-nav button')[2]!.trigger('click')
    const trigger = wrapper.get('[aria-label="Excluir Academia"]')
    ;(trigger.element as HTMLButtonElement).focus()
    await trigger.trigger('click')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('não pode ser desfeita')
    expect(document.activeElement?.textContent).toBe('Cancelar')
    expect((await loadData()).goals[0]?.id).toBe(goal.id)
    await wrapper.get('[role="alertdialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect((await loadData()).goals).toHaveLength(1)
    await trigger.trigger('click')
    await wrapper.get('.confirmation-actions .primary-button').trigger('click')
    await flushPromises()
    expect((await loadData()).goals).toHaveLength(0)
    expect(wrapper.get('.app-notice').text()).toContain('Meta excluída')
    await wrapper.get('[aria-label="Fechar mensagem"]').trigger('click')
    expect(wrapper.find('.app-notice').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
