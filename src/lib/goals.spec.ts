import { describe, expect, it } from 'vitest'
import { emptyGoalInput, goalToInput, normalizeGoalInput } from './goals'
import { createOption, OPTION_NAME_ERROR } from './meals'
import { defaultMealOptions, type Goal } from '../types'

describe('normalizeGoalInput', () => {
  const valid = () => ({ ...emptyGoalInput(), title: '  Treinar  ', scheduled_weekdays: [1, 3] })

  it('trims the title and drops the free-meal allowance outside food goals', () => {
    expect(normalizeGoalInput(valid())).toMatchObject({ title: 'Treinar', free_meals_per_week: 0 })
  })

  it('schedules weekly goals on every day and keeps food goals on fixed days', () => {
    expect(normalizeGoalInput({ ...valid(), goal_mode: 'weekly' })?.scheduled_weekdays).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    const food = normalizeGoalInput({ ...valid(), category: 'alimentacao', goal_mode: 'weekly' })
    expect(food).toMatchObject({ goal_mode: 'fixed', scheduled_weekdays: [1, 3] })
  })

  it.each([
    ['no title', { title: '   ' }],
    ['no days', { scheduled_weekdays: [] }],
    ['weekly target out of range', { weekly_target: 8 }],
    ['period without start', { duration_days: 10 }],
    ['start without period', { start_date: '2026-11-03' }],
    ['period longer than a year', { start_date: '2026-11-03', duration_days: 366 }],
    [
      'weekly period shorter than the target',
      {
        goal_mode: 'weekly' as const,
        weekly_target: 5,
        start_date: '2026-11-03',
        duration_days: 3,
      },
    ],
  ])('rejects %s', (_, change) => {
    expect(normalizeGoalInput({ ...valid(), ...change })).toBeNull()
  })

  it('requires at least one meal for food goals, including per-weekday lists', () => {
    const food = { ...valid(), category: 'alimentacao' as const }
    expect(normalizeGoalInput({ ...food, meal_options: [] })).toBeNull()
    expect(normalizeGoalInput({ ...food, meal_options_by_weekday: { '1': [] } })).toBeNull()
    expect(normalizeGoalInput(food)).not.toBeNull()
  })
})

it('copies a goal into an independent editable input', () => {
  const goal: Goal = {
    id: 'g',
    user_id: 'u',
    title: 'Dieta',
    category: 'alimentacao',
    scheduled_weekdays: [1],
    points: 10,
    active: true,
    meal_options: defaultMealOptions,
    meal_options_by_weekday: { '1': [{ id: 'a', label: 'Almoço' }] },
    created_at: '2026-11-01T12:00:00Z',
  }
  const input = goalToInput(goal)
  input.meal_options[0]!.label = 'Mudou'
  input.meal_options_by_weekday['1']![0]!.label = 'Mudou'
  expect(goal.meal_options[0]!.label).toBe('Café da manhã')
  expect(goal.meal_options_by_weekday['1']![0]!.label).toBe('Almoço')
  expect(input).toMatchObject({ goal_mode: 'fixed', weekly_target: 3, free_meals_per_week: 0 })
  expect(goalToInput(goal, 1).weekly_target).toBe(1)
})

it('creates unique options up to the limit', () => {
  const options = [{ id: 'a', label: 'Almoço' }]
  expect(createOption(options, ' Ceia ')).toMatchObject({ label: 'Ceia' })
  expect(createOption(options, 'almoço')).toBeNull()
  expect(createOption(options, '   ')).toBeNull()
  expect(createOption(options, 'x'.repeat(41))).toBeNull()
  const full = Array.from({ length: 12 }, (_, index) => ({ id: `${index}`, label: `${index}` }))
  expect(createOption(full, 'Outra')).toBeNull()
  expect(OPTION_NAME_ERROR).toContain('40 caracteres')
})
