import { beforeEach, describe, expect, it } from 'vitest'
import {
  createGoal,
  importGoalBackup,
  loadData,
  saveDayDetail,
  setCompleted,
  updateGoal,
} from './data'
import { parseGoalBackup } from './backup'
import { createGoalReport } from './report'
import { defaultMealOptions, type Goal, type GoalDayDetail } from '../types'
import { goalForDate, isGoalDone, scheduledFor, weekStats } from './dates'

describe('período e aderência', () => {
  const goal: Goal = {
    id: 'b8620e36-e80a-43e3-bb57-4bd7e3d97741',
    user_id: 'u',
    title: 'Plano de 14 dias',
    category: 'alimentacao',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    start_date: '2026-10-12',
    duration_days: 14,
    points: 10,
    active: true,
    meal_options: defaultMealOptions,
    meal_options_by_weekday: {},
    created_at: '2026-10-12T12:00:00Z',
  }
  const detail: GoalDayDetail = {
    goal_id: goal.id,
    user_id: 'u',
    local_date: '2026-10-12',
    meal_options: defaultMealOptions,
    meals: Object.fromEntries(
      defaultMealOptions.map(({ id }) => [
        id,
        { checked: true, description: 'Comi', adherent: true },
      ]),
    ),
    note: '',
    adherence_recorded: true,
  }
  it('schedules exactly fourteen calendar days', () => {
    expect(scheduledFor(goal, new Date(2026, 9, 11))).toBe(false)
    expect(scheduledFor(goal, new Date(2026, 9, 12))).toBe(true)
    expect(scheduledFor(goal, new Date(2026, 9, 25))).toBe(true)
    expect(scheduledFor(goal, new Date(2026, 9, 26))).toBe(false)
    expect(weekStats([goal], [], new Date(2026, 9, 26)).total).toBe(0)
  })
  it('limits a weekly target to the available days at the end of a short period', () => {
    const weekly = {
      ...goal,
      category: 'treino' as const,
      goal_mode: 'weekly' as const,
      weekly_target: 3,
      start_date: '2026-10-12',
      duration_days: 8,
    }
    expect(weekStats([weekly], [], new Date(2026, 9, 19)).total).toBe(1)
  })
  it('keeps an earlier schedule when the current goal gets a new start date', () => {
    const history = [
      {
        ...goal,
        goal_id: goal.id,
        valid_until: '2026-10-12',
        start_date: null,
        duration_days: null,
      },
    ]
    delete (history[0] as Partial<Goal>).created_at
    expect(
      scheduledFor(goalForDate(goal, history, new Date(2026, 9, 11)), new Date(2026, 9, 11)),
    ).toBe(false)
    const olderGoal = { ...goal, created_at: '2026-09-01T12:00:00Z' }
    expect(
      scheduledFor(goalForDate(olderGoal, history, new Date(2026, 9, 11)), new Date(2026, 9, 11)),
    ).toBe(true)
  })
  it('keeps a recorded free meal separate from dietary adherence', () => {
    expect(isGoalDone(goal, detail.local_date, [], [detail])).toBe(true)
    detail.meals.almoco!.adherent = false
    expect(isGoalDone(goal, detail.local_date, [], [detail])).toBe(false)
    expect(
      createGoalReport([goal], [], [], [detail], new Date(2026, 9, 12), {
        from: '2026-10-12',
        to: '2026-10-12',
      }),
    ).toContain('"Almoço";"Sim";"Não";"Comi"')
    const legacy = { ...detail, adherence_recorded: false }
    expect(isGoalDone(goal, detail.local_date, [], [legacy])).toBe(true)
  })
})

describe('CSV de restauração', () => {
  beforeEach(() => localStorage.clear())
  it('exports a month, restores missing records and never overwrites existing days', async () => {
    const goal = await createGoal({
      title: 'Dieta; teste',
      category: 'alimentacao',
      scheduled_weekdays: [6],
      goal_mode: 'fixed',
      weekly_target: 1,
      start_date: '2026-09-01',
      duration_days: 30,
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
      meal_options: defaultMealOptions,
      meals: { cafe: { checked: true, description: 'Leite; ovos\ncom queijo', adherent: false } },
      adherence_recorded: true,
      note: 'Refeição livre',
      checklist_options: [],
      checklist: {},
    })
    await saveDayDetail({
      goal_id: goal.id,
      local_date: '2026-10-03',
      meal_options: defaultMealOptions,
      meals: {},
      adherence_recorded: true,
      note: 'Fora do mês',
      checklist_options: [],
      checklist: {},
    })
    const data = await loadData()
    const csv = createGoalReport(
      data.goals,
      data.completions,
      data.history,
      data.dayDetails,
      new Date(2026, 9, 12),
      { from: '2026-09-01', to: '2026-09-30' },
    )
    const parsed = parseGoalBackup(csv)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.dayDetails).toHaveLength(1)
    expect(parsed[0]?.dayDetails[0]?.meals.cafe?.description).toBe('Leite; ovos\ncom queijo')
    expect(parsed[0]?.dayDetails[0]?.meals.cafe?.adherent).toBe(false)
    await saveDayDetail({
      goal_id: goal.id,
      local_date: '2026-09-26',
      meal_options: defaultMealOptions,
      meals: {},
      adherence_recorded: true,
      note: 'Registro mais recente',
      checklist_options: [],
      checklist: {},
    })
    expect(await importGoalBackup(parsed)).toEqual({
      goals: 0,
      history: 0,
      dayDetails: 0,
      completions: 0,
    })
    expect(
      (await loadData()).dayDetails.find((item) => item.local_date === '2026-09-26')?.note,
    ).toBe('Registro mais recente')
    localStorage.clear()
    expect(await importGoalBackup(parsed)).toMatchObject({ goals: 1, dayDetails: 1 })
    expect((await loadData()).dayDetails[0]?.note).toBe('Refeição livre')
    expect(await importGoalBackup(parsed)).toEqual({
      goals: 0,
      history: 0,
      dayDetails: 0,
      completions: 0,
    })
  })
  it('restores goal versions and dated completions from a full export', async () => {
    const input = {
      title: 'Caminhada',
      category: 'outro' as const,
      scheduled_weekdays: [6],
      goal_mode: 'fixed' as const,
      weekly_target: 1,
      start_date: '2026-09-01',
      duration_days: 30,
      points: 10,
      active: true,
      meal_options: defaultMealOptions,
      meal_options_by_weekday: {},
      checklist_options: [],
      checklist_options_by_weekday: {},
    }
    const goal = await createGoal(input)
    await setCompleted(goal.id, '2026-09-26', true)
    await updateGoal(goal.id, { ...input, points: 20 })
    const saved = await loadData()
    const csv = createGoalReport(
      saved.goals,
      saved.completions,
      saved.history,
      saved.dayDetails,
      new Date(2026, 9, 12),
    )
    const backup = parseGoalBackup(csv)
    localStorage.clear()
    expect(await importGoalBackup(backup)).toMatchObject({ goals: 1, history: 1, completions: 1 })
    const restored = await loadData()
    expect(restored.history[0]?.points).toBe(10)
    expect(restored.completions[0]?.local_date).toBe('2026-09-26')
  })
  it('rejects old reports without restoration metadata', () => {
    expect(() => parseGoalBackup('Data;Meta\r\n26/09/2026;Dieta\r\n')).toThrow(
      /não contém os dados/,
    )
  })
})

it('imports both the previous CSV with points columns and the current CSV without them', () => {
  const goal: Goal = {
    id: 'b8620e36-e80a-43e3-bb57-4bd7e3d97741',
    user_id: 'u',
    title: 'Teste',
    category: 'outro',
    scheduled_weekdays: [1],
    active: false,
    points: 25,
    meal_options: defaultMealOptions,
    meal_options_by_weekday: {},
    created_at: '2026-10-01T12:00:00Z',
  }
  const current = createGoalReport([goal], [], [], [], new Date(2026, 9, 16))
  const backup = { version: 1, goal, history: [], completions: [], dayDetails: [] }
  const cell = '"' + JSON.stringify(backup).replaceAll('"', '""') + '"'
  const old =
    '"Data";"Dia da semana";"Meta";"Categoria";"Prevista";"Concluída";"Pontos da meta";"Pontos ganhos";"Item do checklist";"Item marcado";"Seguiu o plano";"Descrição";"Observação do dia";"Dados para restauração"\r\n' +
    Array(13).fill('""').concat(cell).join(';') +
    '\r\n'
  expect(current.split('\r\n')[0]).not.toContain('Pontos')
  expect(parseGoalBackup(current)[0]?.goal.points).toBe(25)
  expect(parseGoalBackup(old)[0]?.goal.points).toBe(25)
})
