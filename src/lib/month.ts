import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  addDays,
  goalForDate,
  goalProgressCounts,
  isGoalDone,
  localKey,
  mondayOf,
  scheduledFor,
  weeklyEntries,
} from './dates'

// Frequency goals belong to the month in which their week starts (Monday).
// Fixed-day goals belong to the calendar date on which they were scheduled.
export function monthStats(
  goals: Goal[],
  completions: Completion[],
  history: GoalHistory[],
  details: GoalDayDetail[],
  month: Date,
  today: Date,
) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  let total = 0,
    completed = 0,
    dueTotal = 0,
    dueCompleted = 0
  let progressTotal = 0,
    progressCompleted = 0
  for (let date = first; date <= last; date = addDays(date, 1)) {
    for (const original of goals) {
      const goal = goalForDate(original, history, date)
      if (goal.goal_mode !== 'weekly' && scheduledFor(goal, date)) {
        total++
        const done = isGoalDone(goal, localKey(date), completions, details)
        if (done) completed++
        if (localKey(date) <= localKey(today)) {
          dueTotal++
          if (done) dueCompleted++
          const counts = goalProgressCounts(goal, localKey(date), completions, details)
          progressTotal += counts.total
          progressCompleted += counts.completed
        }
      }
    }
    if (localKey(mondayOf(date)) !== localKey(date)) continue
    for (const entry of weeklyEntries(goals, completions, date, history, details)) {
      total += entry.target
      completed += Math.min(entry.target, entry.completed)
    }
    if (localKey(date) <= localKey(today)) {
      for (const entry of weeklyEntries(goals, completions, date, history, details, today)) {
        dueTotal += entry.target
        dueCompleted += Math.min(entry.target, entry.completed)
        progressTotal += entry.target
        progressCompleted += Math.min(entry.target, entry.completed)
      }
    }
  }
  return {
    total,
    completed,
    dueTotal,
    dueCompleted,
    percent: progressTotal ? Math.round((progressCompleted / progressTotal) * 100) : 0,
  }
}
