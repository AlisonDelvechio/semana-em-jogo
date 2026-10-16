import { expect, it } from 'vitest'
import { createPrintableReport } from './print-report'
import { createGoalReport } from './report'
import type { Goal, GoalDayDetail } from '../types'
const goal: Goal = {
  id: 'private-id',
  user_id: 'private-user',
  title: 'Dieta <img src=x onerror=alert(1)>',
  category: 'alimentacao',
  scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
  points: 10,
  active: true,
  meal_options: [{ id: 'lunch', label: 'Almoço' }],
  meal_options_by_weekday: {},
  created_at: '2026-10-01T12:00:00',
}
it('renders the same filtered records safely without the restoration payload', () => {
  const detail: GoalDayDetail = {
    goal_id: goal.id,
    user_id: goal.user_id,
    local_date: '2026-10-13',
    meals: { lunch: { checked: true, adherent: false, description: 'Arroz; carne\n"porção"' } },
    meal_options: goal.meal_options,
    adherence_recorded: true,
    note: 'Aniversário <script>alert(1)</script>',
  }
  const range = { from: '2026-10-13', to: '2026-10-13' }
  const csv = createGoalReport([goal], [], [], [detail], new Date(2026, 9, 16), range)
  const html = createPrintableReport(csv, new Date(2026, 9, 16, 12), range)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.querySelectorAll('.record')).toHaveLength(1)
  expect(doc.querySelector('.record')!.textContent).toContain('13/10/2026')
  expect(doc.querySelector('td:last-child')!.textContent).toBe('Arroz; carne\n"porção"')
  expect(doc.querySelector('.note')!.textContent).toContain('<script>alert(1)</script>')
  expect(doc.querySelectorAll('img,script')).toHaveLength(0)
  expect(html).not.toContain('private-user')
  expect(html).not.toContain('private-id')
  expect(html).not.toContain('Dados para restauração')
  expect(doc.querySelectorAll('th')).toHaveLength(4)
  expect(html).toContain('@page')
  expect(doc.querySelector('.toolbar')!.textContent).toContain('Salvar como PDF')
})
it('shows a clear empty period without adding technical backup records', () => {
  const csv = createGoalReport([goal], [], [], [], new Date(2026, 9, 16), {
    from: '2026-09-01',
    to: '2026-09-02',
  })
  expect(createPrintableReport(csv, new Date(2026, 9, 16))).toContain(
    'Nenhum registro no período selecionado',
  )
})
