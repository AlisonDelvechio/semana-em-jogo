import { expect, it } from 'vitest'
import { capitalizeFirst } from './format'

it('capitalizes only the first letter of dates', () => {
  expect(capitalizeFirst('quarta-feira, 4 de novembro')).toBe('Quarta-feira, 4 de novembro')
  expect(capitalizeFirst('novembro de 2026')).toBe('Novembro de 2026')
  expect(capitalizeFirst('')).toBe('')
})
