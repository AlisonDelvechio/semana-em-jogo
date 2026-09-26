import { createClient } from '@supabase/supabase-js'
import type { Completion, Goal, GoalHistory, GoalInput } from '../types'
import { localKey } from './dates'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudEnabled = Boolean(url && key)
export const supabase = cloudEnabled ? createClient(url, key) : null
const STORAGE_KEY = 'semana-em-jogo-v1'
type LocalData = { goals: Goal[]; completions: Completion[]; history: GoalHistory[] }

function readLocal(): LocalData {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<LocalData>
    return { goals: data.goals || [], completions: data.completions || [], history: data.history || [] }
  } catch {
    return { goals: [], completions: [], history: [] }
  }
}
function saveLocal(data: LocalData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
function errorIfPresent(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function loadData(): Promise<LocalData> {
  if (!supabase) return readLocal()
  const [goals, completions, history] = await Promise.all([
    supabase.from('goal_templates').select('*').order('created_at'),
    supabase.from('goal_completions').select('*'),
    supabase.from('goal_history').select('*'),
  ])
  errorIfPresent(goals.error)
  errorIfPresent(completions.error)
  errorIfPresent(history.error)
  return {
    goals: goals.data as Goal[],
    completions: completions.data as Completion[],
    history: history.data as GoalHistory[],
  }
}

function snapshot(goal: Goal, validUntil: string): GoalHistory {
  return {
    goal_id: goal.id,
    user_id: goal.user_id,
    valid_until: validUntil,
    title: goal.title,
    category: goal.category,
    scheduled_weekdays: [...goal.scheduled_weekdays],
    points: goal.points,
    active: goal.active,
  }
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  if (!supabase) {
    const data = readLocal()
    const goal: Goal = {
      ...input,
      id: crypto.randomUUID(),
      user_id: 'local',
      created_at: new Date().toISOString(),
    }
    data.goals.push(goal)
    saveLocal(data)
    return goal
  }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  errorIfPresent(userError)
  if (!userData.user) throw new Error('Entre na sua conta para salvar a meta.')
  const { data, error } = await supabase
    .from('goal_templates')
    .insert({ ...input, user_id: userData.user.id })
    .select()
    .single()
  errorIfPresent(error)
  return data as Goal
}

export async function updateGoal(id: string, input: GoalInput): Promise<void> {
  const today = localKey(new Date())
  if (!supabase) {
    const data = readLocal()
    const previous = data.goals.find((goal) => goal.id === id)
    if (!previous) throw new Error('Meta não encontrada.')
    if (!data.history.some((entry) => entry.goal_id === id && entry.valid_until === today))
      data.history.push(snapshot(previous, today))
    data.goals = data.goals.map((goal) => (goal.id === id ? { ...goal, ...input } : goal))
    saveLocal(data)
    return
  }
  const { data: previous, error: readError } = await supabase
    .from('goal_templates')
    .select('*')
    .eq('id', id)
    .single()
  errorIfPresent(readError)
  const { error: historyError } = await supabase
    .from('goal_history')
    .upsert(snapshot(previous as Goal, today), {
      onConflict: 'goal_id,valid_until',
      ignoreDuplicates: true,
    })
  errorIfPresent(historyError)
  const { error } = await supabase.from('goal_templates').update(input).eq('id', id)
  errorIfPresent(error)
}

export async function deleteGoal(id: string): Promise<void> {
  if (!supabase) {
    const data = readLocal()
    data.goals = data.goals.filter((goal) => goal.id !== id)
    data.completions = data.completions.filter((entry) => entry.goal_id !== id)
    data.history = data.history.filter((entry) => entry.goal_id !== id)
    saveLocal(data)
    return
  }
  const { error } = await supabase.from('goal_templates').delete().eq('id', id)
  errorIfPresent(error)
}

export async function setCompleted(
  goalId: string,
  date: string,
  completed: boolean,
): Promise<void> {
  if (!supabase) {
    const data = readLocal()
    data.completions = data.completions.filter(
      (entry) => !(entry.goal_id === goalId && entry.local_date === date),
    )
    if (completed)
      data.completions.push({
        id: crypto.randomUUID(),
        user_id: 'local',
        goal_id: goalId,
        local_date: date,
        completed_at: new Date().toISOString(),
      })
    saveLocal(data)
    return
  }
  if (completed) {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    errorIfPresent(userError)
    if (!userData.user) throw new Error('Sua sessão expirou. Entre novamente.')
    const { error } = await supabase
      .from('goal_completions')
      .upsert(
        { user_id: userData.user.id, goal_id: goalId, local_date: date },
        { onConflict: 'goal_id,local_date' },
      )
    errorIfPresent(error)
  } else {
    const { error } = await supabase
      .from('goal_completions')
      .delete()
      .eq('goal_id', goalId)
      .eq('local_date', date)
    errorIfPresent(error)
  }
}
