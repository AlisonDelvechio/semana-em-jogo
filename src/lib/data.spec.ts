import { beforeEach, describe, expect, it } from 'vitest'
import { createGoal, loadData, saveDayDetail, updateGoal } from './data'
import { defaultMealOptions } from '../types'
import { addDays, localKey, mondayOf, weekStats } from './dates'

describe('local goal history', () => {
  beforeEach(() => localStorage.clear())

  it('saves generic checklist items and their descriptions for one day', async () => {
    const goal = await createGoal({
      title: 'Academia',
      category: 'treino',
      scheduled_weekdays: [6],
      goal_mode: 'fixed',
      weekly_target: 1,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [{ id: 'warmup', label: 'Aquecer' }],
      checklist_options_by_weekday: {},
    })
    await saveDayDetail({
      goal_id: goal.id,
      local_date: '2026-09-26',
      note: 'Boa sessão',
      meal_options: defaultMealOptions,
      meals: {},
      checklist_options: [{ id: 'warmup', label: 'Aquecer' }],
      checklist: { warmup: { checked: true, description: '  10 minutos  ' } },
    })
    expect((await loadData()).dayDetails[0]).toMatchObject({
      checklist_options: [{ id: 'warmup', label: 'Aquecer' }],
      checklist: { warmup: { checked: true, description: '10 minutos' } },
      note: 'Boa sessão',
    })
  })

  it('keeps the first plan for previous days after multiple edits on the same day', async () => {
    const today = new Date()
    const yesterday = addDays(today, -1)
    const weekday = yesterday.getDay()
    const original = {
      title: 'Treino',
      category: 'treino' as const,
      scheduled_weekdays: [weekday],
      goal_mode: 'fixed' as const,
      weekly_target: 1,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [],
      checklist_options_by_weekday: {},
    }
    const goal = await createGoal(original)
    // A goal created yesterday can have a scheduled past day.
    const stored = JSON.parse(localStorage.getItem('semana-em-jogo-v1')!)
    stored.goals[0].created_at = addDays(today, -8).toISOString()
    localStorage.setItem('semana-em-jogo-v1', JSON.stringify(stored))

    await updateGoal(goal.id, { ...original, points: 20, scheduled_weekdays: [today.getDay()] })
    await updateGoal(goal.id, { ...original, active: false })
    const data = await loadData()
    expect(data.history).toHaveLength(1)
    expect(data.history[0]).toMatchObject({
      valid_until: localKey(today),
      points: 10,
      active: true,
      scheduled_weekdays: [weekday],
    })
    const previousWeek = mondayOf(addDays(today, -7))
    const stats = weekStats(data.goals, [], previousWeek, data.history)
    expect(stats.total).toBe(1)
  })
  it('persists meal checks and descriptions for a particular date locally', async () => {
    const goal = await createGoal({
      title: 'Dieta',
      category: 'alimentacao',
      scheduled_weekdays: [6],
      goal_mode: 'fixed',
      weekly_target: 1,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [],
      checklist_options_by_weekday: {},
    })
    await saveDayDetail({
      goal_id: goal.id,
      local_date: '2026-09-26',
      note: '  Tudo bem  ',
      meal_options: ['jantar', 'almoco', 'lanche'].map((id) =>
        defaultMealOptions.find((option) => option.id === id)!,
      ),
      meals: {
        almoco: { checked: true, description: '  Arroz e feijão  ' },
        lanche: { checked: false, description: '' },
        jantar: { checked: true, description: 'Salada' },
      },
    })
    const saved = (await loadData()).dayDetails
    expect(saved[0]?.meal_options.map(({ id }) => id)).toEqual(['jantar', 'almoco', 'lanche'])
    expect(saved).toMatchObject([
      {
        goal_id: goal.id,
        local_date: '2026-09-26',
        note: 'Tudo bem',
        meals: {
          almoco: { checked: true, description: 'Arroz e feijão' },
          lanche: { checked: false, description: '' },
          jantar: { checked: true, description: 'Salada' },
        },
      },
    ])
  })
  it('keeps the original three choices on pre-migration local day records', async () => {
    const goal = await createGoal({
      title: 'Dieta',
      category: 'alimentacao',
      scheduled_weekdays: [6],
      goal_mode: 'fixed',
      weekly_target: 1,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [],
      checklist_options_by_weekday: {},
    })
    const oldData = JSON.parse(localStorage.getItem('semana-em-jogo-v1')!)
    oldData.goals[0].created_at = '2026-09-01T12:00:00Z'
    oldData.dayDetails = [
      {
        goal_id: goal.id,
        user_id: 'local',
        local_date: '2026-09-26',
        note: '',
        meals: {
          almoco: { checked: true, description: '' },
          lanche: { checked: true, description: '' },
          jantar: { checked: true, description: '' },
        },
      },
    ]
    localStorage.setItem('semana-em-jogo-v1', JSON.stringify(oldData))
    const loaded = await loadData()
    expect(loaded.dayDetails[0]?.meal_options.map(({ id }) => id)).toEqual([
      'almoco',
      'lanche',
      'jantar',
    ])
    expect(
      weekStats(loaded.goals, [], new Date(2026, 8, 21), [], loaded.dayDetails).completed,
    ).toBe(1)
  })
})
