import {
  defaultMealOptions,
  type Completion,
  type Goal,
  type GoalDayDetail,
  type GoalHistory,
} from '../types'

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

export function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const start = mondayOf(first)
  const count = Math.max(
    35,
    Math.ceil((Math.round((last.getTime() - start.getTime()) / 86400000) + 1) / 7) * 7,
  )
  return Array.from({ length: count }, (_, index) => addDays(start, index))
}

export function goalForDate(goal: Goal, history: GoalHistory[], date: Date): Goal {
  const day = localKey(date)
  const version = history
    .filter((entry) => entry.goal_id === goal.id && entry.valid_until > day)
    .sort((a, b) => a.valid_until.localeCompare(b.valid_until))[0]
  return version
    ? { ...goal, ...version, free_meals_per_week: version.free_meals_per_week ?? 0 }
    : goal
}

export function scheduledFor(goal: Goal, date: Date): boolean {
  const day = localKey(date)
  const start = goal.start_date || localKey(new Date(goal.created_at))
  const end =
    goal.start_date && goal.duration_days
      ? localKey(addDays(new Date(`${goal.start_date}T12:00:00`), goal.duration_days - 1))
      : null
  return (
    goal.active &&
    (goal.goal_mode === 'weekly' || goal.scheduled_weekdays.includes(date.getDay())) &&
    day >= start &&
    (!end || day <= end)
  )
}

export function mealOptionsForDate(goal: Goal, date: Date) {
  return (
    goal.meal_options_by_weekday?.[String(date.getDay())] || goal.meal_options || defaultMealOptions
  )
}

export function checklistOptionsForDate(goal: Goal, date: Date) {
  return goal.checklist_options_by_weekday?.[String(date.getDay())] || goal.checklist_options || []
}

// Only checked, explicitly classified free meals consume the optional allowance.
// Sort by date and stable ID so reordering the checklist cannot move the excess.
function freeMealsInWeek(goal: Goal, day: string, details: GoalDayDetail[]) {
  const start = localKey(mondayOf(new Date(`${day}T12:00:00`)))
  const end = localKey(addDays(new Date(`${start}T12:00:00`), 6))
  return details
    .filter(
      (detail) =>
        detail.goal_id === goal.id &&
        detail.local_date >= start &&
        detail.local_date <= end &&
        detail.adherence_recorded,
    )
    .flatMap((detail) =>
      detail.meal_options
        .filter(({ id }) => detail.meals[id]?.checked && detail.meals[id]?.adherent === 'free')
        .map(({ id }) => ({ day: detail.local_date, id })),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))
}

export function freeMealUsage(goal: Goal, day: string, details: GoalDayDetail[]) {
  const used = freeMealsInWeek(goal, day, details).length
  const limit = goal.free_meals_per_week ?? 0
  return { used, limit, excess: Math.max(0, used - limit) }
}

export function isMealAllowed(goal: Goal, day: string, id: string, details: GoalDayDetail[]) {
  const detail = details.find((entry) => entry.goal_id === goal.id && entry.local_date === day)
  const meal = detail?.meals[id]
  if (!meal?.checked) return false
  if (!detail?.adherence_recorded || meal.adherent === true) return true
  if (meal.adherent !== 'free') return false
  const index = freeMealsInWeek(goal, day, details).findIndex(
    (entry) => entry.day === day && entry.id === id,
  )
  return index >= 0 && index < (goal.free_meals_per_week ?? 0)
}

export function isGoalDone(
  goal: Goal,
  day: string,
  completions: Completion[],
  dayDetails: GoalDayDetail[] = [],
): boolean {
  const detail = dayDetails.find((entry) => entry.goal_id === goal.id && entry.local_date === day)
  if (goal.category === 'alimentacao' && detail) {
    const options = detail.meal_options || goal.meal_options || []
    return options.length > 0 && options.every(({ id }) => isMealAllowed(goal, day, id, dayDetails))
  }
  if (goal.category !== 'alimentacao' && detail?.checklist_options?.length) {
    return detail.checklist_options.every(({ id }) => detail.checklist?.[id]?.checked)
  }
  return completions.some((entry) => entry.goal_id === goal.id && entry.local_date === day)
}

function scheduledEntries(goals: Goal[], monday: Date, history: GoalHistory[]) {
  return weekDays(monday).flatMap((day) =>
    goals
      .map((goal) => goalForDate(goal, history, day))
      .filter((goal) => goal.goal_mode !== 'weekly' && scheduledFor(goal, day))
      .map((goal) => ({ goal, day: localKey(day) })),
  )
}

// Weekly-frequency goals count visits, not assigned weekdays. Keep each day's
// historical version so changes to a goal never rewrite earlier weeks.
export function weeklyEntries(
  goals: Goal[],
  completions: Completion[],
  monday: Date,
  history: GoalHistory[] = [],
  dayDetails: GoalDayDetail[] = [],
  through?: Date,
) {
  return goals.flatMap((original) => {
    const eligible = weekDays(monday)
      .map((date) => ({ date, goal: goalForDate(original, history, date) }))
      .filter(({ date, goal }) => goal.goal_mode === 'weekly' && scheduledFor(goal, date))
    if (!eligible.length) return []
    const latest = eligible.at(-1)!.goal
    const completed = eligible.filter(
      ({ date, goal }) =>
        (!through || localKey(date) <= localKey(through)) &&
        isGoalDone(goal, localKey(date), completions, dayDetails),
    ).length
    return [
      { goal: latest, target: Math.min(latest.weekly_target || 1, eligible.length), completed },
    ]
  })
}

export function weekStats(
  goals: Goal[],
  completions: Completion[],
  monday: Date,
  history: GoalHistory[] = [],
  dayDetails: GoalDayDetail[] = [],
) {
  const scheduled = scheduledEntries(goals, monday, history)
  const done = scheduled.filter(({ goal, day }) => isGoalDone(goal, day, completions, dayDetails))
  const weekly = weeklyEntries(goals, completions, monday, history, dayDetails)
  const total = scheduled.length + weekly.reduce((sum, entry) => sum + entry.target, 0)
  const completed =
    done.length + weekly.reduce((sum, entry) => sum + Math.min(entry.completed, entry.target), 0)
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    points:
      done.reduce((sum, entry) => sum + entry.goal.points, 0) +
      weekly
        .filter((entry) => entry.completed >= entry.target)
        .reduce((sum, entry) => sum + entry.goal.points, 0),
  }
}

export function weekPace(
  goals: Goal[],
  completions: Completion[],
  monday: Date,
  today: Date,
  history: GoalHistory[] = [],
  dayDetails: GoalDayDetail[] = [],
) {
  const entries = scheduledEntries(goals, monday, history)
  const due = entries.filter(({ day }) => day <= localKey(today))
  const weekly =
    localKey(monday) <= localKey(today)
      ? weeklyEntries(goals, completions, monday, history, dayDetails, today)
      : []
  const completed =
    due.filter(({ goal, day }) => isGoalDone(goal, day, completions, dayDetails)).length +
    weekly.reduce((sum, entry) => sum + Math.min(entry.completed, entry.target), 0)
  const total = due.length + weekly.reduce((sum, entry) => sum + entry.target, 0)
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    upcoming:
      entries.length -
      due.length +
      (localKey(monday) > localKey(today)
        ? weeklyEntries(goals, completions, monday, history, dayDetails).reduce(
            (sum, entry) => sum + entry.target,
            0,
          )
        : 0),
  }
}
