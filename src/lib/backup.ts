import {
  defaultMealOptions,
  type Completion,
  type Goal,
  type GoalDayDetail,
  type GoalHistory,
  type MealEntries,
  type MealAdherence,
  type MealOption,
} from '../types'
import { localKey } from './dates'
import type { BackupRecord } from './report'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const date = /^\d{4}-\d{2}-\d{2}$/
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Dados de restauração inválidos.')
  return value as Record<string, unknown>
}
const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Texto inválido no backup.')
  return value
}
const day = (value: unknown): string => {
  const key = text(value, 10)
  // Compare in local time: toISOString() is UTC and shifts noon to the previous day
  // in zones at UTC+12 or beyond (e.g. New Zealand in summer), rejecting valid dates.
  const parsed = new Date(`${key}T12:00:00`)
  if (!date.test(key) || Number.isNaN(parsed.getTime()) || localKey(parsed) !== key)
    throw new Error('Data inválida no backup.')
  return key
}
const id = (value: unknown): string => {
  const result = text(value, 36)
  if (!uuid.test(result)) throw new Error('ID inválido no backup.')
  return result
}
const options = (value: unknown, allowEmpty = true): MealOption[] => {
  if (!Array.isArray(value) || value.length > 12 || (!allowEmpty && !value.length))
    throw new Error('Itens inválidos no backup.')
  const result = value.map((item) => ({
    id: text(object(item).id, 80),
    label: text(object(item).label, 40),
  }))
  if (
    new Set(result.map((item) => item.id)).size !== result.length ||
    result.some((item) => !item.id || !item.label)
  )
    throw new Error('Itens repetidos ou vazios no backup.')
  return result
}
const weekdayOptions = (value: unknown): Record<string, MealOption[]> => {
  const entries = Object.entries(object(value || {}))
  if (entries.some(([key]) => !/^[0-6]$/.test(key)))
    throw new Error('Dia da semana inválido no backup.')
  return Object.fromEntries(entries.map(([key, val]) => [key, options(val)]))
}
const entries = (value: unknown): MealEntries => {
  const pairs = Object.entries(object(value || {}))
  if (pairs.length > 12) throw new Error('Muitas opções em um dia do backup.')
  return Object.fromEntries(
    pairs.map(([key, val]) => {
      const item = object(val)
      if (
        typeof item.checked !== 'boolean' ||
        (item.adherent !== undefined &&
          item.adherent !== null &&
          item.adherent !== 'free' &&
          typeof item.adherent !== 'boolean')
      )
        throw new Error('Marcação inválida no backup.')
      return [
        text(key, 80),
        {
          checked: item.checked,
          description: text(item.description || '', 300),
          ...(item.adherent === undefined ? {} : { adherent: item.adherent as MealAdherence }),
        },
      ]
    }),
  )
}
const plan = (value: unknown) => {
  const item = object(value)
  const category = text(item.category, 20)
  const goalMode = item.goal_mode || 'fixed'
  const days = item.scheduled_weekdays
  if (
    !['alimentacao', 'treino', 'outro'].includes(category) ||
    !['fixed', 'weekly'].includes(String(goalMode)) ||
    (goalMode === 'weekly' && category === 'alimentacao') ||
    !Array.isArray(days) ||
    !days.length ||
    days.length > 7 ||
    days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    !Number.isInteger(item.points) ||
    Number(item.points) < 1 ||
    Number(item.points) > 100 ||
    typeof item.active !== 'boolean'
  )
    throw new Error('Configuração de meta inválida no backup.')
  const start = item.start_date == null ? null : day(item.start_date)
  const duration = item.duration_days == null ? null : item.duration_days
  if (
    (start === null) !== (duration === null) ||
    (duration !== null &&
      (!Number.isInteger(duration) || Number(duration) < 1 || Number(duration) > 365))
  )
    throw new Error('Período inválido no backup.')
  const weekly = item.weekly_target || 1
  const freeMeals = item.free_meals_per_week ?? 0
  if (!Number.isInteger(freeMeals) || Number(freeMeals) < 0 || Number(freeMeals) > 84)
    throw new Error('Limite de refeições livres inválido no backup.')
  if (!Number.isInteger(weekly) || Number(weekly) < 1 || Number(weekly) > 7)
    throw new Error('Frequência inválida no backup.')
  const title = text(item.title, 100)
  if (!title.trim()) throw new Error('Meta sem título no backup.')
  return {
    title,
    category: category as Goal['category'],
    goal_mode: goalMode as Goal['goal_mode'],
    scheduled_weekdays: days as number[],
    points: item.points as number,
    active: item.active,
    weekly_target: weekly as number,
    free_meals_per_week: freeMeals as number,
    start_date: start,
    duration_days: duration as number | null,
    meal_options: options(item.meal_options || defaultMealOptions, false),
    meal_options_by_weekday: weekdayOptions(item.meal_options_by_weekday),
    checklist_options: options(item.checklist_options || []),
    checklist_options_by_weekday: weekdayOptions(item.checklist_options_by_weekday),
  }
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false
  const input = csv.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') {
        quoted = false
        closed = true
      } else cell += c
    } else if (c === '"' && !cell && !closed) quoted = true
    else if (c === ';' || c === '\n') {
      row.push(cell)
      cell = ''
      closed = false
      if (c === '\n') {
        rows.push(row)
        row = []
      }
    } else if (c === '\r' && input[i + 1] === '\n') continue
    else if (closed) throw new Error('CSV malformado.')
    else cell += c
  }
  if (quoted) throw new Error('CSV incompleto.')
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function parseGoalBackup(csv: string): BackupRecord[] {
  if (csv.length > 20_000_000) throw new Error('Arquivo muito grande (máximo de 20 MB).')
  const rows = parseCsv(csv)
  const backupIndex = rows[0]?.indexOf('Dados para restauração') ?? -1
  if (!rows.length || rows[0]?.[0] !== 'Data' || backupIndex < 0)
    throw new Error(
      'Este CSV não contém os dados de restauração. Exporte novamente pela versão atual do app.',
    )
  const found = new Set<string>()
  const result: BackupRecord[] = []
  for (const row of rows.slice(1)) {
    if (row.length !== rows[0]!.length) throw new Error('Colunas incompletas no CSV.')
    if (!row[backupIndex]) continue
    let raw: Record<string, unknown>
    try {
      raw = object(JSON.parse(row[backupIndex]))
    } catch {
      throw new Error('Dados de restauração inválidos no CSV.')
    }
    if (raw.version !== 1) throw new Error('Versão de backup não reconhecida.')
    const savedGoal = object(raw.goal)
    const goalId = id(savedGoal.id)
    if (found.has(goalId)) throw new Error('Meta duplicada no backup.')
    found.add(goalId)
    const createdAt = text(savedGoal.created_at, 40)
    if (Number.isNaN(Date.parse(createdAt))) throw new Error('Criação inválida no backup.')
    const goal: Goal = { ...plan(savedGoal), id: goalId, user_id: '', created_at: createdAt }
    if (
      !Array.isArray(raw.history) ||
      !Array.isArray(raw.completions) ||
      !Array.isArray(raw.dayDetails)
    )
      throw new Error('Listas inválidas no backup.')
    const history: GoalHistory[] = raw.history.map((value) => {
      const item = object(value)
      if (id(item.goal_id) !== goalId) throw new Error('Histórico de outra meta no backup.')
      return { ...plan(item), goal_id: goalId, user_id: '', valid_until: day(item.valid_until) }
    })
    const completions: Completion[] = raw.completions.map((value) => {
      const item = object(value)
      if (id(item.goal_id) !== goalId) throw new Error('Conclusão de outra meta no backup.')
      const completedAt = text(item.completed_at, 40)
      // Reject here instead of failing halfway through the database inserts.
      if (Number.isNaN(Date.parse(completedAt)))
        throw new Error('Horário de conclusão inválido no backup.')
      return {
        id: id(item.id),
        goal_id: goalId,
        user_id: '',
        local_date: day(item.local_date),
        completed_at: completedAt,
      }
    })
    const dayDetails: GoalDayDetail[] = raw.dayDetails.map((value) => {
      const item = object(value)
      const override = item.free_meals_limit_override ?? null
      if (
        override !== null &&
        (!Number.isInteger(override) || Number(override) < 0 || Number(override) > 84)
      )
        throw new Error('Correção de limite inválida no backup.')
      if (id(item.goal_id) !== goalId) throw new Error('Detalhe de outra meta no backup.')
      return {
        goal_id: goalId,
        user_id: '',
        local_date: day(item.local_date),
        meals: entries(item.meals),
        meal_options: options(item.meal_options || defaultMealOptions, false),
        checklist: entries(item.checklist),
        checklist_options: options(item.checklist_options || []),
        adherence_recorded: item.adherence_recorded === true,
        free_meals_limit_override: override as number | null,
        note: text(item.note || '', 500),
      }
    })
    result.push({ version: 1, goal, history, completions, dayDetails })
  }
  if (!result.length) throw new Error('Nenhuma meta encontrada no backup.')
  return result
}
