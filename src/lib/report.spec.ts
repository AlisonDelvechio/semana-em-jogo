import { describe, expect, it } from 'vitest'
import { createGoalReport } from './report'
import { defaultMealOptions, type Goal, type GoalDayDetail, type GoalHistory } from '../types'

const goal: Goal = {
  id: 'diet',
  user_id: 'user',
  title: 'Dieta atual',
  category: 'alimentacao',
  scheduled_weekdays: [6],
  points: 20,
  active: true,
  created_at: '2026-09-25T12:00:00Z',
  meal_options: defaultMealOptions,
  meal_options_by_weekday: {},
}

describe('goal report', () => {
  it('exports the historical goal, meal descriptions and daily note without dropping punctuation', () => {
    const history: GoalHistory[] = [
      {
        goal_id: goal.id,
        user_id: goal.user_id,
        valid_until: '2026-09-27',
        title: 'Dieta anterior',
        category: 'alimentacao',
        scheduled_weekdays: [6],
        points: 10,
        active: true,
        meal_options: defaultMealOptions,
        meal_options_by_weekday: {},
      },
    ]
    const detail: GoalDayDetail = {
      goal_id: goal.id,
      user_id: goal.user_id,
      local_date: '2026-09-26',
      meal_options: defaultMealOptions.slice(0, 2),
      meals: {
        cafe: {
          checked: true,
          description: 'Rap10 com carne moída, mussarela; leite com chocolate',
        },
        almoco: { checked: false, description: '=1+1' },
      },
      note: 'Treino leve, depois descanso',
    }
    const csv = createGoalReport([goal], [], history, [detail], new Date(2026, 8, 26))
    expect(csv).toContain(
      '="26/09/2026";"Sábado";"Dieta anterior";"alimentacao";"Sim";"Não";"Café da manhã"',
    )
    expect(csv).toContain('"Rap10 com carne moída, mussarela; leite com chocolate"')
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"Treino leve, depois descanso"')
    expect(csv.split('\r\n').filter((row) => row.includes('="26/09/2026"'))).toHaveLength(2)
  })

  it('includes saved entries outside the current schedule and goals without scheduled occurrences', () => {
    const paused = { ...goal, active: false, title: 'Pausada' }
    const detail: GoalDayDetail = {
      goal_id: goal.id,
      user_id: goal.user_id,
      local_date: '2026-09-25',
      meal_options: defaultMealOptions.slice(0, 1),
      meals: { cafe: { checked: true, description: 'Café' } },
      note: 'Registro antigo',
    }
    const csv = createGoalReport([paused], [], [], [detail], new Date(2026, 8, 26))
    expect(csv).toContain('="25/09/2026";"Sexta";"Pausada";"alimentacao";"Não"')
    expect(csv).toContain('"Registro antigo"')
    expect(createGoalReport([paused], [], [], [], new Date(2026, 8, 26))).toContain('"Pausada"')
  })

  it('exports generic checklist items with optional descriptions', () => {
    const training: Goal = {
      ...goal,
      id: 'training',
      title: 'Academia',
      category: 'treino',
      checklist_options: [{ id: 'warmup', label: 'Aquecer' }],
      checklist_options_by_weekday: {},
    }
    const detail: GoalDayDetail = {
      goal_id: training.id,
      user_id: training.user_id,
      local_date: '2026-09-26',
      meal_options: defaultMealOptions,
      meals: {},
      note: 'Treino tranquilo',
      checklist_options: training.checklist_options,
      checklist: { warmup: { checked: true, description: 'Esteira 10 minutos' } },
    }
    const csv = createGoalReport([training], [], [], [detail], new Date(2026, 8, 26))
    expect(csv).toContain('="26/09/2026"')
    expect(csv).toContain('"Aquecer";"Sim";"Não informado";"Esteira 10 minutos";"Treino tranquilo"')
  })
})
