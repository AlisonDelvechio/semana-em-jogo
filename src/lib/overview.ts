// Simplified overview for a professional: month by month, one summary sentence and up to
// three "things to talk about". Plain functions over the records the app already loads.
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  addDays,
  freeMealUsage,
  goalForDate,
  goalProgressCounts,
  localKey,
  mondayOf,
  scheduledFor,
} from './dates'
import { periodInsights } from './insights'

export type Records = {
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}
export type OverviewPeriod = 'months3' | 'months6'
export const overviewPeriodLabels: Record<OverviewPeriod, string> = {
  months3: 'Últimos 3 meses',
  months6: 'Últimos 6 meses',
}

// Rules for the "things to talk about". Kept together so they are easy to tune.
export const RULES = {
  worstMealRate: 25, // % of classified meals off the plan
  minClassifiedMeals: 8, // below this, meal percentages say too little
  weekendGap: 15, // percentage points between weekdays and weekends
  minWeekendDays: 4,
  missingDaysRate: 20, // % of planned days without any record in a month
  minPlannedDays: 5,
  improvement: 15, // drop in a meal's off-plan rate, first to last month
  stableBand: 3, // first vs last month within this many points reads as stable
  minDaysForTrend: 7, // a month this young swings too much to compare
  maxPoints: 3,
}

const monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1)
const minDate = (a: Date, b: Date) => (localKey(a) <= localKey(b) ? a : b)
const eachDay = (start: Date, end: Date) => {
  const result: Date[] = []
  for (let date = start; localKey(date) <= localKey(end); date = addDays(date, 1)) result.push(date)
  return result
}
const percentOf = (completed: number, total: number) =>
  total ? Math.round((completed / total) * 100) : null

export function overviewRange(period: OverviewPeriod, today: Date) {
  const months = period === 'months3' ? 3 : 6
  return {
    start: new Date(today.getFullYear(), today.getMonth() - (months - 1), 1),
    end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  }
}

// Same units as the app's progress (meals, days or visits).
function adherence(records: Records, start: Date, end: Date, today: Date) {
  if (localKey(start) > localKey(today)) return null
  const { progress } = periodInsights(
    records.goals,
    records.completions,
    records.history,
    records.dayDetails,
    start,
    end,
    today,
  )
  return percentOf(
    progress.reduce((sum, entry) => sum + entry.completed, 0),
    progress.reduce((sum, entry) => sum + entry.total, 0),
  )
}

const anyRecord = (records: Records, start: Date, end: Date) => {
  const from = localKey(start),
    to = localKey(end)
  return [...records.dayDetails, ...records.completions].some(
    (entry) => entry.local_date >= from && entry.local_date <= to,
  )
}
const hasRecord = (records: Records, goalId: string, day: string) =>
  records.dayDetails.some((entry) => entry.goal_id === goalId && entry.local_date === day) ||
  records.completions.some((entry) => entry.goal_id === goalId && entry.local_date === day)

// Days with something planned (fixed-day goals), and how many of them have any record.
function plannedDays(records: Records, dates: Date[]) {
  let planned = 0,
    recorded = 0
  for (const date of dates) {
    const goals = records.goals
      .map((goal) => goalForDate(goal, records.history, date))
      .filter((goal) => goal.goal_mode !== 'weekly' && scheduledFor(goal, date))
    if (!goals.length) continue
    planned++
    if (goals.some((goal) => hasRecord(records, goal.id, localKey(date)))) recorded++
  }
  return { planned, recorded }
}

// Off-plan rate per meal (by its label), from classified records only.
function mealRates(records: Records, start: Date, end: Date, today: Date) {
  const { patterns } = periodInsights(
    records.goals,
    records.completions,
    records.history,
    records.dayDetails,
    start,
    end,
    today,
  )
  const byMeal = new Map<string, { off: number; classified: number }>()
  for (const pattern of patterns) {
    const label = pattern.title.split(' · ').slice(1).join(' · ') || pattern.title
    const entry = byMeal.get(label) ?? { off: 0, classified: 0 }
    entry.off += pattern.off
    entry.classified += pattern.valid + pattern.off
    byMeal.set(label, entry)
  }
  return byMeal
}

export type OverviewMonth = {
  key: string
  name: string
  percent: number | null
  delta: number | null
  partial: boolean
  // Fewer than RULES.minDaysForTrend days so far: shown, but kept out of comparisons.
  early: boolean
  weeks: { label: string; percent: number | null }[]
  planned: number
  recorded: number
}
export type TalkingPoint = { title: string; detail: string; positive?: boolean }

export function careOverview(records: Records, period: OverviewPeriod, today: Date) {
  const { start, end } = overviewRange(period, today)
  const through = minDate(end, today)

  // Month by month. Whole weeks (Monday to Sunday) belong to the month of their Monday,
  // the convention the app already uses for weekly-frequency goals, so no bar covers
  // only a day or two at a month's edge.
  const months: OverviewMonth[] = []
  for (
    let first = start;
    localKey(first) <= localKey(through);
    first = new Date(first.getFullYear(), first.getMonth() + 1, 1)
  ) {
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    const monthEnd = minDate(last, through)
    const weeks: OverviewMonth['weeks'] = []
    let monday = mondayOf(first)
    if (localKey(monday) < localKey(first)) monday = addDays(monday, 7)
    for (; localKey(monday) <= localKey(monthEnd); monday = addDays(monday, 7))
      weeks.push({
        label: String(monday.getDate()).padStart(2, '0'),
        percent: anyRecord(records, monday, addDays(monday, 6))
          ? adherence(records, monday, addDays(monday, 6), today)
          : null,
      })
    // A month without any record reads "sem registros", never 0%.
    const percent = anyRecord(records, first, last) ? adherence(records, first, last, today) : null
    const elapsed = Math.round((monthEnd.getTime() - first.getTime()) / 86_400_000) + 1
    const early = localKey(last) > localKey(today) && elapsed < RULES.minDaysForTrend
    const previous = months.at(-1)?.percent ?? null
    months.push({
      key: localKey(first).slice(0, 7),
      name: capitalize(monthNames[first.getMonth()]!),
      percent,
      delta: percent !== null && previous !== null && !early ? percent - previous : null,
      partial: localKey(last) > localKey(today),
      early,
      weeks,
      ...plannedDays(records, eachDay(first, monthEnd)),
    })
  }
  const percent = adherence(records, start, end, today)
  const withData = months.filter((month) => month.percent !== null && !month.early)

  // One sentence about the trend, from the first to the last month with data.
  let headline = 'Ainda não há registros suficientes no período.'
  if (withData.length === 1) {
    const only = withData[0]!
    headline = `${only.percent}% dentro do plano em ${only.name.toLowerCase()}.`
  } else if (withData.length > 1) {
    const first = withData[0]!,
      last = withData.at(-1)!
    const diff = last.percent! - first.percent!
    const lastIs = last.partial ? 'está em' : 'terminou em'
    if (diff <= -RULES.stableBand - 1)
      headline = `Começou em ${first.percent}% em ${first.name.toLowerCase()} e ${last.name.toLowerCase()} ${lastIs} ${last.percent}%.`
    else if (diff >= RULES.stableBand + 1)
      headline = `Vem melhorando: de ${first.percent}% em ${first.name.toLowerCase()} para ${last.percent}% em ${last.name.toLowerCase()}.`
    else {
      // Describe the same months that were compared (a just-started month is left out).
      const average = Math.round(
        withData.reduce((sum, month) => sum + month.percent!, 0) / withData.length,
      )
      headline = `Ficou estável, perto de ${average}%, em todos os meses.`
    }
  }

  // Things to talk about, most important first.
  const points: TalkingPoint[] = []
  const rates = mealRates(records, start, end, today)
  const worst = [...rates.entries()]
    .filter(([, rate]) => rate.classified >= RULES.minClassifiedMeals)
    .map(([label, rate]) => ({ label, ...rate, rate: percentOf(rate.off, rate.classified)! }))
    .sort((a, b) => b.rate - a.rate || b.off - a.off)[0]
  const firstMonth = withData[0]
  const lastMonth = withData.at(-1)
  const monthRate = (month: OverviewMonth | undefined, label: string) => {
    if (!month) return null
    const first = new Date(`${month.key}-01T12:00:00`)
    const rate = mealRates(
      records,
      first,
      new Date(first.getFullYear(), first.getMonth() + 1, 0),
      today,
    ).get(label)
    return rate && rate.classified >= RULES.minClassifiedMeals / 2
      ? percentOf(rate.off, rate.classified)
      : null
  }
  // A meal that was a problem but is fine now is an improvement, not a warning.
  const worstNow = worst && withData.length > 1 ? monthRate(lastMonth, worst.label) : null
  const recovered = worst && worstNow !== null && worst.rate - worstNow >= RULES.improvement
  if (worst && worst.rate >= RULES.worstMealRate && !recovered) {
    const before = withData.length > 1 ? monthRate(firstMonth, worst.label) : null
    points.push({
      title: `${worst.label}: é a refeição que mais sai do plano.`,
      detail:
        `Fora do plano em ${worst.rate}% das vezes (${worst.off} de ${worst.classified}).` +
        (before !== null && Math.abs(before - worst.rate) >= 10
          ? ` Em ${firstMonth!.name.toLowerCase()} eram ${before}%.`
          : ''),
    })
  }

  // Weekends against the other days (fixed-day goals, units as in progress).
  const sums = { weekend: [0, 0, 0], weekday: [0, 0, 0] }
  for (const date of eachDay(start, through)) {
    const bucket = date.getDay() === 0 || date.getDay() === 6 ? sums.weekend : sums.weekday
    let any = false
    for (const original of records.goals) {
      const goal = goalForDate(original, records.history, date)
      if (goal.goal_mode === 'weekly' || !scheduledFor(goal, date)) continue
      if (!hasRecord(records, goal.id, localKey(date))) continue
      const counts = goalProgressCounts(
        goal,
        localKey(date),
        records.completions,
        records.dayDetails,
      )
      bucket[0]! += counts.completed
      bucket[1]! += counts.total
      any = true
    }
    if (any) bucket[2]!++
  }
  const weekend = percentOf(sums.weekend[0]!, sums.weekend[1]!)
  const weekday = percentOf(sums.weekday[0]!, sums.weekday[1]!)
  if (
    weekend !== null &&
    weekday !== null &&
    sums.weekend[2]! >= RULES.minWeekendDays &&
    weekday - weekend >= RULES.weekendGap
  )
    points.push({
      title: 'Os fins de semana são mais difíceis.',
      detail: `${weekend}% dentro do plano no sábado e domingo, contra ${weekday}% nos outros dias.`,
    })

  // The month with the most days without any record.
  const irregular = months
    // Months with nothing recorded already read "sem registros" on their card.
    .filter((month) => month.planned >= RULES.minPlannedDays && month.recorded > 0)
    .map((month) => ({ month, missing: month.planned - month.recorded }))
    .filter(({ month, missing }) => (missing / month.planned) * 100 >= RULES.missingDaysRate)
    .sort((a, b) => b.missing / b.month.planned - a.missing / a.month.planned)[0]
  if (irregular)
    points.push({
      title: `Os registros ficaram irregulares em ${irregular.month.name.toLowerCase()}.`,
      detail: `${irregular.missing} ${irregular.missing === 1 ? 'dia' : 'dias'} sem nenhuma anotação${irregular.month.partial ? ' até hoje' : ''}.`,
    })

  // Weeks where free meals went over the allowance.
  let overWeeks = 0
  for (let monday = mondayOf(start); localKey(monday) <= localKey(through);) {
    const week = localKey(monday)
    if (
      records.goals.some((original) => {
        const goal = goalForDate(original, records.history, monday)
        if (goal.category !== 'alimentacao') return false
        const { used, limit } = freeMealUsage(goal, week, records.dayDetails)
        return used > limit
      })
    )
      overWeeks++
    monday = addDays(monday, 7)
  }
  if (overWeeks)
    points.push({
      title: 'As refeições livres passaram do limite.',
      detail: `Aconteceu em ${overWeeks} ${overWeeks === 1 ? 'semana' : 'semanas'} do período.`,
    })

  // Something that improved, only when there is room left.
  if (points.length < RULES.maxPoints && withData.length > 1) {
    const improved = [...rates.keys()]
      .map((label) => ({
        label,
        before: monthRate(firstMonth, label),
        after: monthRate(lastMonth, label),
      }))
      .filter(
        (entry) =>
          entry.before !== null &&
          entry.after !== null &&
          entry.before - entry.after >= RULES.improvement,
      )
      .sort((a, b) => b.before! - b.after! - (a.before! - a.after!))[0]
    if (improved)
      points.push({
        title: `${improved.label}: melhorou.`,
        detail: `Fora do plano caiu de ${improved.before}% em ${firstMonth!.name.toLowerCase()} para ${improved.after}% em ${lastMonth!.name.toLowerCase()}.`,
        positive: true,
      })
  }

  const lastRecord = [...records.dayDetails, ...records.completions]
    .map((entry) => entry.local_date)
    .filter((day) => day <= localKey(today))
    .sort()
    .at(-1)

  const talkingPoints = points.slice(0, RULES.maxPoints)
  return {
    start: localKey(start),
    through: localKey(through),
    percent,
    headline,
    months,
    talkingPoints,
    attention: talkingPoints.filter((point) => !point.positive).length,
    lastRecord: lastRecord ?? null,
  }
}
export type CareOverview = ReturnType<typeof careOverview>

// "Registrou hoje", "ontem", "há 5 dias" or "Ainda sem registros".
export function lastRecordLabel(lastRecord: string | null, today: Date) {
  if (!lastRecord) return 'Ainda sem registros'
  const days = Math.round(
    (new Date(`${localKey(today)}T12:00:00`).getTime() -
      new Date(`${lastRecord}T12:00:00`).getTime()) /
      86_400_000,
  )
  if (days <= 0) return 'Registrou hoje'
  if (days === 1) return 'Registrou ontem'
  return `Último registro há ${days} dias`
}
