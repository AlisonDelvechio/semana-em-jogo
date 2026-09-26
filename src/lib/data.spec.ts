import { beforeEach, describe, expect, it } from 'vitest'
import { createGoal, loadData, saveDayDetail, updateGoal } from './data'
import { addDays, localKey, mondayOf, weekStats } from './dates'

describe('local goal history', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the first plan for previous days after multiple edits on the same day', async () => {
    const today = new Date()
    const yesterday = addDays(today, -1)
    const weekday = yesterday.getDay()
    const original = {
      title: 'Treino',
      category: 'treino' as const,
      scheduled_weekdays: [weekday],
      points: 10,
      active: true,
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
      points: 10,
      active: true,
    })
    await saveDayDetail({
      goal_id: goal.id,
      local_date: '2026-09-26',
      note: '  Tudo bem  ',
      meals: {
        almoco: { checked: true, description: '  Arroz e feijão  ' },
        lanche: { checked: false, description: '' },
        jantar: { checked: true, description: 'Salada' },
      },
    })
    expect((await loadData()).dayDetails).toMatchObject([
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
})
