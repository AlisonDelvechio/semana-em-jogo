import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TrackerApp from './TrackerApp.vue'
import { createGoal, loadData } from './lib/data'
import { isGoalDone } from './lib/dates'

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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
