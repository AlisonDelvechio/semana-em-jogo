import { describe, expect, it } from 'vitest'
import { localKey, mondayOf, weekStats } from './dates'
import type { Goal } from '../types'

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
})
