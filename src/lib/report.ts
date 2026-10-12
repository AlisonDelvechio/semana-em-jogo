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
  weeklyEntries,
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
  'Seguiu o plano',
  'Descrição',
  'Observação do dia',
  'Dados para restauração',
]

export type ReportRange = { from?: string; to?: string }
export type BackupRecord = {
  version: 1
  goal: Goal
  history: GoalHistory[]
  completions: Completion[]
  dayDetails: GoalDayDetail[]
}

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
  range: ReportRange = {},
): string {
  const rows: (string | number)[][] = [columns]
  const latestSavedDay = [
    ...completions.map(({ local_date }) => local_date),
    ...dayDetails.map(({ local_date }) => local_date),
  ]
    .sort()
    .at(-1)
  const endOfWeek = localKey(addDays(mondayOf(today), 6))
  const lastPeriod = goals
    .map((goal) =>
      goal.start_date && goal.duration_days
        ? localKey(addDays(new Date(`${goal.start_date}T12:00:00`), goal.duration_days - 1))
        : '',
    )
    .sort()
    .at(-1)
  const end = range.to || [latestSavedDay || '', endOfWeek, lastPeriod || ''].sort().at(-1)!
  const lastDay = new Date(`${end}T12:00:00`)
  const details = new Map(
    dayDetails.map((detail) => [`${detail.goal_id}:${detail.local_date}`, detail]),
  )
  const completedDates = new Set(completions.map((entry) => `${entry.goal_id}:${entry.local_date}`))

  for (const goal of goals) {
    let recorded = false
    const firstRow = rows.length
    const created = new Date(goal.created_at)
    const firstDay = goal.start_date || localKey(created)
    for (
      let date =
        range.from && range.from > firstDay
          ? new Date(`${range.from}T12:00:00`)
          : new Date(`${firstDay}T12:00:00`);
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
      const earned =
        version.goal_mode === 'weekly' && done
          ? (() => {
              const monday = mondayOf(date)
              const count = (through: Date) =>
                weeklyEntries([goal], completions, monday, history, dayDetails, through)[0]
              const now = count(date)
              const before = count(addDays(date, -1))
              return Boolean(
                now && now.completed >= now.target && (!before || before.completed < now.target),
              )
            })()
          : scheduled && done
      const common = [
        date.toLocaleDateString('pt-BR'),
        fullWeekdays[date.getDay()]!,
        version.title,
        version.category,
        scheduled ? 'Sim' : 'Não',
        done ? 'Sim' : 'Não',
        version.points,
        earned ? version.points : 0,
      ]
      const food = version.category === 'alimentacao'
      const options = food
        ? detail?.meal_options || mealOptionsForDate(version, date)
        : detail?.checklist_options?.length
          ? detail.checklist_options
          : checklistOptionsForDate(version, date)
      const itemEntries = food ? detail?.meals : detail?.checklist
      if (options.length) {
        for (const [index, option] of options.entries()) {
          rows.push([
            ...common.slice(0, 7),
            index === 0 ? common[7]! : 0,
            option.label,
            itemEntries?.[option.id]?.checked
              ? 'Sim'
              : done && (!detail || (!food && !detail.checklist_options?.length))
                ? 'Sim'
                : 'Não',
            food && detail?.adherence_recorded && itemEntries?.[option.id]?.checked
              ? itemEntries[option.id]?.adherent === true
                ? 'Sim'
                : itemEntries[option.id]?.adherent === false
                  ? 'Não'
                  : 'Não informado'
              : 'Não informado',
            itemEntries?.[option.id]?.description || '',
            detail?.note || '',
            '',
          ])
        }
      } else {
        rows.push([...common, '', '', '', '', detail?.note || '', ''])
      }
    }
    // Keep newly created or paused goals visible even when no day is scheduled yet.
    if (!recorded && !range.from && !range.to)
      rows.push([
        '',
        '',
        goal.title,
        goal.category,
        'Não',
        'Não',
        goal.points,
        0,
        '',
        '',
        '',
        '',
        '',
        '',
      ])
    if (rows.length === firstRow) continue
    const inRange = (day: string) => (!range.from || day >= range.from) && day <= end
    const backup: BackupRecord = {
      version: 1,
      goal,
      history: history.filter((entry) => entry.goal_id === goal.id),
      completions: completions.filter(
        (entry) => entry.goal_id === goal.id && inRange(entry.local_date),
      ),
      dayDetails: dayDetails.filter(
        (entry) => entry.goal_id === goal.id && inRange(entry.local_date),
      ),
    }
    rows[firstRow]![13] = JSON.stringify(backup)
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
