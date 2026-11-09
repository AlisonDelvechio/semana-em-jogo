import { expect, it } from 'vitest'
import { createPrintableSummary } from './print-summary'
import type { CareSummary } from './summary'

const summary: CareSummary = {
  percent: 72,
  previous: 65,
  delta: 7,
  weeks: [{ start: '2026-11-02', end: '2026-11-08', percent: 72 }],
  goals: [],
  meals: [{ title: 'Dieta · Jantar', off: 2, classified: 5, pending: 1, offRate: 40 }],
  offPlan: [
    {
      date: '2026-11-03',
      goalTitle: 'Dieta',
      meal: 'Jantar',
      kind: 'off',
      description: '<img src=x onerror=alert(1)> pizza',
      note: 'Aniversário',
    },
  ],
  freeMeals: [{ week: '2026-11-02', goalTitle: 'Dieta', used: 1, limit: 2 }],
  missingDays: ['2026-11-04'],
  through: '2026-11-08',
}

it('prints the consultation summary with escaped text and a CSP-safe print button', () => {
  const html = createPrintableSummary(summary, {
    patientName: 'paciente@exemplo.com',
    periodLabel: 'Últimas 4 semanas',
    generatedAt: new Date('2026-11-09T10:00:00'),
  })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.querySelector('header')!.textContent).toContain('paciente@exemplo.com')
  expect(doc.querySelector('.stats')!.textContent).toContain('72%')
  expect(doc.querySelector('.stats')!.textContent).toContain('+7 pontos vs período anterior (65%)')
  // Text typed by the patient is shown, never executed.
  expect(doc.querySelector('img')).toBeNull()
  expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)> pizza')
  // No element carries an inline event handler (the popup's CSP would block it anyway).
  const handlers = [...doc.querySelectorAll('*')].flatMap((element) =>
    [...element.attributes].filter((attribute) => attribute.name.startsWith('on')),
  )
  expect(handlers).toHaveLength(0)
  expect(doc.querySelector('[data-print]')).not.toBeNull()
  expect(doc.title).toBe('semana-em-jogo-resumo-2026-11-09')
})
