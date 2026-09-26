import type { MealOption } from '../types'

export function moveMeal(options: MealOption[], id: string, offset: -1 | 1): MealOption[] {
  const index = options.findIndex((option) => option.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= options.length) return options
  const moved = [...options]
  const [item] = moved.splice(index, 1)
  moved.splice(target, 0, item!)
  return moved
}
