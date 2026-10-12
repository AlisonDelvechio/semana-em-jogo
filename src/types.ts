export type Category = 'alimentacao' | 'treino' | 'outro'
export type GoalMode = 'fixed' | 'weekly'
export interface Goal {
  id: string
  user_id: string
  title: string
  category: Category
  scheduled_weekdays: number[]
  goal_mode?: GoalMode
  weekly_target?: number
  start_date?: string | null
  duration_days?: number | null
  points: number
  active: boolean
  meal_options: MealOption[]
  meal_options_by_weekday: Record<string, MealOption[]>
  checklist_options?: MealOption[]
  checklist_options_by_weekday?: Record<string, MealOption[]>
  created_at: string
}
export interface Completion {
  id: string
  user_id: string
  goal_id: string
  local_date: string
  completed_at: string
}
export interface MealOption {
  id: string
  label: string
}
export const defaultMealOptions: MealOption[] = [
  { id: 'cafe', label: 'Café da manhã' },
  { id: 'almoco', label: 'Almoço' },
  { id: 'lanche', label: 'Lanche da tarde' },
  { id: 'jantar', label: 'Jantar' },
]
export const legacyMealOptions = defaultMealOptions.filter(({ id }) => id !== 'cafe')
export type MealEntries = Record<
  string,
  { checked: boolean; description: string; adherent?: boolean | null }
>
export interface GoalDayDetail {
  goal_id: string
  user_id: string
  local_date: string
  meals: MealEntries
  meal_options: MealOption[]
  checklist_options?: MealOption[]
  checklist?: MealEntries
  adherence_recorded?: boolean
  note: string
}
export interface GoalHistory {
  goal_id: string
  user_id: string
  valid_until: string
  title: string
  category: Category
  scheduled_weekdays: number[]
  goal_mode?: GoalMode
  weekly_target?: number
  start_date?: string | null
  duration_days?: number | null
  points: number
  active: boolean
  meal_options: MealOption[]
  meal_options_by_weekday: Record<string, MealOption[]>
  checklist_options?: MealOption[]
  checklist_options_by_weekday?: Record<string, MealOption[]>
}
export type GoalInput = Pick<
  Goal,
  | 'title'
  | 'category'
  | 'scheduled_weekdays'
  | 'points'
  | 'active'
  | 'meal_options'
  | 'meal_options_by_weekday'
> & {
  goal_mode: GoalMode
  weekly_target: number
  start_date: string | null
  duration_days: number | null
  checklist_options: MealOption[]
  checklist_options_by_weekday: Record<string, MealOption[]>
}
