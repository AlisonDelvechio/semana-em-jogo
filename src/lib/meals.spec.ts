import { describe, expect, it } from 'vitest'
import { moveMeal } from './meals'
import { defaultMealOptions } from '../types'

describe('meal order', () => {
  it('moves a meal without changing its id or the other options', () => {
    const moved = moveMeal(defaultMealOptions, 'cafe', 1)
    expect(moved.map(({ id }) => id)).toEqual(['almoco', 'cafe', 'lanche', 'jantar'])
    expect(defaultMealOptions.map(({ id }) => id)).toEqual(['cafe', 'almoco', 'lanche', 'jantar'])
    expect(moveMeal(moved, 'cafe', -1).map(({ id }) => id)).toEqual(
      defaultMealOptions.map(({ id }) => id),
    )
  })
  it('keeps the list when an item cannot move further', () => {
    expect(moveMeal(defaultMealOptions, 'cafe', -1)).toBe(defaultMealOptions)
    expect(moveMeal(defaultMealOptions, 'missing', 1)).toBe(defaultMealOptions)
  })
})
