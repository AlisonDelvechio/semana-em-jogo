import { describe, expect, it } from 'vitest'
import { defaultMealOptions, type Completion, type Goal, type GoalHistory } from '../types'
import { weekPace, weekStats } from './dates'
import { monthStats } from './month'
import { createGoalReport } from './report'

const goal: Goal = {
  id: 'gym',
  user_id: 'u',
  title: 'Academia',
  category: 'treino',
  goal_mode: 'weekly',
  weekly_target: 3,
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  points: 30,
  active: true,
  created_at: '2026-09-01T12:00:00Z',
  meal_options: defaultMealOptions,
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
}
const visit = (date: string): Completion => ({
  id: date,
  user_id: 'u',
  goal_id: goal.id,
  local_date: date,
  completed_at: '',
})

describe('flexible weekly frequency', () => {
  const monday = new Date(2026, 8, 21)
  it('counts any three different dates, caps progress and grants points only once', () => {
    expect(weekStats([goal], [visit('2026-09-21')], monday)).toMatchObject({
      total: 3,
      completed: 1,
      percent: 33,
      points: 0,
    })
    const visits = ['2026-09-21', '2026-09-24', '2026-09-26', '2026-09-27'].map(visit)
    expect(weekStats([goal], visits, monday)).toMatchObject({
      total: 3,
      completed: 3,
      percent: 100,
      points: 30,
    })
    expect(weekPace([goal], visits, monday, new Date(2026, 8, 24))).toMatchObject({
      total: 3,
      completed: 2,
      percent: 67,
    })
  })

  it('keeps a prior fixed-day week after the goal switches to weekly mode', () => {
    const history: GoalHistory[] = [
      {
        ...goal,
        goal_id: goal.id,
        valid_until: '2026-09-28',
        goal_mode: 'fixed',
        scheduled_weekdays: [1, 3],
      },
    ]
    expect(weekStats([goal], [visit('2026-09-21')], monday, history)).toMatchObject({
      total: 2,
      completed: 1,
      points: 30,
    })
    expect(weekStats([goal], [visit('2026-09-28')], new Date(2026, 8, 28), history)).toMatchObject({
      total: 3,
      completed: 1,
      points: 0,
    })
  })

  it('does not recalculate an old weekly target after editing or pausing the goal', () => {
    const changed = { ...goal, weekly_target: 4, active: false }
    const history: GoalHistory[] = [{ ...goal, goal_id: goal.id, valid_until: '2026-09-28' }]
    expect(
      weekStats([changed], ['2026-09-21', '2026-09-24', '2026-09-26'].map(visit), monday, history),
    ).toMatchObject({
      total: 3,
      completed: 3,
      points: 30,
    })
  })

  it('assigns weekly progress to the month in which Monday falls', () => {
    const visits = ['2026-09-21', '2026-09-24', '2026-09-26'].map(visit)
    const month = monthStats([goal], visits, [], [], new Date(2026, 8, 1), new Date(2026, 8, 26))
    expect(month.total).toBe(12)
    expect(month.completed).toBe(3)
    expect(month.dueTotal).toBe(9)
  })

  it('exports weekly points only on the third visit, even with more visits', () => {
    const csv = createGoalReport(
      [goal],
      [visit('2026-09-21'), visit('2026-09-24'), visit('2026-09-26'), visit('2026-09-27')],
      [],
      [],
      new Date(2026, 8, 27),
    )
    const rows = csv.split('\r\n').filter((row) => row.includes('"Academia"'))
    expect(rows.filter((row) => row.includes(';"30";"30";'))).toHaveLength(1)
  })
})
