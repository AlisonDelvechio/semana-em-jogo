import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  addDays,
  checklistOptionsForDate,
  fullWeekdays,
  goalForDate,
  isGoalDone,
  localKey,
  mealOptionsForDate,
  mondayOf,
  scheduledFor,
} from './dates'

const columns = [
  'Data',
  'Dia da semana',
  'Meta',
  'Categoria',
  'Prevista',
  'Concluída',
  'Pontos da meta',
  'Pontos ganhos',
  'Item do checklist',
  'Item marcado',
  'Descrição',
  'Observação do dia',
]

function csvCell(value: string | number): string {
  const raw = String(value)
  // Text entered by users should never run as a spreadsheet formula.
  const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export function createGoalReport(
  goals: Goal[],
  completions: Completion[],
  history: GoalHistory[],
  dayDetails: GoalDayDetail[],
  today: Date = new Date(),
): string {
  const rows: (string | number)[][] = [columns]
  const latestSavedDay = [
    ...completions.map(({ local_date }) => local_date),
    ...dayDetails.map(({ local_date }) => local_date),
  ]
    .sort()
    .at(-1)
  const endOfWeek = localKey(addDays(mondayOf(today), 6))
  const end = latestSavedDay && latestSavedDay > endOfWeek ? latestSavedDay : endOfWeek
  const lastDay = new Date(`${end}T12:00:00`)
  const details = new Map(
    dayDetails.map((detail) => [`${detail.goal_id}:${detail.local_date}`, detail]),
  )
  const completedDates = new Set(completions.map((entry) => `${entry.goal_id}:${entry.local_date}`))

  for (const goal of goals) {
    let recorded = false
    const created = new Date(goal.created_at)
    for (
      let date = new Date(created.getFullYear(), created.getMonth(), created.getDate());
      date <= lastDay;
      date = addDays(date, 1)
    ) {
      const day = localKey(date)
      const version = goalForDate(goal, history, date)
      const scheduled = scheduledFor(version, date)
      const detail = details.get(`${goal.id}:${day}`)
      if (!scheduled && !detail && !completedDates.has(`${goal.id}:${day}`)) continue
      recorded = true
      const done = isGoalDone(version, day, completions, dayDetails)
      const common = [
        date.toLocaleDateString('pt-BR'),
        fullWeekdays[date.getDay()]!,
        version.title,
        version.category,
        scheduled ? 'Sim' : 'Não',
        done ? 'Sim' : 'Não',
        version.points,
        scheduled && done ? version.points : 0,
      ]
      const food = version.category === 'alimentacao'
      const options = food
        ? detail?.meal_options || mealOptionsForDate(version, date)
        : detail?.checklist_options?.length
          ? detail.checklist_options
          : checklistOptionsForDate(version, date)
      const itemEntries = food ? detail?.meals : detail?.checklist
      if (options.length) {
        for (const option of options) {
          rows.push([
            ...common,
            option.label,
            itemEntries?.[option.id]?.checked
              ? 'Sim'
              : done && (!detail || (!food && !detail.checklist_options?.length))
                ? 'Sim'
                : 'Não',
            itemEntries?.[option.id]?.description || '',
            detail?.note || '',
          ])
        }
      } else {
        rows.push([...common, '', '', '', detail?.note || ''])
      }
    }
    // Keep newly created or paused goals visible even when no day is scheduled yet.
    if (!recorded)
      rows.push(['', '', goal.title, goal.category, 'Não', 'Não', goal.points, 0, '', '', '', ''])
  }

  return `\uFEFF${rows
    .map((row, rowIndex) =>
      row
        .map((value, columnIndex) =>
          // Excel displays dates as #### in a narrow CSV column. A generated text formula
          // keeps the full date visible without interpreting user-entered text as a formula.
          rowIndex > 0 && columnIndex === 0 && value ? `="${value}"` : csvCell(value),
        )
        .join(';'),
    )
    .join('\r\n')}\r\n`
}
