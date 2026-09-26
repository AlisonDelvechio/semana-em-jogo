import type { Completion, Goal, GoalHistory } from '../types'

export const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const fullWeekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function localKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function mondayOf(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() + amount)
  return result
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function goalForDate(goal: Goal, history: GoalHistory[], date: Date): Goal {
  const day = localKey(date)
  const version = history
    .filter((entry) => entry.goal_id === goal.id && entry.valid_until > day)
    .sort((a, b) => a.valid_until.localeCompare(b.valid_until))[0]
  return version ? { ...goal, ...version } : goal
}

export function scheduledFor(goal: Goal, date: Date): boolean {
  return (
    goal.active &&
    goal.scheduled_weekdays.includes(date.getDay()) &&
    localKey(date) >= localKey(new Date(goal.created_at))
  )
}

export function weekStats(
  goals: Goal[],
  completions: Completion[],
  monday: Date,
  history: GoalHistory[] = [],
) {
  const scheduled = weekDays(monday).flatMap((day) =>
    goals
      .map((goal) => goalForDate(goal, history, day))
      .filter((goal) => scheduledFor(goal, day))
      .map((goal) => ({ goal, day: localKey(day) })),
  )
  const done = scheduled.filter(({ goal, day }) =>
    completions.some((entry) => entry.goal_id === goal.id && entry.local_date === day),
  )
  return {
    total: scheduled.length,
    completed: done.length,
    percent: scheduled.length ? Math.round((done.length / scheduled.length) * 100) : 0,
    points: done.reduce((sum, entry) => sum + entry.goal.points, 0),
  }
}
