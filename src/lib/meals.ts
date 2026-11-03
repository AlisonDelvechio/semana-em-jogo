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

export const OPTION_NAME_ERROR = 'Use um nome único de até 40 caracteres (máximo de 12 itens).'

// Builds a new option for a meal or checklist list, or returns null when the name is
// empty, too long, duplicated (case-insensitive) or the list is already full.
export function createOption(options: MealOption[], label: string): MealOption | null {
  const name = label.trim()
  if (
    !name ||
    name.length > 40 ||
    options.length >= 12 ||
    options.some(
      (item) => item.label.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
    )
  )
    return null
  return { id: crypto.randomUUID(), label: name }
}
