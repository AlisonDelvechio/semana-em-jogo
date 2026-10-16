import { parseCsv } from './backup'
import type { ReportRange } from './report'

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
const display = (value: string) => value.replace(/^'(?=[\s]*[=+@\-\t\r])/, '')

// The printable report shares the CSV's exact range and historical interpretation,
// while deliberately omitting the technical restoration column.
export function createPrintableReport(
  csv: string,
  generatedAt: Date,
  range: ReportRange = {},
): string {
  const rows = parseCsv(csv)
    .slice(1)
    .filter((row) => row.length >= 11)
  const groups: {
    date: string
    weekday: string
    goal: string
    category: string
    scheduled: string
    done: string
    note: string
    items: string[][]
  }[] = []
  for (const row of rows) {
    const date = row[0]!.replace(/^="(.*)"$/, '$1')
    let group = groups.at(-1)
    if (!group || group.date !== date || group.goal !== row[2] || group.category !== row[3]) {
      group = {
        date,
        weekday: row[1]!,
        goal: row[2]!,
        category: row[3]!,
        scheduled: row[4]!,
        done: row[5]!,
        note: row[10]!,
        items: [],
      }
      groups.push(group)
    }
    if (row[6]) group.items.push(row.slice(6, 10))
  }
  const category = (value: string) =>
    ({ treino: 'Treino', alimentacao: 'Alimentação', outro: 'Outro' })[value] || value
  const period =
    range.from || range.to
      ? `${range.from ? new Date(`${range.from}T12:00:00`).toLocaleDateString('pt-BR') : 'Início'} a ${range.to ? new Date(`${range.to}T12:00:00`).toLocaleDateString('pt-BR') : 'Fim'}`
      : 'Todo o histórico disponível'
  const text = (value: string) => escapeHtml(display(value))
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>semana-em-jogo-relatorio-${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')}</title><style>
 @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#1c3023;background:#fff;margin:24px auto;max-width:900px;padding:0 20px}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:0 0 4px;overflow-wrap:anywhere;break-after:avoid}p{margin:4px 0}header{border-bottom:2px solid #476f3d;padding-bottom:16px;margin-bottom:20px}.meta{color:#445744}.record{margin:0 0 22px;padding-bottom:16px;border-bottom:1px solid #cbd7c7}.record-head{break-inside:avoid;break-after:avoid}.status{font-weight:bold}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:10px;font-size:11px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #d8e0d5;padding:7px;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eef4ea}thead{display:table-header-group}tr{break-inside:avoid}th:nth-child(1){width:25%}th:nth-child(2){width:15%}th:nth-child(3){width:28%}.note{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px}.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;background:#eef4ea;border-radius:10px;margin-bottom:24px}.toolbar button{min-height:44px;background:#b9dca4;color:#14201b;border:1px solid #476f3d;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.toolbar p{flex:1 1 220px}footer{font-size:10px;color:#445744;margin-top:20px}@media print{body{margin:0;max-width:none;padding:0}.toolbar{display:none}header{margin-bottom:16px}a{color:inherit}th{background:#eef4ea;print-color-adjust:exact}}
 </style></head><body><div class="toolbar"><p>Na janela de impressão, escolha <strong>Salvar como PDF</strong>. O PDF é um relatório de leitura; restaurações usam o CSV.</p><button type="button" onclick="window.print()">Imprimir / Salvar PDF</button></div><header><h1>Semana em jogo</h1><p>Relatório de metas e registros</p><p class="meta">${text(period)} · Gerado em ${text(generatedAt.toLocaleString('pt-BR'))}</p></header>${groups.length ? groups.map((group) => `<section class="record"><div class="record-head"><h2>${text(group.goal)}</h2><p class="meta">${text(group.date || 'Sem data registrada')} ${text(group.weekday)} · ${text(category(group.category))}</p><p>Prevista: ${text(group.scheduled)} · <span class="status">Meta concluída: ${text(group.done)}</span></p></div>${group.items.length ? `<table><thead><tr><th>Item</th><th>Registrado</th><th>Seguiu o plano</th><th>Descrição</th></tr></thead><tbody>${group.items.map((item) => `<tr>${item.map((value) => `<td>${text(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${group.note ? `<p class="note"><strong>Observação do dia:</strong> ${text(group.note)}</p>` : ''}</section>`).join('') : '<p>Nenhum registro no período selecionado.</p>'}<footer>Semanas de frequência são interpretadas conforme as regras históricas da meta. “Não informado” não representa refeição fora do plano. Este documento não contém os dados técnicos de restauração.</footer></body></html>`
}
