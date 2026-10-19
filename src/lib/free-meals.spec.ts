import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal, GoalDayDetail, GoalInput, MealAdherence } from '../types'
import { freeMealUsage, goalForDate, isGoalDone, isMealAllowed, weekStats } from './dates'
import { monthStats } from './month'
import { createGoal, importGoalBackup, loadData, saveDayDetail, updateGoal } from './data'
import { parseGoalBackup } from './backup'
import { createGoalReport } from './report'
afterEach(() => vi.useRealTimers())

const goal: Goal = {
  id: 'b8620e36-e80a-43e3-bb57-4bd7e3d97741',
  user_id: 'local',
  title: 'Dieta',
  category: 'alimentacao',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  goal_mode: 'fixed',
  weekly_target: 1,
  free_meals_per_week: 2,
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
  created_at: '2026-09-01T12:00:00Z',
}
const goalInput = (): GoalInput => ({
  title: goal.title,
  category: goal.category,
  scheduled_weekdays: goal.scheduled_weekdays,
  goal_mode: 'fixed',
  weekly_target: 1,
  free_meals_per_week: 2,
  start_date: null,
  duration_days: null,
  points: 10,
  active: true,
  meal_options: goal.meal_options,
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
})
const detail = (
  day: string,
  lunch: MealAdherence = true,
  dinner: MealAdherence = true,
): GoalDayDetail => ({
  goal_id: goal.id,
  user_id: goal.user_id,
  local_date: day,
  meal_options: goal.meal_options,
  meals: {
    almoco: { checked: true, description: 'Comida; teste\nregistro', adherent: lunch },
    jantar: { checked: true, description: '', adherent: dinner },
  },
  adherence_recorded: true,
  note: '',
})

describe('refeições livres opcionais', () => {
  beforeEach(() => localStorage.clear())

  it('completes every day and the week without using any free meals', () => {
    const details = Array.from({ length: 7 }, (_, i) => detail(`2026-10-${12 + i}`))
    expect(freeMealUsage(goal, '2026-10-16', details)).toEqual({ used: 0, limit: 2, excess: 0 })
    expect(weekStats([goal], [], new Date(2026, 9, 12), [], details)).toMatchObject({
      completed: 7,
      percent: 100,
    })
  })

  it('accepts one or two free meals and rejects the third without changing the first two', () => {
    const details = [
      detail('2026-10-12', 'free'),
      detail('2026-10-14', true, 'free'),
      detail('2026-10-16', 'free'),
    ]
    expect(freeMealUsage(goal, '2026-10-16', details)).toEqual({ used: 3, limit: 2, excess: 1 })
    expect(details.map((d) => isGoalDone(goal, d.local_date, [], details))).toEqual([
      true,
      true,
      false,
    ])
    expect(weekStats([goal], [], new Date(2026, 9, 12), [], details)).toMatchObject({
      completed: 2,
    })
    expect(
      monthStats([goal], [], [], details, new Date(2026, 9, 1), new Date(2026, 9, 18)).completed,
    ).toBe(2)
  })

  it('keeps off-plan, unclassified and unchecked meals incomplete', () => {
    for (const state of [false, null] as MealAdherence[]) {
      const d = detail('2026-10-12', state)
      expect(isGoalDone(goal, d.local_date, [], [d])).toBe(false)
      expect(freeMealUsage(goal, d.local_date, [d]).used).toBe(0)
    }
    const d = detail('2026-10-12', 'free')
    d.meals.almoco!.checked = false
    expect(freeMealUsage(goal, d.local_date, [d]).used).toBe(0)
    expect(isGoalDone(goal, d.local_date, [], [d])).toBe(false)
    expect(
      isGoalDone(
        { ...goal, free_meals_per_week: 0 },
        '2026-10-12',
        [],
        [detail('2026-10-12', 'free')],
      ),
    ).toBe(false)
  })

  it('resets the allowance on Monday, including weeks crossing a month boundary', () => {
    const details = [
      detail('2026-10-31', 'free', 'free'),
      detail('2026-11-01', 'free'),
      detail('2026-11-02', 'free'),
    ]
    expect(isGoalDone(goal, '2026-11-01', [], details)).toBe(false)
    expect(isGoalDone(goal, '2026-11-02', [], details)).toBe(true)
    expect(freeMealUsage(goal, '2026-11-02', details).used).toBe(1)
  })

  it('does not change excess attribution when meals are reordered or another goal has free meals', () => {
    const d = detail('2026-10-16', 'free', 'free')
    d.meal_options = [...d.meal_options].reverse()
    const other = { ...detail('2026-10-12', 'free', 'free'), goal_id: 'other-goal' }
    const limited = { ...goal, free_meals_per_week: 1 }
    expect(isMealAllowed(limited, d.local_date, 'almoco', [other, d])).toBe(true)
    expect(isMealAllowed(limited, d.local_date, 'jantar', [d, other])).toBe(false)
  })

  it('preserves legacy conclusions and does not reclassify former off-plan records', () => {
    const d = detail('2026-10-12', false)
    expect(isGoalDone(goal, d.local_date, [], [d])).toBe(false)
    expect(isGoalDone(goal, d.local_date, [], [{ ...d, adherence_recorded: false }])).toBe(true)
  })

  it('preserves an earlier week when the allowance changes and snapshots the previous limit', async () => {
    const input = goalInput()
    const savedGoal = await createGoal(input)
    const stored = JSON.parse(localStorage.getItem('semana-em-jogo-v1')!)
    stored.goals[0].created_at = goal.created_at
    const old = { ...detail('2026-09-26', 'free', 'free'), goal_id: savedGoal.id }
    stored.dayDetails = [old]
    localStorage.setItem('semana-em-jogo-v1', JSON.stringify(stored))
    await updateGoal(savedGoal.id, { ...input, free_meals_per_week: 0 })
    const data = await loadData()
    expect(data.history[0]?.free_meals_per_week).toBe(2)
    const historical = goalForDate(data.goals[0]!, data.history, new Date(2026, 8, 26))
    expect(isGoalDone(historical, old.local_date, [], data.dayDetails)).toBe(true)
    expect(
      weekStats(data.goals, [], new Date(2026, 8, 21), data.history, data.dayDetails).completed,
    ).toBe(1)
  })

  it('rejects invalid allowance values when creating or editing', async () => {
    const input = goalInput()
    for (const free_meals_per_week of [-1, 1.5, 85, NaN]) {
      await expect(createGoal({ ...input, free_meals_per_week })).rejects.toThrow(/0 a 84/)
      await expect(updateGoal(goal.id, { ...input, free_meals_per_week })).rejects.toThrow(/0 a 84/)
    }
  })

  it('exports allowed and excess free meals and restores the classification and limit', async () => {
    const details = [detail('2026-10-12', 'free', 'free'), detail('2026-10-16', 'free')]
    const csv = createGoalReport([goal], [], [], details, new Date(2026, 9, 16))
    expect(csv).toContain('"Almoço";"Sim";"Refeição livre (permitida)"')
    expect(csv).toContain('"Almoço";"Sim";"Refeição livre (limite excedido)"')
    const backup = parseGoalBackup(csv)
    await importGoalBackup(backup)
    const restored = await loadData()
    expect(restored.goals[0]?.free_meals_per_week).toBe(2)
    expect(restored.dayDetails[0]?.meals.almoco?.adherent).toBe('free')
    expect(isGoalDone(restored.goals[0]!, '2026-10-16', [], restored.dayDetails)).toBe(false)
    expect(restored.dayDetails[0]?.meals.almoco?.description).toBe('Comida; teste\nregistro')
    await saveDayDetail(detail('2026-10-18', 'free'))
    expect(
      (await loadData()).dayDetails.find((d) => d.local_date === '2026-10-18')?.meals.almoco
        ?.adherent,
    ).toBe('free')
  })

  it('keeps earlier weekly allowance context when exporting a range starting midweek', () => {
    const details = [detail('2026-10-12', 'free', 'free'), detail('2026-10-16', 'free')]
    const csv = createGoalReport([goal], [], [], details, new Date(2026, 9, 16), {
      from: '2026-10-16',
      to: '2026-10-16',
    })
    expect(csv).not.toContain('="12/10/2026"')
    const [restored] = parseGoalBackup(csv)
    expect(restored?.dayDetails).toHaveLength(2)
    expect(isGoalDone(restored!.goal, '2026-10-16', [], restored!.dayDetails)).toBe(false)
  })

  it('corrects an old zero limit only for an explicitly edited day and can restore history', () => {
    const oldGoal = { ...goal, free_meals_per_week: 0 }
    const selected = { ...detail('2026-10-12', 'free'), free_meals_limit_override: 2 }
    const untouched = detail('2026-10-13', 'free')
    const details = [selected, untouched]
    expect(freeMealUsage(oldGoal, selected.local_date, details)).toEqual({
      used: 2,
      limit: 2,
      excess: 0,
    })
    expect(isGoalDone(oldGoal, selected.local_date, [], details)).toBe(true)
    expect(isGoalDone(oldGoal, untouched.local_date, [], details)).toBe(false)
    selected.free_meals_limit_override = 0
    expect(isGoalDone(goal, selected.local_date, [], details)).toBe(false)
    const restored = { ...selected, free_meals_limit_override: null }
    expect(isGoalDone(oldGoal, selected.local_date, [], [restored, untouched])).toBe(false)
    expect(isGoalDone(goal, selected.local_date, [], [restored, untouched])).toBe(true)
  })

  it('persists a day correction through CSV export and restore without changing the goal limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 16, 12))
    const savedGoal = await createGoal({ ...goalInput(), free_meals_per_week: 0 })
    await saveDayDetail({
      ...detail('2026-10-16', 'free'),
      goal_id: savedGoal.id,
      free_meals_limit_override: 2,
    })
    const data = await loadData()
    const csv = createGoalReport(
      data.goals,
      [],
      data.history,
      data.dayDetails,
      new Date(2026, 9, 16),
      { from: '2026-10-16', to: '2026-10-16' },
    )
    const backup = parseGoalBackup(csv)
    localStorage.clear()
    await importGoalBackup(backup)
    const restored = await loadData()
    expect(restored.goals[0]?.free_meals_per_week).toBe(0)
    expect(restored.dayDetails[0]?.free_meals_limit_override).toBe(2)
    expect(isGoalDone(restored.goals[0]!, '2026-10-16', [], restored.dayDetails)).toBe(true)
    await saveDayDetail({ ...restored.dayDetails[0]!, free_meals_limit_override: null })
    expect(isGoalDone(restored.goals[0]!, '2026-10-16', [], (await loadData()).dayDetails)).toBe(
      false,
    )
  })

  it('validates corrected limits on save and import', async () => {
    for (const free_meals_limit_override of [-1, 1.5, 85, NaN]) {
      await expect(
        saveDayDetail({ ...detail('2026-10-16'), free_meals_limit_override }),
      ).rejects.toThrow(/0 a 84/)
    }
    const csv = createGoalReport(
      [goal],
      [],
      [],
      [{ ...detail('2026-10-16'), free_meals_limit_override: 85 }],
      new Date(2026, 9, 16),
    )
    expect(() => parseGoalBackup(csv)).toThrow(/Correção de limite inválida/)
  })
})
