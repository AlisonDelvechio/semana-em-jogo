import { describe, expect, it } from 'vitest'
import { calendarDays, localKey, mealOptionsForDate, mondayOf, weekPace, weekStats } from './dates'
import { defaultMealOptions, type Goal, type GoalDayDetail, type GoalHistory } from '../types'

describe('weekly calculations', () => {
  it('starts weeks on Monday across year boundaries', () => {
    expect(localKey(mondayOf(new Date(2027, 0, 1)))).toBe('2026-12-28')
  })
  it('builds a full monthly calendar including adjacent days', () => {
    const days = calendarDays(new Date(2026, 8, 1)).map(localKey)
    expect(days).toHaveLength(35)
    expect(days[0]).toBe('2026-08-31')
    expect(days.at(-1)).toBe('2026-10-04')
    expect(days).toContain('2026-09-26')
  })
  it('returns zero percent when no goals are scheduled', () => {
    expect(weekStats([], [], new Date(2026, 8, 21))).toEqual({
      total: 0,
      completed: 0,
      percent: 0,
      points: 0,
    })
  })
  it('counts only scheduled completions for the selected week', () => {
    const goal: Goal = {
      id: 'g',
      user_id: 'u',
      title: 'Treino',
      category: 'treino',
      scheduled_weekdays: [1, 3],
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      created_at: '2026-09-01T12:00:00Z',
    }
    expect(
      weekStats(
        [goal],
        [{ id: 'c', user_id: 'u', goal_id: 'g', local_date: '2026-09-21', completed_at: '' }],
        new Date(2026, 8, 21),
      ),
    ).toEqual({ total: 2, completed: 1, percent: 50, points: 10 })
  })
  it('preserves past schedules and points after editing and pausing a goal', () => {
    const goal: Goal = {
      id: 'g',
      user_id: 'u',
      title: 'Novo treino',
      category: 'treino',
      scheduled_weekdays: [5],
      points: 20,
      active: false,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      created_at: '2026-09-01T12:00:00Z',
    }
    const history: GoalHistory[] = [
      {
        goal_id: 'g',
        user_id: 'u',
        valid_until: '2026-09-26',
        title: 'Treino',
        category: 'treino',
        scheduled_weekdays: [1, 3],
        points: 10,
        active: true,
        meal_options: defaultMealOptions,
        meal_options_by_weekday: {},
      },
    ]
    const completion = [
      {
        id: 'c',
        user_id: 'u',
        goal_id: 'g',
        local_date: '2026-09-21',
        completed_at: '',
      },
    ]
    expect(weekStats([goal], completion, new Date(2026, 8, 21), history)).toEqual({
      total: 2,
      completed: 1,
      percent: 50,
      points: 10,
    })
    expect(weekStats([goal], completion, new Date(2026, 8, 28), history)).toEqual({
      total: 0,
      completed: 0,
      percent: 0,
      points: 0,
    })
  })
  it('selects the version active on each day across successive edits', () => {
    const goal: Goal = {
      id: 'g',
      user_id: 'u',
      title: 'Atual',
      category: 'treino',
      scheduled_weekdays: [1],
      points: 30,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      created_at: '2026-09-01T12:00:00Z',
    }
    const history: GoalHistory[] = [
      {
        goal_id: 'g',
        user_id: 'u',
        valid_until: '2026-09-23',
        title: 'Inicial',
        category: 'treino',
        scheduled_weekdays: [1],
        points: 10,
        active: true,
        meal_options: defaultMealOptions,
        meal_options_by_weekday: {},
      },
      {
        goal_id: 'g',
        user_id: 'u',
        valid_until: '2026-09-25',
        title: 'Editada',
        category: 'treino',
        scheduled_weekdays: [3],
        points: 20,
        active: true,
        meal_options: defaultMealOptions,
        meal_options_by_weekday: {},
      },
    ]
    const completions = [
      { id: 'c1', user_id: 'u', goal_id: 'g', local_date: '2026-09-21', completed_at: '' },
      { id: 'c2', user_id: 'u', goal_id: 'g', local_date: '2026-09-23', completed_at: '' },
    ]
    expect(weekStats([goal], completions, new Date(2026, 8, 21), history)).toEqual({
      total: 2,
      completed: 2,
      percent: 100,
      points: 30,
    })
  })
  it('shows 100% through Saturday while Sunday is still upcoming', () => {
    const goal: Goal = {
      id: 'food',
      user_id: 'u',
      title: 'Dieta',
      category: 'alimentacao',
      scheduled_weekdays: [6, 0],
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      created_at: '2026-09-01T12:00:00Z',
    }
    const completions = [
      { id: 'old', user_id: 'u', goal_id: 'food', local_date: '2026-09-26', completed_at: '' },
    ]
    const monday = new Date(2026, 8, 21)
    expect(weekPace([goal], completions, monday, new Date(2026, 8, 26))).toEqual({
      total: 1,
      completed: 1,
      percent: 100,
      upcoming: 1,
    })
    expect(weekStats([goal], completions, monday).percent).toBe(50)

    const details: GoalDayDetail[] = [
      {
        goal_id: 'food',
        user_id: 'u',
        local_date: '2026-09-26',
        note: '',
        meal_options: defaultMealOptions.filter(({ id }) => id !== 'cafe'),
        meals: {
          almoco: { checked: true, description: 'Arroz' },
          lanche: { checked: true, description: '' },
          jantar: { checked: false, description: '' },
        },
      },
    ]
    expect(weekPace([goal], completions, monday, new Date(2026, 8, 26), [], details).percent).toBe(
      0,
    )
    details[0]!.meals.jantar!.checked = true
    expect(weekPace([goal], completions, monday, new Date(2026, 8, 26), [], details).percent).toBe(
      100,
    )
  })
  it('uses the saved meal choices for each date after editing the goal defaults', () => {
    const goal: Goal = {
      id: 'food',
      user_id: 'u',
      title: 'Dieta',
      category: 'alimentacao',
      scheduled_weekdays: [6, 0],
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      created_at: '2026-09-01T12:00:00Z',
    }
    const oldOptions = defaultMealOptions.filter(({ id }) => id !== 'cafe')
    const details: GoalDayDetail[] = [
      {
        goal_id: 'food',
        user_id: 'u',
        local_date: '2026-09-26',
        note: '',
        meal_options: oldOptions,
        meals: Object.fromEntries(
          oldOptions.map(({ id }) => [id, { checked: true, description: '' }]),
        ),
      },
      {
        goal_id: 'food',
        user_id: 'u',
        local_date: '2026-09-27',
        note: '',
        meal_options: [
          { id: 'cafe', label: 'Café da manhã' },
          { id: 'ceia', label: 'Ceia' },
        ],
        meals: {
          cafe: { checked: true, description: '' },
          ceia: { checked: false, description: '' },
        },
      },
    ]
    expect(weekStats([goal], [], new Date(2026, 8, 21), [], details)).toEqual({
      total: 2,
      completed: 1,
      percent: 50,
      points: 10,
    })
    details[1]!.meals.ceia!.checked = true
    expect(weekStats([goal], [], new Date(2026, 8, 21), [], details).percent).toBe(100)
  })
  it('uses weekday choices for new day records', () => {
    const goal: Goal = {
      id: 'food',
      user_id: 'u',
      title: 'Dieta',
      category: 'alimentacao',
      scheduled_weekdays: [1, 6],
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {
        '6': [
          { id: 'almoco', label: 'Almoço' },
          { id: 'ceia', label: 'Ceia' },
        ],
      },
      created_at: '2026-09-01T12:00:00Z',
    }
    expect(mealOptionsForDate(goal, new Date(2026, 8, 26)).map(({ id }) => id)).toEqual([
      'almoco',
      'ceia',
    ])
    expect(mealOptionsForDate(goal, new Date(2026, 8, 21)).map(({ id }) => id)).toEqual([
      'cafe',
      'almoco',
      'lanche',
      'jantar',
    ])
  })
})
