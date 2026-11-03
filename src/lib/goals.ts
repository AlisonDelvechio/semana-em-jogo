import {
  defaultMealOptions,
  type Category,
  type Goal,
  type GoalHistory,
  type GoalInput,
} from '../types'
import { goalForDate, scheduledFor } from './dates'

export const categoryName = (name: Category | string) =>
  ({ treino: 'Treino', alimentacao: 'Alimentação', outro: 'Outro' })[name as Category]

// Goal versions that apply to a date (history-aware), limited to the scheduled ones.
export const plannedGoals = (goals: Goal[], history: GoalHistory[], date: Date) =>
  goals.map((goal) => goalForDate(goal, history, date)).filter((goal) => scheduledFor(goal, date))

export const emptyGoalInput = (): GoalInput => ({
  title: '',
  category: 'treino',
  scheduled_weekdays: [],
  goal_mode: 'fixed',
  weekly_target: 3,
  free_meals_per_week: 2,
  start_date: null,
  duration_days: null,
  // Legacy column kept by the database and backups; no longer shown in the interface.
  points: 10,
  active: true,
  meal_options: defaultMealOptions.map((option) => ({ ...option })),
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
})

const copyByWeekday = (value: Goal['meal_options_by_weekday'] | undefined) =>
  Object.fromEntries(
    Object.entries(value || {}).map(([day, options]) => [
      day,
      options.map((option) => ({ ...option })),
    ]),
  )

// Editable deep copy of a goal, with defaults for fields added by later migrations.
export const goalToInput = (goal: Goal, weeklyTargetFallback = 3): GoalInput => ({
  title: goal.title,
  category: goal.category,
  scheduled_weekdays: [...goal.scheduled_weekdays],
  goal_mode: goal.goal_mode || 'fixed',
  weekly_target: goal.weekly_target || weeklyTargetFallback,
  free_meals_per_week: goal.free_meals_per_week ?? 0,
  start_date: goal.start_date || null,
  duration_days: goal.duration_days || null,
  points: goal.points,
  active: goal.active,
  meal_options: (goal.meal_options || defaultMealOptions).map((option) => ({ ...option })),
  meal_options_by_weekday: copyByWeekday(goal.meal_options_by_weekday),
  checklist_options: (goal.checklist_options || []).map((option) => ({ ...option })),
  checklist_options_by_weekday: copyByWeekday(goal.checklist_options_by_weekday),
})

export const INVALID_GOAL_MESSAGE = 'Informe nome, frequência e dias válidos.'

// Applies category rules to the editor form and validates it. Returns null when invalid.
export function normalizeGoalInput(form: GoalInput): GoalInput | null {
  const food = form.category === 'alimentacao'
  const input: GoalInput = {
    ...form,
    title: form.title.trim(),
    free_meals_per_week: food ? (form.free_meals_per_week ?? 0) : 0,
    goal_mode: food ? 'fixed' : form.goal_mode,
    scheduled_weekdays:
      form.goal_mode === 'weekly' && !food ? [0, 1, 2, 3, 4, 5, 6] : [...form.scheduled_weekdays],
  }
  const freeMeals = input.free_meals_per_week ?? 0
  const { weekly_target: target, duration_days: duration, start_date: start } = input
  const invalid =
    !input.title ||
    !Number.isInteger(freeMeals) ||
    freeMeals < 0 ||
    freeMeals > 84 ||
    !input.scheduled_weekdays.length ||
    !Number.isInteger(target) ||
    target < 1 ||
    target > 7 ||
    (duration !== null &&
      (!start ||
        !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
        !Number.isInteger(duration) ||
        duration < 1 ||
        duration > 365)) ||
    (start !== null && duration === null) ||
    (input.goal_mode === 'weekly' && duration !== null && duration < target) ||
    (food &&
      (!input.meal_options.length ||
        input.meal_options.length > 12 ||
        Object.values(input.meal_options_by_weekday).some(
          (options) => !options.length || options.length > 12,
        ))) ||
    (!food &&
      (input.checklist_options.length > 12 ||
        Object.values(input.checklist_options_by_weekday).some((options) => options.length > 12)))
  return invalid ? null : input
}
