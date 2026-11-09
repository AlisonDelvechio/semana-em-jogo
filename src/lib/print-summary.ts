import { escapeHtml } from './print-report'
import type { CareSummary } from './summary'

const day = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const text = (value: string | number) => escapeHtml(String(value))

// Printable consultation summary (A4). Same look as the CSV report's printable version.
// The print button is wired by the opener: the popup inherits the page CSP, which
// blocks inline handlers.
export function createPrintableSummary(
  summary: CareSummary,
  options: { patientName: string; periodLabel: string; generatedAt: Date },
): string {
  const { patientName, periodLabel, generatedAt } = options
  const percent = (value: number | null) => (value === null ? '—' : `${value}%`)
  const delta =
    summary.delta === null
      ? 'Sem registros no período anterior para comparar'
      : `${summary.delta > 0 ? '+' : ''}${summary.delta} pontos vs período anterior (${summary.previous}%)`
  const free = summary.offPlan.filter((meal) => meal.kind === 'free-excess').length
  const rows = (cells: (string | number)[][]) =>
    cells.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join('')}</tr>`).join('')
  const table = (head: string[], body: (string | number)[][], empty: string) =>
    body.length
      ? `<table><thead><tr>${head.map((cell) => `<th>${text(cell)}</th>`).join('')}</tr></thead><tbody>${rows(body)}</tbody></table>`
      : `<p class="empty">${text(empty)}</p>`
  const stamp = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')}`

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>semana-em-jogo-resumo-${stamp}</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#1c3023;background:#fff;margin:24px auto;max-width:900px;padding:0 20px}h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;break-after:avoid}p{margin:4px 0}header{border-bottom:2px solid #476f3d;padding-bottom:14px;margin-bottom:16px}.meta,.empty{color:#445744}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{border:1px solid #cbd7c7;border-radius:8px;padding:10px}.stat strong{display:block;font-size:22px}.stat span{color:#445744;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #d8e0d5;padding:6px;overflow-wrap:anywhere}th{background:#eef4ea}thead{display:table-header-group}tr{break-inside:avoid}.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;background:#eef4ea;border-radius:10px;margin-bottom:24px}.toolbar button{min-height:44px;background:#b9dca4;color:#14201b;border:1px solid #476f3d;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.toolbar p{flex:1 1 220px}footer{font-size:10px;color:#445744;margin-top:20px}@media print{body{margin:0;max-width:none;padding:0}.toolbar{display:none}th{background:#eef4ea;print-color-adjust:exact}}
</style></head><body><div class="toolbar"><p>Na janela de impressão, escolha <strong>Salvar como PDF</strong>.</p><button type="button" data-print>Imprimir / Salvar PDF</button></div>
<header><h1>Resumo de acompanhamento</h1><p><strong>${text(patientName)}</strong></p><p class="meta">${text(periodLabel)} · Gerado em ${text(generatedAt.toLocaleString('pt-BR'))}</p></header>
<div class="stats"><div class="stat"><span>Aderência no período</span><strong>${text(percent(summary.percent))}</strong><span>${text(delta)}</span></div><div class="stat"><span>Refeições fora do plano</span><strong>${summary.offPlan.length - free}</strong></div><div class="stat"><span>Livres além do limite</span><strong>${free}</strong></div><div class="stat"><span>Dias sem registro</span><strong>${summary.missingDays.length}</strong></div></div>
<h2>Aderência por semana</h2>${table(
    ['Semana', 'Aderência'],
    summary.weeks.map((week) => [`${day(week.start)} a ${day(week.end)}`, percent(week.percent)]),
    'Sem semanas no período.',
  )}
<h2>Refeições que mais escapam do plano</h2>${table(
    ['Refeição', 'Fora do plano', 'Sem registro ou classificação'],
    summary.meals.map((meal) => [
      meal.title,
      `${meal.offRate}% (${meal.off} de ${meal.classified})`,
      meal.pending,
    ]),
    'Nenhuma refeição classificada no período.',
  )}
<h2>Fora do plano e livres além do limite</h2>${table(
    ['Data', 'Refeição', 'Tipo', 'O que comeu', 'Observação do dia'],
    summary.offPlan.map((meal) => [
      day(meal.date),
      meal.meal,
      meal.kind === 'off' ? 'Fora do plano' : 'Livre além do limite',
      meal.description || '—',
      meal.note || '—',
    ]),
    'Nenhuma no período.',
  )}
<h2>Refeições livres por semana</h2>${table(
    ['Semana', 'Usadas / permitidas'],
    summary.freeMeals.map((entry) => [day(entry.week), `${entry.used} de ${entry.limit}`]),
    'Nenhuma refeição livre usada.',
  )}
<h2>Dias sem registro</h2>${summary.missingDays.length ? `<p>${text(summary.missingDays.map(day).join(' · '))}</p>` : '<p class="empty">Todos os dias têm registro.</p>'}
<footer>Aderência considera refeições dentro do plano e livres dentro do limite, além de dias e idas cumpridos, até a data de geração. Registros sem classificação não são contados como fora do plano.</footer></body></html>`
}
