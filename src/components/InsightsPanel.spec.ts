import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InsightsPanel from './InsightsPanel.vue'
import TodayCard from './TodayCard.vue'
import { localKey } from '../lib/dates'
import type { Goal, GoalDayDetail, Completion } from '../types'
const goal: Goal = {
  id: 'food',
  user_id: 'u',
  title: 'Dieta',
  category: 'alimentacao',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  points: 10,
  active: true,
  meal_options: [
    { id: 'lunch', label: 'Almoço' },
    { id: 'dinner', label: 'Jantar' },
  ],
  meal_options_by_weekday: {},
  created_at: '2026-10-01T12:00:00',
}
afterEach(() => vi.useRealTimers())
it('changes analysis period, opens a real record date and refreshes after editing', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 16, 12))
  const detail: GoalDayDetail = {
    goal_id: goal.id,
    user_id: 'u',
    local_date: '2026-10-13',
    meal_options: goal.meal_options,
    meals: { lunch: { checked: true, adherent: false, description: '' } },
    adherence_recorded: true,
    note: 'Aniversário',
  }
  const wrapper = mount(InsightsPanel, {
    global: { stubs: { Teleport: true } },
    props: {
      goals: [goal],
      completions: [],
      history: [],
      dayDetails: [detail],
      monday: new Date(2026, 9, 12),
      month: new Date(2026, 9, 1),
    },
  })
  try {
    expect(wrapper.get('.goal-progress-item').text()).toContain('0 de 10 refeições contabilizadas')
    await wrapper.findAll('.pattern-row .text-button')[0]!.trigger('click')
    const record = wrapper
      .findAll('.pattern-record')
      .find((row) => row.text().includes('13/10/2026'))!
    expect(record.text()).toContain('Aniversário')
    expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe(
      'pattern-records-title',
    )
    await record.get('button').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(localKey(wrapper.emitted('openDay')![0]![0] as Date)).toBe('2026-10-13')
    await wrapper.setProps({
      dayDetails: [
        { ...detail, meals: { lunch: { checked: true, adherent: true, description: '' } } },
      ],
    })
    expect(wrapper.get('.goal-progress-item').text()).toContain('1 de 10 refeições contabilizadas')
    await wrapper.findAll('.insights-period button')[1]!.trigger('click')
    expect(wrapper.find('.pattern-records').exists()).toBe(false)
    expect(wrapper.get('.goal-progress-item').text()).toContain('1 de 32 refeições contabilizadas')
  } finally {
    wrapper.unmount()
  }
})
it('summarizes today without treating completed weekly frequency as a daily pending activity', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 16, 12))
  const train: Goal = {
    ...goal,
    id: 'train',
    title: 'Academia',
    category: 'treino',
    goal_mode: 'weekly',
    weekly_target: 3,
  }
  const completions: Completion[] = [13, 15, 16].map((day) => ({
    id: String(day),
    goal_id: 'train',
    user_id: 'u',
    local_date: `2026-10-${day}`,
    completed_at: '',
  }))
  const detail: GoalDayDetail = {
    goal_id: goal.id,
    user_id: 'u',
    local_date: '2026-10-16',
    meal_options: goal.meal_options,
    meals: { lunch: { checked: true, adherent: true, description: '' } },
    adherence_recorded: true,
    note: '',
  }
  const wrapper = mount(TodayCard, {
    props: { goals: [goal, train], completions, history: [], dayDetails: [detail] },
  })
  try {
    expect(wrapper.text()).toContain('1/2 refeições contabilizadas')
    expect(wrapper.text()).toContain('Frequências semanais atingidas')
    expect(wrapper.text()).not.toContain('atividades do dia')
    await wrapper.get('button').trigger('click')
    expect(localKey(wrapper.emitted('openDay')![0]![0] as Date)).toBe('2026-10-16')
  } finally {
    wrapper.unmount()
  }
})
