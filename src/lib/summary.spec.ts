import { describe, expect, it } from 'vitest'
import type { Goal, GoalDayDetail, MealAdherence } from '../types'
import { careSummary, periodRange } from './summary'

const diet: Goal = {
  id: 'diet',
  user_id: 'patient',
  title: 'Dieta',
  category: 'alimentacao',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  goal_mode: 'fixed',
  weekly_target: 1,
  free_meals_per_week: 1,
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
  created_at: '2026-10-01T12:00:00Z',
}
const day = (
  date: string,
  almoco: MealAdherence,
  jantar: MealAdherence,
  jantarText = '',
): GoalDayDetail => ({
  goal_id: 'diet',
  user_id: 'patient',
  local_date: date,
  meal_options: diet.meal_options,
  adherence_recorded: true,
  note: `nota ${date}`,
  meals: {
    almoco: { checked: true, description: '', adherent: almoco },
    jantar: { checked: true, description: jantarText, adherent: jantar },
  },
})
// Week of 2 Nov 2026 (Mon) to 8 Nov; "today" is Wednesday 4 Nov.
const records = {
  goals: [diet],
  completions: [],
  history: [],
  dayDetails: [
    day('2026-11-02', true, false, 'Pizza'), // 1 of 2 valid; jantar off-plan
    day('2026-11-03', true, 'free', 'Hambúrguer'), // free within the limit (1/week)
    // 4 Nov: nothing recorded
    day('2026-10-27', true, true), // previous week: all valid
    day('2026-10-28', 'free', 'free'), // previous week: 2 free, limit 1 -> one excess
  ],
}
const today = new Date('2026-11-04T12:00:00')

describe('periodRange', () => {
  it('uses whole weeks for "last N weeks" and calendar months otherwise', () => {
    const weeks = periodRange('weeks4', today)
    expect([weeks.start.toDateString(), weeks.end.toDateString()]).toEqual([
      new Date('2026-10-12T12:00:00').toDateString(),
      new Date('2026-11-08T12:00:00').toDateString(),
    ])
    const previous = periodRange('previousMonth', today)
    expect(previous.start.getDate()).toBe(1)
    expect(previous.end.getMonth()).toBe(9)
    expect(previous.end.getDate()).toBe(31)
  })
})

describe('careSummary', () => {
  const start = new Date('2026-11-02T12:00:00')
  const end = new Date('2026-11-08T12:00:00')
  const summary = careSummary(records, start, end, today)

  it('measures adherence until today and compares with the previous period', () => {
    // 2 Nov: 1/2, 3 Nov: 2/2, 4 Nov: 0/2 -> 3 of 6.
    expect(summary.percent).toBe(50)
    // Previous week (only 27-28 Oct recorded, the rest pending): 27 Oct 2/2, 28 Oct 1/2
    // out of 7 days x 2 meals -> 3 of 14 = 21%.
    expect(summary.previous).toBe(21)
    expect(summary.delta).toBe(29)
    expect(summary.through).toBe('2026-11-04')
  })

  it('lists off-plan and over-limit meals with what was eaten', () => {
    expect(summary.offPlan).toEqual([
      {
        date: '2026-11-02',
        goalTitle: 'Dieta',
        meal: 'Jantar',
        kind: 'off',
        description: 'Pizza',
        note: 'nota 2026-11-02',
      },
    ])
    const lastWeek = careSummary(
      records,
      new Date('2026-10-26T12:00:00'),
      new Date('2026-11-01T12:00:00'),
      today,
    )
    expect(lastWeek.offPlan.map((meal) => [meal.date, meal.meal, meal.kind])).toEqual([
      ['2026-10-28', 'Jantar', 'free-excess'],
    ])
    expect(lastWeek.freeMeals).toEqual([
      { week: '2026-10-26', goalTitle: 'Dieta', used: 2, limit: 1 },
    ])
  })

  it('does not compare with a previous period that has no records', () => {
    const lastWeekOnly = careSummary(
      records,
      new Date('2026-10-26T12:00:00'),
      new Date('2026-11-01T12:00:00'),
      today,
    )
    expect(lastWeekOnly.percent).not.toBeNull()
    expect(lastWeekOnly.previous).toBeNull()
    expect(lastWeekOnly.delta).toBeNull()
  })

  it('ranks the meals that most often leave the plan', () => {
    expect(summary.meals.map((meal) => [meal.title, meal.offRate, meal.pending])).toEqual([
      ['Dieta · Jantar', 50, 1],
      ['Dieta · Almoço', 0, 1],
    ])
  })

  it('finds planned days with nothing recorded, never future days', () => {
    expect(summary.missingDays).toEqual(['2026-11-04'])
    expect(summary.weeks).toEqual([{ start: '2026-11-02', end: '2026-11-08', percent: 50 }])
  })
})
