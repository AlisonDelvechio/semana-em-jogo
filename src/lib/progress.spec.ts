import { describe, expect, it } from 'vitest'
import { goalProgress, isGoalDone, weekPace, weekStats } from './dates'
import { monthStats } from './month'
import type { Goal, GoalDayDetail } from '../types'

const goal: Goal = {
  id: 'food',
  user_id: 'u',
  title: 'Dieta',
  category: 'alimentacao',
  active: true,
  scheduled_weekdays: [1, 2],
  start_date: '2026-10-12',
  duration_days: 2,
  points: 10,
  free_meals_per_week: 1,
  meal_options: [{ id: 'lunch', label: 'Almoço' }],
  meal_options_by_weekday: {},
  created_at: '2026-10-01T12:00:00Z',
}
function detail(day: string, statuses: (boolean | 'free' | null)[]): GoalDayDetail {
  return {
    goal_id: goal.id,
    user_id: 'u',
    local_date: day,
    note: 'Mantido',
    adherence_recorded: true,
    meal_options: statuses.map((_, i) => ({ id: `m${i}`, label: `Refeição ${i + 1}` })),
    meals: Object.fromEntries(
      statuses.map((adherent, i) => [`m${i}`, { checked: true, description: '', adherent }]),
    ),
  }
}
const monday = new Date(2026, 9, 12)
const tuesday = new Date(2026, 9, 13)
describe('meal-based percentage', () => {
  it.each([
    [[true, true, true, true, false], 80],
    [[true, true, true, false, false], 60],
    [[true, true, true, true, 'free'], 100],
    [[true, true, true, 'free', 'free'], 80],
  ] as const)('counts allowed meals proportionally: %j', (statuses, expected) => {
    const saved = detail('2026-10-12', [...statuses])
    expect(goalProgress(goal, saved.local_date, [], [saved]) * 100).toBe(expected)
    expect(isGoalDone(goal, saved.local_date, [], [saved])).toBe(expected === 100)
  })
  it('pools meals across days with different counts', () => {
    const details = [detail('2026-10-12', [true, true, true, true]), detail('2026-10-13', [false])]
    expect(weekStats([goal], [], monday, [], details)).toMatchObject({
      percent: 80,

      completed: 1,
    })
    expect(weekPace([goal], [], monday, tuesday, [], details).percent).toBe(80)
    expect(monthStats([goal], [], [], details, monday, tuesday).percent).toBe(80)
    expect(weekPace([goal], [], monday, monday, [], details).percent).toBe(100)
  })
  it('counts pending meals and supports an old completion without meal details', () => {
    const saved = detail('2026-10-12', [true, null])
    saved.meals.m1!.checked = false
    expect(goalProgress(goal, saved.local_date, [], [saved])).toBe(0.5)
    expect(
      goalProgress(goal, saved.local_date, [
        { id: 'c', user_id: 'u', goal_id: goal.id, local_date: saved.local_date, completed_at: '' },
      ]),
    ).toBe(1)
    expect(goalProgress(goal, saved.local_date, [])).toBe(0)
  })
})
