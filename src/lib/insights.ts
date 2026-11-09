import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  addDays,
  countsForDay,
  goalForDate,
  goalProgressCounts,
  isMealAllowed,
  localKey,
  mealOptionsForDate,
  scheduledFor,
  weeklyEntries,
} from './dates'

export type MealStatus = 'valid' | 'off' | 'pending' | 'unknown'
export interface MealRecord {
  date: string
  label: string
  goalTitle: string
  status: MealStatus
  reason: string
  note: string
}
export interface MealPattern {
  id: string
  title: string
  valid: number
  off: number
  pending: number
  unknown: number
  total: number
  records: MealRecord[]
}

export function periodInsights(
  goals: Goal[],
  completions: Completion[],
  history: GoalHistory[],
  details: GoalDayDetail[],
  start: Date,
  end: Date,
  today: Date,
) {
  const progress = new Map<
    string,
    {
      id: string
      title: string
      category: Goal['category']
      mode: string
      completed: number
      total: number
    }
  >()
  const patterns = new Map<string, MealPattern>()
  const through = localKey(end) < localKey(today) ? end : today
  function row(goal: Goal, mode: string) {
    const id = `${goal.id}:${mode}`
    if (!progress.has(id))
      progress.set(id, {
        id,
        title: goal.title,
        category: goal.category,
        mode,
        completed: 0,
        total: 0,
      })
    return progress.get(id)!
  }
  for (let date = new Date(start); localKey(date) <= localKey(through); date = addDays(date, 1)) {
    const day = localKey(date)
    for (const original of goals) {
      const goal = goalForDate(original, history, date)
      if (!scheduledFor(goal, date) || goal.goal_mode === 'weekly') continue
      const counts = goalProgressCounts(goal, day, completions, details)
      const result = row(goal, goal.category === 'alimentacao' ? 'meals' : 'days')
      result.completed += counts.completed
      result.total += counts.total
      if (goal.category !== 'alimentacao') continue
      const detail = details.find((entry) => entry.goal_id === goal.id && entry.local_date === day)
      const legacyDone = !detail && counts.completed > 0
      for (const option of detail?.meal_options || mealOptionsForDate(goal, date)) {
        // An optional meal that did not happen is not pending: it simply does not count.
        if (!countsForDay(option, detail)) continue
        // The same stable option ID can have a different historical label. Keep both identities.
        const id = JSON.stringify([goal.id, option.id, option.label])
        if (!patterns.has(id))
          patterns.set(id, {
            id,
            title: `${goal.title} · ${option.label}`,
            valid: 0,
            off: 0,
            pending: 0,
            unknown: 0,
            total: 0,
            records: [],
          })
        const pattern = patterns.get(id)!
        const meal = detail?.meals[option.id]
        let status: MealStatus = 'pending',
          reason = 'Sem registro'
        if (legacyDone || meal?.checked) {
          if (!detail?.adherence_recorded || meal?.adherent == null) {
            status = 'unknown'
            reason = 'Sem classificação'
          } else if (isMealAllowed(goal, day, option.id, details)) {
            status = 'valid'
            reason = meal.adherent === 'free' ? 'Livre dentro do limite' : 'Dentro do plano'
          } else {
            status = 'off'
            reason = meal?.adherent === 'free' ? 'Livre além do limite' : 'Fora do plano'
          }
        }
        pattern[status]++
        pattern.total++
        pattern.records.push({
          date: day,
          label: option.label,
          goalTitle: goal.title,
          status,
          reason,
          note: detail?.note || '',
        })
      }
    }
    // Match the app's convention: frequency goals belong to the month of their Monday.
    if (date.getDay() !== 1) continue
    for (const entry of weeklyEntries(goals, completions, date, history, details, through)) {
      const result = row(entry.goal, 'visits')
      result.completed += Math.min(entry.completed, entry.target)
      result.total += entry.target
    }
  }
  return {
    progress: [...progress.values()]
      .filter((entry) => entry.total > 0)
      .map((entry) => ({ ...entry, percent: Math.round((entry.completed / entry.total) * 100) })),
    patterns: [...patterns.values()],
  }
}
