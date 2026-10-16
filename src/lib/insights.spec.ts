import { expect, it } from 'vitest'
import { periodInsights } from './insights'
import { monthStats } from './month'
import { weekPace } from './dates'
import type { Goal, GoalDayDetail, Completion, GoalHistory } from '../types'
const goal: Goal = {
  id: 'food',
  user_id: 'u',
  title: 'Dieta',
  category: 'alimentacao',
  active: true,
  points: 10,
  created_at: '2026-10-01T12:00:00',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  free_meals_per_week: 1,
  meal_options: [{ id: 'lunch', label: 'Almoço' }],
  meal_options_by_weekday: {},
}
const date = (day: number) => new Date(2026, 9, day, 12)
const detail = (day: number, adherent: boolean | 'free' | null, checked = true): GoalDayDetail => ({
  goal_id: goal.id,
  user_id: 'u',
  local_date: `2026-10-${day}`,
  meals: { lunch: { checked, adherent, description: '' } },
  meal_options: goal.meal_options,
  adherence_recorded: true,
  note: 'Uma anotação',
})
const completion = (goalId: string, day: number): Completion => ({
  id: `${goalId}-${day}`,
  user_id: 'u',
  goal_id: goalId,
  local_date: `2026-10-${day}`,
  completed_at: '',
})

it('separates compliant, outside, pending and unclassified meals without including future days', () => {
  const details = [
    detail(12, true),
    detail(13, false),
    detail(14, null),
    detail(15, true, false),
    detail(17, true),
  ]
  const result = periodInsights([goal], [], [], details, date(12), date(18), date(16))
  expect(result.patterns[0]).toMatchObject({ valid: 1, off: 1, unknown: 1, pending: 2, total: 5 })
  expect(result.progress[0]).toMatchObject({ completed: 1, total: 5, percent: 20 })
  expect(result.patterns[0]!.records.every((row) => row.date <= '2026-10-16')).toBe(true)
  expect(result.patterns[0]!.records[0]!.note).toBe('Uma anotação')
})
it('uses the whole week allowance even when the analysis starts after a free meal', () => {
  const details = [detail(12, 'free'), detail(13, 'free')]
  const result = periodInsights([goal], [], [], details, date(13), date(13), date(13))
  expect(result.patterns[0]).toMatchObject({ valid: 0, off: 1, total: 1 })
  expect(result.patterns[0]!.records[0]!.reason).toBe('Livre além do limite')
  expect(result.progress[0]!.completed).toBe(0)
  details[1]!.free_meals_limit_override = 2
  expect(
    periodInsights([goal], [], [], details, date(13), date(13), date(13)).patterns[0]!.valid,
  ).toBe(1)
})
it('preserves legacy progress while marking its adherence as unknown', () => {
  const saved = detail(13, false)
  saved.adherence_recorded = false
  const result = periodInsights(
    [goal],
    [completion(goal.id, 12)],
    [],
    [saved],
    date(12),
    date(13),
    date(13),
  )
  expect(result.progress[0]).toMatchObject({ completed: 2, total: 2, percent: 100 })
  expect(result.patterns[0]).toMatchObject({ valid: 0, off: 0, unknown: 2, total: 2 })
})
it('matches weekly and monthly progress for frequency goals and does not count daily failures', () => {
  const train: Goal = {
    ...goal,
    id: 'train',
    title: 'Academia',
    category: 'treino',
    goal_mode: 'weekly',
    weekly_target: 3,
  }
  const completions = [
    completion('train', 13),
    completion('train', 15),
    completion('train', 16),
    completion('train', 17),
  ]
  const result = periodInsights([train], completions, [], [], date(12), date(18), date(16))
  expect(result.progress[0]).toMatchObject({ mode: 'visits', completed: 3, total: 3, percent: 100 })
  expect(result.progress[0]!.percent).toBe(
    weekPace([train], completions, date(12), date(16)).percent,
  )
  const month = periodInsights([train], completions, [], [], date(1), date(31), date(16))
  expect(month.progress[0]!.percent).toBe(
    monthStats([train], completions, [], [], date(1), date(16)).percent,
  )
  expect(month.progress[0]!.total).toBe(6)
  expect(result.patterns).toHaveLength(0)
})
it('honors historical meal lists, dates and mode changes without merging unlike units', () => {
  const history: GoalHistory[] = [
    {
      ...goal,
      goal_id: goal.id,
      valid_until: '2026-10-13',
      meal_options: [{ id: 'old', label: 'Refeição anterior' }],
    },
  ]
  const result = periodInsights([goal], [], history, [], date(12), date(13), date(13))
  expect(result.patterns.map((row) => row.title)).toEqual([
    'Dieta · Refeição anterior',
    'Dieta · Almoço',
  ])
  const future = periodInsights([goal], [], [], [], date(17), date(18), date(16))
  expect(future.progress).toHaveLength(0)
  expect(future.patterns).toHaveLength(0)
})
