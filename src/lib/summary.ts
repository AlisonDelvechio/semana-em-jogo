// Consultation summary for a professional following someone's shared goals.
// Pure functions over the same records the app already loads; nothing is stored.
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  addDays,
  freeMealUsage,
  goalForDate,
  isMealAllowed,
  localKey,
  mondayOf,
  scheduledFor,
} from './dates'
import { periodInsights } from './insights'

type Records = {
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}
export type SummaryPeriod = 'weeks4' | 'weeks8' | 'month' | 'previousMonth'

export const periodLabels: Record<SummaryPeriod, string> = {
  weeks4: 'Últimas 4 semanas',
  weeks8: 'Últimas 8 semanas',
  month: 'Este mês',
  previousMonth: 'Mês anterior',
}

// Whole weeks (Monday to Sunday) for the "last N weeks" options, so the weekly chart
// never starts with a partial week.
export function periodRange(period: SummaryPeriod, today: Date): { start: Date; end: Date } {
  if (period === 'month')
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    }
  if (period === 'previousMonth')
    return {
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      end: new Date(today.getFullYear(), today.getMonth(), 0),
    }
  const weeks = period === 'weeks4' ? 4 : 8
  const lastMonday = mondayOf(today)
  return { start: addDays(lastMonday, -7 * (weeks - 1)), end: addDays(lastMonday, 6) }
}

const minDate = (a: Date, b: Date) => (localKey(a) <= localKey(b) ? a : b)
const maxDate = (a: Date, b: Date) => (localKey(a) >= localKey(b) ? a : b)
const days = (start: Date, end: Date) => {
  const result: Date[] = []
  for (let date = start; localKey(date) <= localKey(end); date = addDays(date, 1)) result.push(date)
  return result
}

// Same units as the app's progress (meals, days or visits), summed over the period.
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
  const total = progress.reduce((sum, entry) => sum + entry.total, 0)
  const completed = progress.reduce((sum, entry) => sum + entry.completed, 0)
  return total ? Math.round((completed / total) * 100) : null
}

export type OffPlanMeal = {
  date: string
  goalTitle: string
  meal: string
  kind: 'off' | 'free-excess'
  description: string
  note: string
}

export function careSummary(records: Records, start: Date, end: Date, today: Date) {
  const through = minDate(end, today)
  const { goals, history, dayDetails, completions } = records
  const insights = periodInsights(goals, completions, history, dayDetails, start, end, today)

  // Headline: adherence in the period and the same-length period just before it.
  const length = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const percent = adherence(records, start, end, today)
  // Without any record in the previous period there is nothing to compare: its planned
  // days would all count as missed and inflate the difference.
  const previousStart = localKey(addDays(start, -length))
  const previousEnd = localKey(addDays(start, -1))
  const inPrevious = (entry: { local_date: string }) =>
    entry.local_date >= previousStart && entry.local_date <= previousEnd
  const previous =
    dayDetails.some(inPrevious) || completions.some(inPrevious)
      ? adherence(records, addDays(start, -length), addDays(start, -1), today)
      : null

  // Week by week, clipped to the period and to today.
  const weeks: { start: string; end: string; percent: number | null }[] = []
  for (
    let monday = mondayOf(start);
    localKey(monday) <= localKey(through);
    monday = addDays(monday, 7)
  ) {
    const weekStart = maxDate(monday, start)
    const weekEnd = minDate(addDays(monday, 6), end)
    weeks.push({
      start: localKey(weekStart),
      end: localKey(weekEnd),
      percent: adherence(records, weekStart, weekEnd, today),
    })
  }

  // Meals that most often leave the plan: classified records only.
  const meals = insights.patterns
    .filter((pattern) => pattern.valid + pattern.off > 0)
    .map((pattern) => ({
      title: pattern.title,
      off: pattern.off,
      classified: pattern.valid + pattern.off,
      pending: pattern.pending + pattern.unknown,
      offRate: Math.round((pattern.off / (pattern.valid + pattern.off)) * 100),
    }))
    .sort((a, b) => b.offRate - a.offRate || b.off - a.off || a.title.localeCompare(b.title))

  // Every off-plan or over-the-limit free meal, with what was eaten.
  const offPlan: OffPlanMeal[] = []
  const periodDays = days(start, through)
  for (const date of periodDays) {
    const day = localKey(date)
    for (const original of goals) {
      const goal = goalForDate(original, history, date)
      if (goal.category !== 'alimentacao' || !scheduledFor(goal, date)) continue
      const detail = dayDetails.find(
        (entry) => entry.goal_id === goal.id && entry.local_date === day,
      )
      if (!detail?.adherence_recorded) continue
      for (const option of detail.meal_options) {
        const meal = detail.meals[option.id]
        if (!meal?.checked || meal.adherent == null) continue
        if (isMealAllowed(goal, day, option.id, dayDetails)) continue
        offPlan.push({
          date: day,
          goalTitle: goal.title,
          meal: option.label,
          kind: meal.adherent === 'free' ? 'free-excess' : 'off',
          description: meal.description,
          note: detail.note,
        })
      }
    }
  }

  // Free meals used per week, for each food goal.
  const freeMeals: { week: string; goalTitle: string; used: number; limit: number }[] = []
  for (const week of weeks) {
    const monday = new Date(`${week.start}T12:00:00`)
    for (const original of goals) {
      const goal = goalForDate(original, history, monday)
      if (goal.category !== 'alimentacao') continue
      const { used, limit } = freeMealUsage(goal, week.start, dayDetails)
      if (used || limit) freeMeals.push({ week: week.start, goalTitle: goal.title, used, limit })
    }
  }

  // Days with something planned and nothing recorded for any of it.
  const missingDays = periodDays
    .filter((date) => {
      const planned = goals
        .map((goal) => goalForDate(goal, history, date))
        .filter((goal) => goal.goal_mode !== 'weekly' && scheduledFor(goal, date))
      if (!planned.length) return false
      const day = localKey(date)
      return !planned.some(
        (goal) =>
          dayDetails.some((entry) => entry.goal_id === goal.id && entry.local_date === day) ||
          completions.some((entry) => entry.goal_id === goal.id && entry.local_date === day),
      )
    })
    .map(localKey)

  return {
    percent,
    previous,
    delta: percent != null && previous != null ? percent - previous : null,
    weeks,
    goals: insights.progress,
    meals,
    offPlan,
    freeMeals,
    missingDays,
    through: localKey(through),
  }
}
export type CareSummary = ReturnType<typeof careSummary>
