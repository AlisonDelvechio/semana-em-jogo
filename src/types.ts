export type Category = 'alimentacao' | 'treino' | 'outro'
export interface Goal {
  id: string
  user_id: string
  title: string
  category: Category
  scheduled_weekdays: number[]
  points: number
  active: boolean
  created_at: string
}
export interface Completion {
  id: string
  user_id: string
  goal_id: string
  local_date: string
  completed_at: string
}
export interface GoalHistory {
  goal_id: string
  user_id: string
  valid_until: string
  title: string
  category: Category
  scheduled_weekdays: number[]
  points: number
  active: boolean
}
export type GoalInput = Pick<
  Goal,
  'title' | 'category' | 'scheduled_weekdays' | 'points' | 'active'
>
