import { beforeEach, describe, expect, it } from 'vitest'
import type { Goal, GoalDayDetail, MealAdherence } from '../types'
import { goalProgressCounts, isGoalDone } from './dates'
import { createGoal, loadData, saveDay } from './data'
import { goalToInput } from './goals'
import { parseGoalBackup } from './backup'
import { periodInsights } from './insights'
import { createGoalReport } from './report'

const day = '2026-11-09'
const goal: Goal = {
  id: 'b8620e36-e80a-43e3-bb57-4bd7e3d97741',
  user_id: 'local',
  title: 'Dieta',
  category: 'alimentacao',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  goal_mode: 'fixed',
  weekly_target: 1,
  free_meals_per_week: 0,
  start_date: null,
  duration_days: null,
  points: 10,
  active: true,
  meal_options: [
    { id: 'almoco', label: 'Almoço' },
    { id: 'lanche', label: 'Lanche da tarde', optional: true },
    { id: 'jantar', label: 'Jantar' },
  ],
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
  created_at: '2026-11-01T12:00:00Z',
}
const record = (meals: Record<string, MealAdherence | undefined>): GoalDayDetail => ({
  goal_id: goal.id,
  user_id: 'local',
  local_date: day,
  meal_options: goal.meal_options,
  adherence_recorded: true,
  note: '',
  meals: Object.fromEntries(
    goal.meal_options.map(({ id }) => [
      id,
      { checked: meals[id] !== undefined, description: '', adherent: meals[id] ?? null },
    ]),
  ),
})

describe('optional meals', () => {
  it('leave the day complete and out of the percentage when not recorded', () => {
    const detail = record({ almoco: true, jantar: true })
    expect(isGoalDone(goal, day, [], [detail])).toBe(true)
    expect(goalProgressCounts(goal, day, [], [detail])).toEqual({ total: 2, completed: 2 })
  })

  it('count like any other meal once recorded', () => {
    const offPlan = record({ almoco: true, lanche: false, jantar: true })
    expect(isGoalDone(goal, day, [], [offPlan])).toBe(false)
    expect(goalProgressCounts(goal, day, [], [offPlan])).toEqual({ total: 3, completed: 2 })
    const onPlan = record({ almoco: true, lanche: true, jantar: true })
    expect(goalProgressCounts(goal, day, [], [onPlan])).toEqual({ total: 3, completed: 3 })
  })

  it('never replace required meals: a missing lunch is still pending', () => {
    const detail = record({ jantar: true })
    expect(isGoalDone(goal, day, [], [detail])).toBe(false)
    expect(goalProgressCounts(goal, day, [], [detail])).toEqual({ total: 2, completed: 1 })
    // A day with nothing recorded expects only the required meals.
    expect(goalProgressCounts(goal, day, [], [])).toEqual({ total: 2, completed: 0 })
  })

  it('are not listed as pending in the meal patterns', () => {
    const date = new Date(`${day}T12:00:00`)
    const insights = periodInsights(
      [goal],
      [],
      [],
      [record({ almoco: true, jantar: true })],
      date,
      date,
      date,
    )
    const titles = insights.patterns.map((pattern) => pattern.title)
    expect(titles).toContain('Dieta · Almoço')
    expect(titles).not.toContain('Dieta · Lanche da tarde')
  })

  it('appear as "not done (optional)" in the report and survive a backup', () => {
    const csv = createGoalReport(
      [goal],
      [],
      [],
      [record({ almoco: true, jantar: true })],
      new Date(`${day}T12:00:00`),
      { from: day, to: day },
    )
    expect(csv).toContain('"Lanche da tarde (opcional)";"Não";"Não realizada (opcional)"')
    const restored = parseGoalBackup(csv)[0]!
    expect(restored.goal.meal_options[1]).toEqual({
      id: 'lanche',
      label: 'Lanche da tarde',
      optional: true,
    })
    expect(restored.dayDetails[0]!.meal_options[1]!.optional).toBe(true)
  })
})

describe('saving optional meals', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the flag on the goal and on the day record', async () => {
    const saved = await createGoal(goalToInput(goal))
    await saveDay(day, [
      {
        detail: {
          goal_id: saved.id,
          local_date: day,
          meal_options: goal.meal_options,
          meals: {},
          adherence_recorded: true,
          note: '',
        },
      },
    ])
    const data = await loadData()
    expect(data.goals[0]!.meal_options[1]!.optional).toBe(true)
    expect(data.dayDetails[0]!.meal_options[1]!.optional).toBe(true)
    // Required meals are stored without the flag.
    expect('optional' in data.dayDetails[0]!.meal_options[0]!).toBe(false)
  })
})
