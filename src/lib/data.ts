import { createClient } from '@supabase/supabase-js'
import {
  defaultMealOptions,
  legacyMealOptions,
  type Completion,
  type Goal,
  type GoalDayDetail,
  type GoalHistory,
  type GoalInput,
  type MealEntries,
  type MealOption,
} from '../types'
import { localKey } from './dates'
import { retryFutureJwtRead } from './auth-retry'
import type { BackupRecord } from './report'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudEnabled = Boolean(url && key)
export const supabase = cloudEnabled ? createClient(url, key) : null
const STORAGE_KEY = 'semana-em-jogo-v1'
type LocalData = {
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}

export function emptyMeals(options: MealOption[] = defaultMealOptions): MealEntries {
  return Object.fromEntries(options.map(({ id }) => [id, { checked: false, description: '' }]))
}

// Keep unreadable local data aside before the app writes over it, so a damaged
// value can still be recovered manually instead of being replaced by an empty store.
export const CORRUPTED_KEY_PREFIX = `${STORAGE_KEY}-corrompido-`
function preserveCorrupted(raw: string | null) {
  if (!raw) return
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    const alreadySaved = keys.some(
      (key) => key?.startsWith(CORRUPTED_KEY_PREFIX) && localStorage.getItem(key) === raw,
    )
    if (!alreadySaved) localStorage.setItem(`${CORRUPTED_KEY_PREFIX}${Date.now()}`, raw)
  } catch {
    // Storage unavailable or full: nothing else can be preserved here.
  }
}
function readLocal(): LocalData {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Formato local inválido.')
    const data = parsed as Partial<LocalData>
    return {
      goals: (data.goals || []).map((goal) => ({
        ...goal,
        meal_options: goal.meal_options || defaultMealOptions,
        meal_options_by_weekday: goal.meal_options_by_weekday || {},
        checklist_options: goal.checklist_options || [],
        checklist_options_by_weekday: goal.checklist_options_by_weekday || {},
        goal_mode: goal.goal_mode || 'fixed',
        weekly_target: goal.weekly_target || 1,
        free_meals_per_week: goal.free_meals_per_week ?? 0,
        start_date: goal.start_date || null,
        duration_days: goal.duration_days || null,
      })),
      completions: data.completions || [],
      history: (data.history || []).map((entry) => ({
        ...entry,
        meal_options: entry.meal_options || legacyMealOptions,
        meal_options_by_weekday: entry.meal_options_by_weekday || {},
        checklist_options: entry.checklist_options || [],
        checklist_options_by_weekday: entry.checklist_options_by_weekday || {},
        goal_mode: entry.goal_mode || 'fixed',
        weekly_target: entry.weekly_target || 1,
        free_meals_per_week: entry.free_meals_per_week ?? 0,
        start_date: entry.start_date || null,
        duration_days: entry.duration_days || null,
      })),
      dayDetails: (data.dayDetails || []).map((entry) => ({
        ...entry,
        meal_options: entry.meal_options || legacyMealOptions,
        checklist_options: entry.checklist_options || [],
        checklist: entry.checklist || {},
        adherence_recorded: entry.adherence_recorded || false,
      })),
    }
  } catch {
    preserveCorrupted(raw)
    return { goals: [], completions: [], history: [], dayDetails: [] }
  }
}
function saveLocal(data: LocalData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
function errorIfPresent(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// PostgREST caps each response (1000 rows by default, configurable per project)
// without signalling truncation. Page with a stable order until the exact count
// is reached so calendars, reports and backups never silently lose old records.
export const PAGE_SIZE = 1000
async function readAll<T>(
  client: NonNullable<typeof supabase>,
  table: string,
  orderBy: string[],
): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    let query = client.from(table).select('*', { count: 'exact' })
    for (const column of orderBy) query = query.order(column)
    const { data, error, count } = await query.range(rows.length, rows.length + PAGE_SIZE - 1)
    errorIfPresent(error)
    const page = (data || []) as T[]
    rows.push(...page)
    // Stop on an empty page as well: rows may be deleted between requests.
    if (!page.length || count == null || rows.length >= count) return rows
  }
}

export async function loadData(): Promise<LocalData> {
  if (!supabase) return readLocal()
  const client = supabase
  return retryFutureJwtRead(async () => {
    const [goals, completions, history, dayDetails] = await Promise.all([
      readAll<Goal>(client, 'goal_templates', ['created_at', 'id']),
      readAll<Completion>(client, 'goal_completions', ['local_date', 'id']),
      readAll<GoalHistory>(client, 'goal_history', ['goal_id', 'valid_until']),
      readAll<GoalDayDetail>(client, 'goal_day_details', ['local_date', 'goal_id']),
    ])
    return { goals, completions, history, dayDetails }
  })
}

function snapshot(goal: Goal, validUntil: string): GoalHistory {
  return {
    goal_id: goal.id,
    user_id: goal.user_id,
    valid_until: validUntil,
    title: goal.title,
    category: goal.category,
    scheduled_weekdays: [...goal.scheduled_weekdays],
    goal_mode: goal.goal_mode || 'fixed',
    weekly_target: goal.weekly_target || 1,
    free_meals_per_week: goal.free_meals_per_week ?? 0,
    start_date: goal.start_date || null,
    duration_days: goal.duration_days || null,
    points: goal.points,
    active: goal.active,
    meal_options: goal.meal_options || defaultMealOptions,
    meal_options_by_weekday: goal.meal_options_by_weekday || {},
    checklist_options: goal.checklist_options || [],
    checklist_options_by_weekday: goal.checklist_options_by_weekday || {},
  }
}

function validateFreeMealLimit(input: GoalInput) {
  const limit = input.free_meals_per_week ?? 0
  if (!Number.isInteger(limit) || limit < 0 || limit > 84)
    throw new Error('Escolha de 0 a 84 refeições livres por semana.')
}

type ApiError = { message: string; code?: string } | null
// Migration 010 may not be applied yet when a new build is published.
// In that case keep working with the previous step-by-step writes.
export function isMissingFunction(error: ApiError): boolean {
  return error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '')
}

// The session is already in memory/storage; RLS validates the token on every request,
// so writes do not need an extra round trip to the auth server.
async function currentUserId(missingMessage: string): Promise<string> {
  const { data, error } = await supabase!.auth.getSession()
  errorIfPresent(error)
  const id = data.session?.user.id
  if (!id) throw new Error(missingMessage)
  return id
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  validateFreeMealLimit(input)
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
  const userId = await currentUserId('Entre na sua conta para salvar a meta.')
  const { data, error } = await supabase
    .from('goal_templates')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  errorIfPresent(error)
  return data as Goal
}

export async function updateGoal(id: string, input: GoalInput): Promise<void> {
  validateFreeMealLimit(input)
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
  // Snapshot and update run in one transaction (supabase/migrations/010_atomic_writes.sql).
  const { error: rpcError } = await supabase.rpc('update_goal_with_history', {
    p_goal_id: id,
    p_input: input,
    p_today: today,
  })
  if (!isMissingFunction(rpcError)) return errorIfPresent(rpcError)

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
    data.dayDetails = data.dayDetails.filter((entry) => entry.goal_id !== id)
    saveLocal(data)
    return
  }
  const { error } = await supabase.from('goal_templates').delete().eq('id', id)
  errorIfPresent(error)
}

type DayDetailInput = Omit<GoalDayDetail, 'user_id'>

// Validates and trims one day record. Shared by every write path so local mode,
// the atomic RPC and the fallback store exactly the same shape.
function normalizeDayDetail(detail: DayDetailInput): DayDetailInput {
  const override = detail.free_meals_limit_override
  if (override != null && (!Number.isInteger(override) || override < 0 || override > 84))
    throw new Error('Escolha de 0 a 84 refeições livres para corrigir este dia.')
  const meal_options = detail.meal_options.map(({ id, label }) => ({ id, label: label.trim() }))
  const checklist_options = (detail.checklist_options || []).map(({ id, label }) => ({
    id,
    label: label.trim(),
  }))
  if (
    meal_options.length < 1 ||
    meal_options.length > 12 ||
    meal_options.some(({ id, label }) => !id || !label || label.length > 40) ||
    new Set(meal_options.map(({ id }) => id)).size !== meal_options.length
  )
    throw new Error('Escolha de 1 a 12 refeições com nomes de até 40 caracteres.')
  if (
    checklist_options.length > 12 ||
    checklist_options.some(({ id, label }) => !id || !label || label.length > 40) ||
    new Set(checklist_options.map(({ id }) => id)).size !== checklist_options.length
  )
    throw new Error('Escolha até 12 itens de checklist com nomes de até 40 caracteres.')
  const meals = Object.fromEntries(
    meal_options.map(({ id }) => [
      id,
      {
        checked: Boolean(detail.meals[id]?.checked),
        description: detail.meals[id]?.description.trim().slice(0, 300) || '',
        ...(detail.adherence_recorded
          ? { adherent: detail.meals[id]?.checked ? (detail.meals[id]?.adherent ?? null) : null }
          : {}),
      },
    ]),
  ) as MealEntries
  const checklist = Object.fromEntries(
    checklist_options.map(({ id }) => [
      id,
      {
        checked: Boolean(detail.checklist?.[id]?.checked),
        description: detail.checklist?.[id]?.description.trim().slice(0, 300) || '',
      },
    ]),
  ) as MealEntries
  return {
    goal_id: detail.goal_id,
    local_date: detail.local_date,
    meal_options,
    meals,
    adherence_recorded: Boolean(detail.adherence_recorded),
    free_meals_limit_override: override ?? null,
    checklist_options,
    checklist,
    note: detail.note.trim().slice(0, 500),
  }
}

function putLocalDetail(data: LocalData, detail: DayDetailInput) {
  if (!data.goals.some((goal) => goal.id === detail.goal_id))
    throw new Error('Meta não encontrada.')
  data.dayDetails = data.dayDetails.filter(
    (entry) => !(entry.goal_id === detail.goal_id && entry.local_date === detail.local_date),
  )
  data.dayDetails.push({ ...detail, user_id: 'local' })
}

function putLocalCompletion(data: LocalData, goalId: string, date: string, completed: boolean) {
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
}

export async function saveDayDetail(input: DayDetailInput): Promise<void> {
  const detail = normalizeDayDetail(input)
  if (!supabase) {
    const data = readLocal()
    putLocalDetail(data, detail)
    saveLocal(data)
    return
  }
  const userId = await currentUserId('Sua sessão expirou. Entre novamente.')
  const { error } = await supabase
    .from('goal_day_details')
    .upsert({ ...detail, user_id: userId }, { onConflict: 'goal_id,local_date' })
  errorIfPresent(error)
}

export async function setCompleted(
  goalId: string,
  date: string,
  completed: boolean,
): Promise<void> {
  if (!supabase) {
    const data = readLocal()
    putLocalCompletion(data, goalId, date, completed)
    saveLocal(data)
    return
  }
  if (completed) {
    const userId = await currentUserId('Sua sessão expirou. Entre novamente.')
    const { error } = await supabase
      .from('goal_completions')
      .upsert(
        { user_id: userId, goal_id: goalId, local_date: date },
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

export type DayEntry = {
  detail: DayDetailInput
  // undefined keeps the current completion untouched (food goals derive it from meals).
  completed?: boolean
  // Version of the record when the day was opened: its updated_at, or null when there was
  // no record yet. The database refuses the save if another device changed it since
  // (migration 011). undefined skips the check.
  expectedUpdatedAt?: string | null
}

// Saves every goal of one date together: either all records are stored or none is.
export async function saveDay(localDate: string, entries: DayEntry[]): Promise<void> {
  const details = entries.map(({ detail }) => {
    if (detail.local_date !== localDate) throw new Error('Data inconsistente no registro do dia.')
    return normalizeDayDetail(detail)
  })
  const completions = entries.flatMap(({ detail, completed }) =>
    completed === undefined ? [] : [{ goal_id: detail.goal_id, completed }],
  )
  if (!supabase) {
    const data = readLocal()
    details.forEach((detail) => putLocalDetail(data, detail))
    completions.forEach(({ goal_id, completed }) =>
      putLocalCompletion(data, goal_id, localDate, completed),
    )
    saveLocal(data)
    return
  }
  const { error } = await supabase.rpc('save_day', {
    p_local_date: localDate,
    p_details: details.map((detail, index) => {
      const expected = entries[index]!.expectedUpdatedAt
      return expected === undefined ? detail : { ...detail, expected_updated_at: expected }
    }),
    p_completions: completions,
  })
  if (!isMissingFunction(error)) return errorIfPresent(error)
  for (const detail of details) await saveDayDetail(detail)
  for (const { goal_id, completed } of completions)
    await setCompleted(goal_id, localDate, completed)
}

// Deterministic UUID-shaped id for a goal restored into an account where its
// original id already belongs to someone else. Being deterministic keeps a second
// import of the same file idempotent. (cyrb128: fast, non-cryptographic.)
export function scopedGoalId(userId: string, goalId: string): string {
  const input = `semana-em-jogo:${userId}:${goalId}`
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  const hex = [h1, h2, h3, h4].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('')
  // Mark as a version-4/variant-1 UUID so database and backup validation accept it.
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const IMPORT_BATCH = 500
async function insertMissing(table: string, rows: object[], onConflict: string) {
  for (let start = 0; start < rows.length; start += IMPORT_BATCH) {
    const { error } = await supabase!
      .from(table)
      .upsert(rows.slice(start, start + IMPORT_BATCH), { onConflict, ignoreDuplicates: true })
    errorIfPresent(error)
  }
}

// Merge only missing records. An older backup cannot overwrite newer account data.
export async function importGoalBackup(records: BackupRecord[]) {
  const existing = await loadData()
  const goals = new Set(existing.goals.map((item) => item.id))
  const history = new Set(existing.history.map((item) => `${item.goal_id}:${item.valid_until}`))
  const details = new Set(existing.dayDetails.map((item) => `${item.goal_id}:${item.local_date}`))
  const completions = new Set(
    existing.completions.map((item) => `${item.goal_id}:${item.local_date}`),
  )
  const counts = { goals: 0, history: 0, dayDetails: 0, completions: 0 }
  const userId = supabase ? await currentUserId('Entre na sua conta antes de importar.') : 'local'
  for (const record of records) {
    let goalId = record.goal.id
    // Restoring into another account: the original id may already be taken there.
    if (supabase && !goals.has(goalId) && goals.has(scopedGoalId(userId, goalId)))
      goalId = scopedGoalId(userId, goalId)
    if (!goals.has(goalId)) {
      const goal = { ...record.goal, id: goalId, user_id: userId }
      if (supabase) {
        const { error } = await supabase.from('goal_templates').insert(goal)
        if ((error as ApiError)?.code === '23505') {
          goalId = scopedGoalId(userId, record.goal.id)
          errorIfPresent(
            (await supabase.from('goal_templates').insert({ ...goal, id: goalId })).error,
          )
        } else errorIfPresent(error)
      } else existing.goals.push(goal)
      goals.add(goalId)
      counts.goals++
    }

    // Each key is claimed as soon as it is seen, so duplicates inside one file are skipped too.
    const claim = (seen: Set<string>, key: string) => !seen.has(key) && Boolean(seen.add(key))
    const newHistory = record.history
      .filter((entry) => claim(history, `${goalId}:${entry.valid_until}`))
      .map((entry) => ({ ...entry, goal_id: goalId, user_id: userId }))
    const newDetails = record.dayDetails
      .filter((entry) => claim(details, `${goalId}:${entry.local_date}`))
      .map((entry) => ({ ...entry, goal_id: goalId, user_id: userId }))
    const newCompletions = record.completions
      .filter((entry) => claim(completions, `${goalId}:${entry.local_date}`))
      .map((entry) => ({
        goal_id: goalId,
        local_date: entry.local_date,
        user_id: userId,
        completed_at: entry.completed_at,
      }))

    if (supabase) {
      await insertMissing('goal_history', newHistory, 'goal_id,valid_until')
      await insertMissing('goal_day_details', newDetails, 'goal_id,local_date')
      await insertMissing('goal_completions', newCompletions, 'goal_id,local_date')
    } else {
      existing.history.push(...newHistory)
      existing.dayDetails.push(...newDetails)
      existing.completions.push(
        ...newCompletions.map((entry) => ({ ...entry, id: crypto.randomUUID() })),
      )
    }
    counts.history += newHistory.length
    counts.dayDetails += newDetails.length
    counts.completions += newCompletions.length
  }
  // Local mode writes once, so an invalid record cannot leave a partial import.
  if (!supabase) saveLocal(existing)
  return counts
}
