import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthView from './MonthView.vue'
import { localKey } from '../lib/dates'
import type { Goal, GoalDayDetail } from '../types'

afterEach(() => vi.useRealTimers())

it('uses actual meal progress for calendar circles and edits the selected date', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-16T12:00:00'))
  const meals = [
    { id: 'lunch', label: 'Almoço' },
    { id: 'dinner', label: 'Jantar' },
  ]
  const goal: Goal = {
    id: 'food',
    user_id: 'local',
    title: 'Dieta',
    category: 'alimentacao',
    active: true,
    points: 10,
    created_at: '2026-10-01T12:00:00',
    goal_mode: 'fixed',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    meal_options: meals,
    meal_options_by_weekday: {},
  }
  const details: GoalDayDetail[] = [12, 13].map((date) => ({
    goal_id: goal.id,
    user_id: 'local',
    local_date: `2026-10-${date}`,
    meal_options: meals,
    meals: {
      lunch: { checked: true, description: '', adherent: true },
      dinner: { checked: true, description: '', adherent: date === 12 },
    },
    adherence_recorded: true,
    note: '',
  }))
  const wrapper = mount(MonthView, {
    props: { goals: [goal], completions: [], history: [], dayDetails: details },
  })
  try {
    const complete = wrapper.get('.calendar-day[aria-label^="segunda-feira, 12 de outubro"]')
    const partial = wrapper.get('.calendar-day[aria-label^="terça-feira, 13 de outubro"]')
    const pending = wrapper.get('.calendar-day[aria-label^="quarta-feira, 14 de outubro"]')
    expect(complete.find('.calendar-status.complete svg').exists()).toBe(true)
    expect(complete.attributes('aria-label')).toContain('100%')
    expect(partial.get('.calendar-status.partial').attributes('style')).toContain('50%')
    expect(partial.attributes('aria-label')).toContain('50%')
    expect(partial.get('.calendar-desktop-detail').text()).toContain('0/1 concluídas')
    expect(partial.get('.calendar-desktop-detail').text()).toContain('50%')
    expect(partial.get('.calendar-goal').text()).toBe('Dieta')
    expect(pending.find('.calendar-status.pending').exists()).toBe(true)
    expect(wrapper.get('.calendar-legend').text()).toContain('Concluído')
    await partial.trigger('click')
    expect(partial.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('#selected-day-title').text()).toContain('13 de outubro')
    expect(wrapper.get('.selected-day-card .task-title').text()).toContain(
      '1 de 2 refeições válidas',
    )
    expect(wrapper.emitted('openDay')).toBeUndefined()
    await wrapper.get('.selected-day-card .day-edit-action').trigger('click')
    expect(localKey(wrapper.emitted('openDay')![0]![0] as Date)).toBe('2026-10-13')
    await wrapper.get('[aria-label="Próximo mês"]').trigger('click')
    expect(wrapper.get('.calendar-header h2').text()).toBe('novembro de 2026')
    expect(wrapper.get('#selected-day-title').text()).toContain('1 de novembro')
    await wrapper.get('.calendar-nav .today-link').trigger('click')
    expect(wrapper.get('#selected-day-title').text()).toContain('16 de outubro')
  } finally {
    wrapper.unmount()
  }
})
