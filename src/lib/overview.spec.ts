import { describe, expect, it } from 'vitest'
import type { Goal, GoalDayDetail, MealAdherence } from '../types'
import { addDays, localKey } from './dates'
import { careOverview, lastRecordLabel } from './overview'

const diet: Goal = {
  id: 'diet',
  user_id: 'p',
  title: 'Dieta',
  category: 'alimentacao',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  goal_mode: 'fixed',
  weekly_target: 1,
  free_meals_per_week: 1,
  start_date: null,
  duration_days: null,
  points: 10,
  active: true,
  meal_options: [
    { id: 'cafe', label: 'Café da manhã' },
    { id: 'almoco', label: 'Almoço' },
    { id: 'jantar', label: 'Jantar' },
  ],
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
  created_at: '2026-08-20T12:00:00Z',
}
const record = (date: Date, meals: Record<string, MealAdherence>): GoalDayDetail => ({
  goal_id: 'diet',
  user_id: 'p',
  local_date: localKey(date),
  meal_options: diet.meal_options,
  adherence_recorded: true,
  note: '',
  meals: Object.fromEntries(
    Object.entries(meals).map(([id, adherent]) => [
      id,
      { checked: true, description: '', adherent },
    ]),
  ),
})
const days = (from: string, to: string) => {
  const result: Date[] = []
  for (let date = new Date(`${from}T12:00:00`); localKey(date) <= to; date = addDays(date, 1))
    result.push(date)
  return result
}

describe('careOverview', () => {
  // Sep: dinner off every 6th day. Oct-Nov: dinner off every 3rd day and lunch off on
  // weekends. One day missing in October, six of the first ten days in November.
  const details = days('2026-09-01', '2026-11-10').flatMap((date) => {
    const n = date.getDate(),
      month = date.getMonth(),
      weekend = date.getDay() === 0 || date.getDay() === 6
    if ((month === 9 && n === 20) || (month === 10 && [1, 2, 4, 6, 8, 9].includes(n))) return []
    return [
      record(date, {
        cafe: true,
        almoco: !(month >= 9 && weekend),
        jantar: month === 8 ? n % 6 !== 0 : n % 3 !== 0,
      }),
    ]
  })
  const today = new Date('2026-11-10T12:00:00')
  const overview = careOverview(
    { goals: [diet], completions: [], history: [], dayDetails: details },
    'months3',
    today,
  )

  it('summarises month by month with whole weeks and recorded days', () => {
    // Sep: 90 meals, 5 dinners off -> 94%. Oct: 93 meals, 3 missing, 10 dinners and
    // 9 weekend lunches off -> 71/93 = 76%.
    expect(overview.months.map((month) => [month.name, month.percent, month.delta])).toEqual([
      ['Setembro', 94, null],
      ['Outubro', 76, -18],
      ['Novembro', 33, -43],
    ])
    // Weeks belong to the month of their Monday: 1 Nov is a Sunday.
    expect(overview.months[2]!.weeks.map((week) => week.label)).toEqual(['02', '09'])
    expect(overview.months[0]!.weeks.map((week) => week.label)).toEqual(['07', '14', '21', '28'])
    expect(overview.months.map((month) => [month.recorded, month.planned])).toEqual([
      [30, 30],
      [30, 31],
      [4, 10],
    ])
    expect(overview.months[2]!.partial).toBe(true)
  })

  it('writes one sentence about the trend', () => {
    expect(overview.headline).toBe('Começou em 94% em setembro e novembro está em 33%.')
  })

  it('lists up to three things to talk about, most important first', () => {
    expect(overview.talkingPoints.map((point) => point.title)).toEqual([
      'Jantar: é a refeição que mais sai do plano.',
      'Os fins de semana são mais difíceis.',
      'Os registros ficaram irregulares em novembro.',
    ])
    expect(overview.talkingPoints[2]!.detail).toBe('6 dias sem nenhuma anotação até hoje.')
    expect(overview.attention).toBe(3)
    expect(overview.lastRecord).toBe('2026-11-10')
  })

  it('mentions an improvement only when there is room and enough data', () => {
    // Breakfast off half the time in September, never in October; nothing else to say.
    const improving = days('2026-09-01', '2026-10-31').map((date) =>
      record(date, {
        cafe: date.getMonth() === 9 || date.getDate() % 2 === 0,
        almoco: true,
        jantar: true,
      }),
    )
    // The goal starts in September, so August has nothing planned.
    const result = careOverview(
      {
        goals: [{ ...diet, created_at: '2026-09-01T12:00:00Z' }],
        completions: [],
        history: [],
        dayDetails: improving,
      },
      'months3',
      new Date('2026-10-31T12:00:00'),
    )
    expect(result.talkingPoints).toEqual([
      {
        title: 'Café da manhã: melhorou.',
        detail: 'Fora do plano caiu de 50% em setembro para 0% em outubro.',
        positive: true,
      },
    ])
    expect(result.attention).toBe(0)
    expect(result.headline).toBe('Vem melhorando: de 83% em setembro para 100% em outubro.')
  })

  it('shows a month without records as such, never as 0%', () => {
    const result = careOverview(
      { goals: [diet], completions: [], history: [], dayDetails: details },
      'months6',
      today,
    )
    // The goal exists since 20 Aug but logging only started in September.
    expect(result.months.map((month) => [month.name, month.percent])).toEqual([
      ['Junho', null],
      ['Julho', null],
      ['Agosto', null],
      ['Setembro', 94],
      ['Outubro', 76],
      ['Novembro', 33],
    ])
    expect(result.headline).toBe('Começou em 94% em setembro e novembro está em 33%.')
    // Months without any record are not called "irregular".
    expect(result.talkingPoints.map((point) => point.title)).not.toContain(
      'Os registros ficaram irregulares em agosto.',
    )
  })

  it('says nothing when there is too little data', () => {
    const result = careOverview(
      {
        goals: [diet],
        completions: [],
        history: [],
        dayDetails: [record(new Date('2026-11-09T12:00:00'), { cafe: false, almoco: true })],
      },
      'months3',
      new Date('2026-11-10T12:00:00'),
    )
    expect(result.talkingPoints.filter((point) => point.title.includes('refeição'))).toEqual([])
  })
})

it('describes the last record in plain words', () => {
  const today = new Date('2026-11-10T12:00:00')
  expect(lastRecordLabel('2026-11-10', today)).toBe('Registrou hoje')
  expect(lastRecordLabel('2026-11-09', today)).toBe('Registrou ontem')
  expect(lastRecordLabel('2026-11-05', today)).toBe('Último registro há 5 dias')
  expect(lastRecordLabel(null, today)).toBe('Ainda sem registros')
})

it('keeps a month that has only just started out of the trend', () => {
  const details = days('2026-09-01', '2026-11-04').map((date) =>
    record(date, {
      cafe: true,
      almoco: true,
      // A bad start of November after a steady October.
      jantar: !(date.getMonth() === 10),
    }),
  )
  const result = careOverview(
    { goals: [diet], completions: [], history: [], dayDetails: details },
    'months3',
    new Date('2026-11-04T12:00:00'),
  )
  const november = result.months.at(-1)!
  expect([november.percent, november.early, november.delta]).toEqual([67, true, null])
  // September and October were both 100%; November (4 days) is not part of the sentence.
  expect(result.headline).toBe('Ficou estável, perto de 100%, em todos os meses.')
})
