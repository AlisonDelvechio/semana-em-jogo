import { describe, expect, it } from 'vitest'
import { localKey, mondayOf, weekStats } from './dates'
import type { Goal, GoalHistory } from '../types'

describe('weekly calculations', () => {
  it('starts weeks on Monday across year boundaries', () => {
    expect(localKey(mondayOf(new Date(2027, 0, 1)))).toBe('2026-12-28')
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
      id: 'g', user_id: 'u', title: 'Novo treino', category: 'treino',
      scheduled_weekdays: [5], points: 20, active: false,
      created_at: '2026-09-01T12:00:00Z',
    }
    const history: GoalHistory[] = [{
      goal_id: 'g', user_id: 'u', valid_until: '2026-09-26', title: 'Treino',
      category: 'treino', scheduled_weekdays: [1, 3], points: 10, active: true,
    }]
    const completion = [{
      id: 'c', user_id: 'u', goal_id: 'g', local_date: '2026-09-21', completed_at: '',
    }]
    expect(weekStats([goal], completion, new Date(2026, 8, 21), history)).toEqual({
      total: 2, completed: 1, percent: 50, points: 10,
    })
    expect(weekStats([goal], completion, new Date(2026, 8, 28), history)).toEqual({
      total: 0, completed: 0, percent: 0, points: 0,
    })
  })
  it('selects the version active on each day across successive edits', () => {
    const goal: Goal = {
      id: 'g', user_id: 'u', title: 'Atual', category: 'treino',
      scheduled_weekdays: [1], points: 30, active: true,
      created_at: '2026-09-01T12:00:00Z',
    }
    const history: GoalHistory[] = [
      { goal_id: 'g', user_id: 'u', valid_until: '2026-09-23', title: 'Inicial',
        category: 'treino', scheduled_weekdays: [1], points: 10, active: true },
      { goal_id: 'g', user_id: 'u', valid_until: '2026-09-25', title: 'Editada',
        category: 'treino', scheduled_weekdays: [3], points: 20, active: true },
    ]
    const completions = [
      { id: 'c1', user_id: 'u', goal_id: 'g', local_date: '2026-09-21', completed_at: '' },
      { id: 'c2', user_id: 'u', goal_id: 'g', local_date: '2026-09-23', completed_at: '' },
    ]
    expect(weekStats([goal], completions, new Date(2026, 8, 21), history)).toEqual({
      total: 2, completed: 2, percent: 100, points: 30,
    })
  })
})
