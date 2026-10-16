<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  ClipboardList,
  Dumbbell,
  Download,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Utensils,
  X,
} from '@lucide/vue'
import {
  cloudEnabled,
  createGoal,
  deleteGoal,
  importGoalBackup,
  loadData,
  saveDayDetail,
  setCompleted,
  supabase,
  updateGoal,
} from './lib/data'
import {
  addDays,
  checklistOptionsForDate,
  fullWeekdays,
  freeMealUsage,
  localKey,
  mondayOf,
  goalForDate,
  goalProgress,
  isGoalDone,
  isMealAllowed,
  mealOptionsForDate,
  scheduledFor,
  weekDays,
  weekPace,
  weekdays,
  weekStats,
  weeklyEntries,
} from './lib/dates'
import { moveMeal } from './lib/meals'
import { parseGoalBackup } from './lib/backup'
import { createGoalReport, type BackupRecord, type ReportRange } from './lib/report'
import MonthView from './views/MonthView.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AppNotice from './components/AppNotice.vue'
import {
  defaultMealOptions,
  type Category,
  type Completion,
  type Goal,
  type GoalDayDetail,
  type GoalHistory,
  type GoalInput,
  type MealEntries,
  type MealOption,
} from './types'

const goals = ref<Goal[]>([]),
  completions = ref<Completion[]>([]),
  history = ref<GoalHistory[]>([])
const dayDetails = ref<GoalDayDetail[]>([])
const monday = ref(mondayOf(new Date())),
  tab = ref<'week' | 'month' | 'goals'>('week')
const loading = ref(true),
  busy = ref(false),
  message = ref('')
const messageIsError = ref(false)
const confirmation = ref<{
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
} | null>(null)
let resolveConfirmation: ((confirmed: boolean) => void) | null = null
function askConfirmation(options: NonNullable<typeof confirmation.value>): Promise<boolean> {
  confirmation.value = options
  return new Promise((resolve) => {
    resolveConfirmation = resolve
  })
}
function finishConfirmation(confirmed: boolean) {
  confirmation.value = null
  resolveConfirmation?.(confirmed)
  resolveConfirmation = null
}
watch(
  message,
  () => {
    messageIsError.value = false
  },
  { flush: 'sync' },
)
const session = ref<Session | null>(null),
  email = ref(''),
  password = ref(''),
  signUp = ref(false)
const editing = ref<string | null>(null)
const selectedDay = ref<Date | null>(null)
const dialogCloseButton = ref<HTMLButtonElement | null>(null)
const dayDialog = ref<HTMLElement | null>(null)
let dayTrigger: HTMLElement | null = null
const editingWeekday = ref<number | null>(null)
const weekdayDraft = ref<MealOption[]>([])
const weekdayMealInput = ref('')
const weekdayModalError = ref('')
const weekdayDialog = ref<HTMLElement | null>(null)
const weekdayCloseButton = ref<HTMLButtonElement | null>(null)
let weekdayTrigger: HTMLElement | null = null
type DayDraft = {
  items: MealEntries
  options: MealOption[]
  note: string
  completed: boolean
  trackAdherence: boolean
  freeMealLimitOverride: number | null
}
const dayDrafts = ref<Record<string, DayDraft>>({})
const newGoalMeal = ref('')
const newGoalChecklist = ref('')
const reportMode = ref<'all' | 'month' | 'range'>('all')
const reportMonth = ref(localKey(new Date()).slice(0, 7))
const reportFrom = ref(localKey(new Date()))
const reportTo = ref(localKey(new Date()))
const pendingBackup = ref<BackupRecord[] | null>(null)
const pendingBackupName = ref('')
const reportMessage = ref('')
const darkMode = ref(document.documentElement.dataset.theme === 'dark')
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (dark: boolean) => {
  darkMode.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#151d19' : '#f8f7f3')
}
const syncSystemTheme = () => {
  try {
    if (localStorage.getItem('semana-em-jogo-theme')) return
  } catch {
    // Mesmo sem armazenamento, a preferência do sistema continua funcionando.
  }
  applyTheme(systemTheme.matches)
}
const toggleTheme = () => {
  applyTheme(!darkMode.value)
  try {
    localStorage.setItem('semana-em-jogo-theme', darkMode.value ? 'dark' : 'light')
  } catch {
    // O tema ainda muda durante esta visita.
  }
}
const newDayMeals = ref<Record<string, string>>({})
const fresh = (): GoalInput => ({
  title: '',
  category: 'treino',
  scheduled_weekdays: [],
  goal_mode: 'fixed',
  weekly_target: 3,
  free_meals_per_week: 2,
  start_date: null,
  duration_days: null,
  points: 10,
  active: true,
  meal_options: defaultMealOptions.map((option) => ({ ...option })),
  meal_options_by_weekday: {},
  checklist_options: [],
  checklist_options_by_weekday: {},
})
const form = ref<GoalInput>(fresh())
watch(tab, async () => {
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'instant' })
})
const days = computed(() => weekDays(monday.value))
const mobileWeek = ref(false)
const mobileQuery = window.matchMedia('(max-width: 720px)')
const syncMobileWeek = () => {
  mobileWeek.value = mobileQuery.matches
}
const visibleDays = computed(() => {
  if (!mobileWeek.value || !current.value) return days.value
  const today = localKey(new Date())
  return [...days.value].sort(
    (a, b) => Number(localKey(b) === today) - Number(localKey(a) === today),
  )
})
const stats = computed(() =>
  weekStats(goals.value, completions.value, monday.value, history.value, dayDetails.value),
)
const pace = computed(() =>
  weekPace(
    goals.value,
    completions.value,
    monday.value,
    new Date(),
    history.value,
    dayDetails.value,
  ),
)
const label = computed(
  () =>
    `${days.value[0]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${days.value[6]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`,
)
const compactWeekLabel = computed(
  () =>
    `${days.value[0]!.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${days.value[6]!.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`,
)
const current = computed(() => localKey(monday.value) === localKey(mondayOf(new Date())))
const future = computed(() => localKey(monday.value) > localKey(mondayOf(new Date())))
const monthLabel = computed(() => {
  const start = days.value[0]!,
    end = days.value[6]!
  const format = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return format(start) === format(end) ? format(start) : `${format(start)} · ${format(end)}`
})
const compactMonthLabel = computed(() => {
  const start = days.value[0]!,
    end = days.value[6]!
  const short = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    ? `${short(start)} ${start.getFullYear()}`
    : `${short(start)} · ${short(end)} ${end.getFullYear()}`
})
const profileName = computed(() => {
  const name = session.value?.user.user_metadata?.full_name
  return typeof name === 'string' && name.trim()
    ? name.trim()
    : session.value?.user.email?.split('@')[0] || 'Você'
})
const profileInitials = computed(() =>
  profileName.value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(''),
)
const categoryName = (name: string) =>
  ({ treino: 'Treino', alimentacao: 'Alimentação', outro: 'Outro' })[
    name as 'treino' | 'alimentacao' | 'outro'
  ]
const errorMessage = (error: unknown) => {
  message.value = error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.'
  messageIsError.value = true
}
const planned = (date: Date) =>
  goals.value
    .map((goal) => goalForDate(goal, history.value, date))
    .filter((goal) => scheduledFor(goal, date))
const activeThisWeek = computed(
  () => new Set(days.value.flatMap((date) => planned(date).map((goal) => goal.id))).size,
)
const weeklyFoodAllowances = computed(() => {
  const versions = new Map<string, Goal>()
  days.value.forEach((date) =>
    planned(date).forEach((goal) => {
      if (goal.category === 'alimentacao') versions.set(goal.id, goal)
    }),
  )
  return [...versions.values()].map((goal) => {
    const { used } = freeMealUsage(goal, localKey(monday.value), dayDetails.value)
    const limit = goal.free_meals_per_week ?? 0
    return { goal, used, limit, excess: Math.max(0, used - limit) }
  })
})
const isDone = (goal: Goal, date: Date) =>
  isGoalDone(goal, localKey(date), completions.value, dayDetails.value)
const daySummary = (date: Date) => {
  const day = localKey(date)
  const entries = planned(date).filter(
    (goal) =>
      goal.goal_mode !== 'weekly' ||
      completions.value.some((entry) => entry.goal_id === goal.id && entry.local_date === day) ||
      dayDetails.value.some((entry) => entry.goal_id === goal.id && entry.local_date === day),
  )
  return { total: entries.length, completed: entries.filter((goal) => isDone(goal, date)).length }
}
const weeklyCount = (goal: Goal, date: Date) =>
  weeklyEntries(
    [goals.value.find((entry) => entry.id === goal.id) || goal],
    completions.value,
    mondayOf(date),
    history.value,
    dayDetails.value,
  )[0]
function downloadReport() {
  let range: ReportRange = {}
  if (reportMode.value === 'month') {
    if (!/^\d{4}-\d{2}$/.test(reportMonth.value)) {
      reportMessage.value = 'Escolha um mês válido.'
      return
    }
    const [year, month] = reportMonth.value.split('-').map(Number)
    range = { from: `${reportMonth.value}-01`, to: localKey(new Date(year!, month!, 0)) }
  } else if (reportMode.value === 'range') {
    if (!reportFrom.value || !reportTo.value || reportFrom.value > reportTo.value) {
      reportMessage.value = 'Escolha um intervalo de datas válido.'
      return
    }
    range = { from: reportFrom.value, to: reportTo.value }
  }
  reportMessage.value = ''
  const csv = createGoalReport(
    goals.value,
    completions.value,
    history.value,
    dayDetails.value,
    new Date(),
    range,
  )
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `semana-em-jogo-relatorio-${localKey(new Date())}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function selectBackup(event: Event) {
  pendingBackup.value = null
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 20_000_000) throw new Error('Arquivo muito grande (máximo de 20 MB).')
    pendingBackup.value = parseGoalBackup(await file.text())
    pendingBackupName.value = file.name
    reportMessage.value = ''
  } catch (error) {
    reportMessage.value = error instanceof Error ? error.message : 'Não foi possível ler o CSV.'
  }
  input.value = ''
}
async function restoreBackup() {
  if (!pendingBackup.value) return
  busy.value = true
  try {
    const result = await importGoalBackup(pendingBackup.value)
    pendingBackup.value = null
    await refresh()
    reportMessage.value = `Importação concluída: ${result.goals} metas, ${result.dayDetails} dias, ${result.completions} conclusões e ${result.history} versões adicionadas.`
  } catch (error) {
    reportMessage.value =
      error instanceof Error ? error.message : 'Não foi possível importar o CSV.'
  } finally {
    busy.value = false
  }
}
function resizeMealDescription(input: HTMLTextAreaElement) {
  input.style.height = 'auto'
  input.style.height = `${input.scrollHeight + 2}px`
}
function openWeekOf(date: Date) {
  monday.value = mondayOf(date)
  selectedDay.value = null
  tab.value = 'week'
}
function goToCurrentWeek() {
  monday.value = mondayOf(new Date())
  tab.value = 'week'
}
const mealCount = (goal: Goal, date: Date) => {
  const detail = dayDetails.value.find(
    (entry) => entry.goal_id === goal.id && entry.local_date === localKey(date),
  )
  const options = detail?.meal_options || mealOptionsForDate(goal, date)
  return {
    checked: detail
      ? options.filter(({ id }) => detail.meals[id]?.checked).length
      : isDone(goal, date)
        ? options.length
        : 0,
    total: options.length,
    adherent: detail?.adherence_recorded
      ? options.filter(({ id }) => isMealAllowed(goal, localKey(date), id, dayDetails.value)).length
      : null,
  }
}
const checklistCount = (goal: Goal, date: Date) => {
  const detail = dayDetails.value.find(
    (entry) => entry.goal_id === goal.id && entry.local_date === localKey(date),
  )
  const options = detail?.checklist_options?.length
    ? detail.checklist_options
    : checklistOptionsForDate(goal, date)
  return {
    checked: detail?.checklist_options?.length
      ? options.filter(({ id }) => detail.checklist?.[id]?.checked).length
      : isDone(goal, date)
        ? options.length
        : 0,
    total: options.length,
  }
}
function addOption(
  options: MealOption[],
  label: string,
  report = (error: string) => {
    message.value = error
  },
): MealOption | null {
  const name = label.trim()
  if (
    !name ||
    name.length > 40 ||
    options.length >= 12 ||
    options.some(
      (item) => item.label.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
    )
  ) {
    report('Use um nome único de até 40 caracteres (máximo de 12 itens).')
    return null
  }
  report('')
  return { id: crypto.randomUUID(), label: name }
}
function addGoalMeal() {
  const option = addOption(form.value.meal_options, newGoalMeal.value)
  if (option) {
    form.value.meal_options.push(option)
    newGoalMeal.value = ''
  }
}
function removeGoalMeal(id: string) {
  if (form.value.meal_options.length > 1)
    form.value.meal_options = form.value.meal_options.filter((option) => option.id !== id)
}
function moveGoalMeal(id: string, offset: -1 | 1) {
  form.value.meal_options = moveMeal(form.value.meal_options, id, offset)
}
function addGoalChecklist() {
  const option = addOption(form.value.checklist_options, newGoalChecklist.value)
  if (option) {
    form.value.checklist_options.push(option)
    newGoalChecklist.value = ''
  }
}
function removeGoalChecklist(id: string) {
  form.value.checklist_options = form.value.checklist_options.filter((option) => option.id !== id)
}
function moveGoalChecklist(id: string, offset: -1 | 1) {
  form.value.checklist_options = moveMeal(form.value.checklist_options, id, offset)
}
const formWeekdayOptions = computed(() =>
  form.value.category === 'alimentacao'
    ? form.value.meal_options_by_weekday
    : form.value.checklist_options_by_weekday,
)
const formDefaultOptions = computed(() =>
  form.value.category === 'alimentacao' ? form.value.meal_options : form.value.checklist_options,
)
function openWeekdayModal(day: number) {
  weekdayTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  editingWeekday.value = day
  weekdayDraft.value = (formWeekdayOptions.value[String(day)] || formDefaultOptions.value).map(
    (option) => ({ ...option }),
  )
  weekdayMealInput.value = ''
  weekdayModalError.value = ''
}
function resetWeekday(day: number) {
  delete formWeekdayOptions.value[String(day)]
}
function addWeekdayMeal() {
  const option = addOption(weekdayDraft.value, weekdayMealInput.value, (error) => {
    weekdayModalError.value = error
  })
  if (option) {
    weekdayDraft.value.push(option)
    weekdayMealInput.value = ''
  }
}
function removeWeekdayMeal(id: string) {
  if (weekdayDraft.value.length > (form.value.category === 'alimentacao' ? 1 : 0))
    weekdayDraft.value = weekdayDraft.value.filter((option) => option.id !== id)
}
function saveWeekdayModal() {
  if (editingWeekday.value === null) return
  formWeekdayOptions.value[String(editingWeekday.value)] = weekdayDraft.value.map((option) => ({
    ...option,
  }))
  editingWeekday.value = null
}
function moveWeekdayMeal(id: string, offset: -1 | 1) {
  weekdayDraft.value = moveMeal(weekdayDraft.value, id, offset)
}
function addDayMeal(goalId: string) {
  const draft = dayDrafts.value[goalId]!
  const option = addOption(draft.options, newDayMeals.value[goalId] || '')
  if (option) {
    draft.options.push(option)
    draft.items[option.id] = { checked: false, description: '' }
    newDayMeals.value[goalId] = ''
  }
}
function removeDayMeal(goalId: string, id: string, category: Category, hasTemplateItems: boolean) {
  const draft = dayDrafts.value[goalId]!
  if (draft.options.length > (category === 'alimentacao' || hasTemplateItems ? 1 : 0)) {
    draft.options = draft.options.filter((option) => option.id !== id)
    delete draft.items[id]
  }
}
function moveDayMeal(goalId: string, id: string, offset: -1 | 1) {
  const draft = dayDrafts.value[goalId]!
  draft.options = moveMeal(draft.options, id, offset)
}
function openDay(date: Date) {
  dayTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  selectedDay.value = date
  message.value = ''
  newDayMeals.value = {}
  dayDrafts.value = Object.fromEntries(
    planned(date).map((goal) => {
      const detail = dayDetails.value.find(
        (entry) => entry.goal_id === goal.id && entry.local_date === localKey(date),
      )
      const completed = isDone(goal, date)
      const options = (
        goal.category === 'alimentacao'
          ? detail?.meal_options || mealOptionsForDate(goal, date)
          : detail?.checklist_options?.length
            ? detail.checklist_options
            : checklistOptionsForDate(goal, date)
      ).map((option) => ({ ...option }))
      const entries = goal.category === 'alimentacao' ? detail?.meals : detail?.checklist
      const items = Object.fromEntries(
        options.map(({ id }) => [
          id,
          {
            checked:
              entries?.[id]?.checked ??
              (completed &&
                (goal.category === 'alimentacao' || !detail?.checklist_options?.length)),
            description: entries?.[id]?.description || '',
            adherent: entries?.[id]?.adherent ?? null,
          },
        ]),
      ) as MealEntries
      return [
        goal.id,
        {
          items,
          options,
          note: detail?.note || '',
          completed,
          trackAdherence: detail?.adherence_recorded ?? !detail,
          freeMealLimitOverride: detail?.free_meals_limit_override ?? null,
        },
      ]
    }),
  )
}
function detailsWithDraft(goal: Goal): GoalDayDetail[] {
  if (!selectedDay.value || !dayDrafts.value[goal.id]) return dayDetails.value
  const day = localKey(selectedDay.value)
  const draft = dayDrafts.value[goal.id]!
  return [
    ...dayDetails.value.filter((detail) => detail.goal_id !== goal.id || detail.local_date !== day),
    {
      goal_id: goal.id,
      user_id: goal.user_id,
      local_date: day,
      meals: draft.items,
      meal_options: draft.options,
      adherence_recorded: draft.trackAdherence,
      free_meals_limit_override: draft.freeMealLimitOverride,
      note: draft.note,
    },
  ]
}
const draftFreeUsage = (goal: Goal) =>
  freeMealUsage(goal, localKey(selectedDay.value!), detailsWithDraft(goal))
const currentFreeMealLimit = (goal: Goal) =>
  goals.value.find((entry) => entry.id === goal.id)?.free_meals_per_week ?? 0
function correctDayLimit(goalId: string, event: Event) {
  dayDrafts.value[goalId]!.freeMealLimitOverride = (event.target as HTMLInputElement).valueAsNumber
}
const draftFreeExceeded = (goal: Goal, id: string) =>
  dayDrafts.value[goal.id]?.items[id]?.checked &&
  dayDrafts.value[goal.id]?.items[id]?.adherent === 'free' &&
  !isMealAllowed(goal, localKey(selectedDay.value!), id, detailsWithDraft(goal))
watch(selectedDay, async (date) => {
  await nextTick()
  if (date) {
    dayDialog.value
      ?.querySelectorAll<HTMLTextAreaElement>('.meal-description')
      .forEach(resizeMealDescription)
    dialogCloseButton.value?.focus()
  } else dayTrigger?.focus()
})
watch(editingWeekday, async (day) => {
  await nextTick()
  if (day !== null) weekdayCloseButton.value?.focus()
  else weekdayTrigger?.focus()
})
function keepModalFocus(event: KeyboardEvent, root: HTMLElement | null) {
  if (event.key !== 'Tab' || !root) return
  const controls = [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    ),
  ]
  const first = controls[0],
    last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
function keepDialogFocus(event: KeyboardEvent) {
  keepModalFocus(event, dayDialog.value)
}
function keepWeekdayFocus(event: KeyboardEvent) {
  keepModalFocus(event, weekdayDialog.value)
}
async function saveDay() {
  if (!selectedDay.value) return
  busy.value = true
  message.value = ''
  try {
    const date = selectedDay.value
    for (const goal of planned(date)) {
      const limit = dayDrafts.value[goal.id]!.freeMealLimitOverride
      if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 84))
        throw new Error('Escolha de 0 a 84 refeições livres para corrigir este dia.')
    }
    for (const goal of planned(date)) {
      const draft = dayDrafts.value[goal.id]!
      await saveDayDetail({
        goal_id: goal.id,
        local_date: localKey(date),
        meals: goal.category === 'alimentacao' ? draft.items : {},
        adherence_recorded: goal.category === 'alimentacao' && draft.trackAdherence,
        free_meals_limit_override:
          goal.category === 'alimentacao' ? draft.freeMealLimitOverride : null,
        meal_options:
          goal.category === 'alimentacao' ? draft.options : goal.meal_options || defaultMealOptions,
        checklist: goal.category === 'alimentacao' ? {} : draft.items,
        checklist_options: goal.category === 'alimentacao' ? [] : draft.options,
        note: draft.note,
      })
      if (goal.category !== 'alimentacao') {
        const completed = draft.options.length
          ? draft.options.every(({ id }) => draft.items[id]?.checked)
          : draft.completed
        if (
          completed !==
          completions.value.some(
            (entry) => entry.goal_id === goal.id && entry.local_date === localKey(date),
          )
        )
          await setCompleted(goal.id, localKey(date), completed)
      }
    }
    selectedDay.value = null
    await refresh()
    message.value = 'Registro do dia salvo.'
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
async function refresh() {
  loading.value = true
  try {
    const result = await loadData()
    goals.value = result.goals
    completions.value = result.completions
    history.value = result.history
    dayDetails.value = result.dayDetails
  } catch (error) {
    errorMessage(error)
  } finally {
    loading.value = false
  }
}
async function auth() {
  if (!supabase) return
  busy.value = true
  message.value = ''
  try {
    if (signUp.value) {
      const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      if (!data.session) message.value = 'Confira seu email para confirmar a conta.'
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
    }
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
function changeDay(day: number) {
  form.value.scheduled_weekdays = form.value.scheduled_weekdays.includes(day)
    ? form.value.scheduled_weekdays.filter((value) => value !== day)
    : [...form.value.scheduled_weekdays, day].sort()
}
function changeMode(event: Event) {
  const mode = (event.target as HTMLSelectElement).value
  form.value.goal_mode = mode === 'weekly' ? 'weekly' : 'fixed'
  form.value.scheduled_weekdays = mode === 'weekly' ? [0, 1, 2, 3, 4, 5, 6] : []
}
function togglePeriod(event: Event) {
  if ((event.target as HTMLInputElement).checked) {
    form.value.start_date = localKey(new Date())
    form.value.duration_days = 14
    if (form.value.goal_mode === 'fixed' && !form.value.scheduled_weekdays.length)
      form.value.scheduled_weekdays = [0, 1, 2, 3, 4, 5, 6]
  } else {
    form.value.start_date = null
    form.value.duration_days = null
  }
}
function switchAuth() {
  signUp.value = !signUp.value
  message.value = ''
}
function cancelEdit() {
  editing.value = null
  form.value = fresh()
}
async function save() {
  message.value = ''
  const input = {
    ...form.value,
    title: form.value.title.trim(),
    free_meals_per_week:
      form.value.category === 'alimentacao' ? (form.value.free_meals_per_week ?? 0) : 0,
    goal_mode: form.value.category === 'alimentacao' ? ('fixed' as const) : form.value.goal_mode,
    scheduled_weekdays:
      form.value.goal_mode === 'weekly' && form.value.category !== 'alimentacao'
        ? [0, 1, 2, 3, 4, 5, 6]
        : [...form.value.scheduled_weekdays],
  }
  if (
    !input.title ||
    !Number.isInteger(input.free_meals_per_week) ||
    input.free_meals_per_week < 0 ||
    input.free_meals_per_week > 84 ||
    !input.scheduled_weekdays.length ||
    !Number.isInteger(input.weekly_target) ||
    input.weekly_target < 1 ||
    input.weekly_target > 7 ||
    (input.duration_days !== null &&
      (!input.start_date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date) ||
        !Number.isInteger(input.duration_days) ||
        input.duration_days < 1 ||
        input.duration_days > 365)) ||
    (input.start_date !== null && input.duration_days === null) ||
    (input.goal_mode === 'weekly' &&
      input.duration_days !== null &&
      input.duration_days < input.weekly_target) ||
    !Number.isInteger(input.points) ||
    input.points < 1 ||
    (input.category === 'alimentacao' &&
      (!input.meal_options.length ||
        input.meal_options.length > 12 ||
        Object.values(input.meal_options_by_weekday).some(
          (options) => !options.length || options.length > 12,
        ))) ||
    (input.category !== 'alimentacao' &&
      (input.checklist_options.length > 12 ||
        Object.values(input.checklist_options_by_weekday).some((options) => options.length > 12)))
  ) {
    message.value = 'Informe nome, frequência, dias e pontos válidos.'
    return
  }
  if (
    editing.value &&
    !(await askConfirmation({
      title: 'Salvar alterações da meta?',
      description:
        'A nova configuração será usada a partir de hoje. Os registros e as configurações anteriores serão preservados.',
      confirmLabel: 'Salvar alterações',
    }))
  )
    return
  busy.value = true
  try {
    if (editing.value) await updateGoal(editing.value, input)
    else await createGoal(input)
    await refresh()
    editing.value = null
    form.value = fresh()
    message.value = 'Meta salva.'
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
function edit(goal: Goal) {
  editing.value = goal.id
  form.value = {
    title: goal.title,
    category: goal.category,
    scheduled_weekdays: [...goal.scheduled_weekdays],
    goal_mode: goal.goal_mode || 'fixed',
    weekly_target: goal.weekly_target || 3,
    free_meals_per_week: goal.free_meals_per_week ?? 0,
    start_date: goal.start_date || null,
    duration_days: goal.duration_days || null,
    points: goal.points,
    active: goal.active,
    meal_options: (goal.meal_options || defaultMealOptions).map((option) => ({ ...option })),
    meal_options_by_weekday: Object.fromEntries(
      Object.entries(goal.meal_options_by_weekday || {}).map(([day, options]) => [
        day,
        options.map((option) => ({ ...option })),
      ]),
    ),
    checklist_options: (goal.checklist_options || []).map((option) => ({ ...option })),
    checklist_options_by_weekday: Object.fromEntries(
      Object.entries(goal.checklist_options_by_weekday || {}).map(([day, options]) => [
        day,
        options.map((option) => ({ ...option })),
      ]),
    ),
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function remove(goal: Goal) {
  if (
    !(await askConfirmation({
      title: 'Excluir meta?',
      description: `“${goal.title}” e todos os seus registros serão excluídos. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir meta',
      danger: true,
    }))
  )
    return
  busy.value = true
  message.value = ''
  try {
    await deleteGoal(goal.id)
    await refresh()
    message.value = 'Meta excluída.'
    if (editing.value === goal.id) {
      editing.value = null
      form.value = fresh()
    }
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
async function pause(goal: Goal) {
  if (
    !(await askConfirmation({
      title: goal.active ? 'Pausar meta?' : 'Retomar meta?',
      description: goal.active
        ? `“${goal.title}” deixará de aparecer nos próximos dias. Os registros anteriores serão preservados.`
        : `“${goal.title}” voltará a aparecer conforme a frequência configurada.`,
      confirmLabel: goal.active ? 'Pausar meta' : 'Retomar meta',
    }))
  )
    return
  busy.value = true
  message.value = ''
  try {
    await updateGoal(goal.id, {
      title: goal.title,
      category: goal.category,
      scheduled_weekdays: goal.scheduled_weekdays,
      goal_mode: goal.goal_mode || 'fixed',
      weekly_target: goal.weekly_target || 1,
      free_meals_per_week: goal.free_meals_per_week ?? 0,
      start_date: goal.start_date || null,
      duration_days: goal.duration_days || null,
      points: goal.points,
      active: !goal.active,
      meal_options: goal.meal_options || defaultMealOptions,
      meal_options_by_weekday: goal.meal_options_by_weekday || {},
      checklist_options: goal.checklist_options || [],
      checklist_options_by_weekday: goal.checklist_options_by_weekday || {},
    })
    await refresh()
    message.value = goal.active ? 'Meta pausada.' : 'Meta retomada.'
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  systemTheme.addEventListener('change', syncSystemTheme)
  syncMobileWeek()
  mobileQuery.addEventListener('change', syncMobileWeek)
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    if (error) errorMessage(error)
    session.value = data.session
    supabase.auth.onAuthStateChange((_event, next) => {
      session.value = next
      if (next) void refresh()
      else {
        goals.value = []
        completions.value = []
        history.value = []
        dayDetails.value = []
        loading.value = false
      }
    })
  }
  if (!cloudEnabled || session.value) await refresh()
  else loading.value = false
})
onUnmounted(() => {
  finishConfirmation(false)
  mobileQuery.removeEventListener('change', syncMobileWeek)
  systemTheme.removeEventListener('change', syncSystemTheme)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><Sparkles :size="19" aria-hidden="true" /></span> semana<span
          >emjogo</span
        >
      </div>
      <div class="top-actions">
        <button
          type="button"
          class="theme-button"
          :aria-label="darkMode ? 'Ativar tema claro' : 'Ativar tema escuro'"
          :title="darkMode ? 'Tema claro' : 'Tema escuro'"
          :aria-pressed="darkMode"
          @click="toggleTheme"
        >
          <Sun v-if="darkMode" :size="19" aria-hidden="true" />
          <Moon v-else :size="19" aria-hidden="true" />
        </button>
        <div v-if="!cloudEnabled || session" class="profile-corner">
          <div class="profile-avatar" aria-hidden="true">{{ session ? profileInitials : 'V' }}</div>
          <div class="profile-copy">
            <strong>{{ profileName }}</strong
            ><small>{{ session?.user.email || 'Modo local' }}</small>
          </div>
          <button
            v-if="session"
            type="button"
            class="profile-exit"
            aria-label="Sair da conta"
            title="Sair da conta"
            @click="supabase?.auth.signOut()"
          >
            <LogOut :size="16" />
          </button>
        </div>
      </div>
    </header>
    <nav v-if="!cloudEnabled || session" class="mobile-nav" aria-label="Navegação principal">
      <button
        type="button"
        :class="{ selected: tab === 'week' }"
        :aria-current="tab === 'week' ? 'page' : undefined"
        @click="tab = 'week'"
      >
        <CalendarDays :size="19" /> <span>Semana</span></button
      ><button
        type="button"
        :class="{ selected: tab === 'month' }"
        :aria-current="tab === 'month' ? 'page' : undefined"
        @click="tab = 'month'"
      >
        <CalendarDays :size="19" /> <span>Mês</span></button
      ><button
        type="button"
        :class="{ selected: tab === 'goals' }"
        :aria-current="tab === 'goals' ? 'page' : undefined"
        @click="tab = 'goals'"
      >
        <Target :size="19" /> <span>Metas</span>
      </button>
    </nav>
    <main v-if="cloudEnabled && !session" class="auth-layout">
      <div class="auth-intro">
        <span class="eyebrow">SEU RITMO, SUA SEMANA</span>
        <h1>Pequenos passos.<br /><em>Grandes semanas.</em></h1>
        <p>
          Organize seus treinos e hábitos de alimentação em um checklist simples. Cada conquista
          merece ser vista.
        </p>
        <div class="decoration" aria-hidden="true"><Sparkles :size="96" :stroke-width="1" /></div>
      </div>
      <form class="auth-card" @submit.prevent="auth">
        <span class="eyebrow">COMECE POR AQUI</span>
        <h2>{{ signUp ? 'Crie sua conta' : 'Boas-vindas de volta' }}</h2>
        <p>Seu progresso acompanha você em qualquer dispositivo.</p>
        <label
          >Email<input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="voce@exemplo.com" /></label
        ><label
          >Senha<input
            v-model="password"
            type="password"
            :autocomplete="signUp ? 'new-password' : 'current-password'"
            minlength="6"
            required
            placeholder="No mínimo 6 caracteres" /></label
        ><button class="primary-button" :disabled="busy">
          {{ busy ? 'Aguarde...' : signUp ? 'Criar conta' : 'Entrar' }}</button
        ><button type="button" class="auth-switch" @click="switchAuth">
          {{ signUp ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta' }}
        </button>
        <p v-if="message" role="status" class="notice">{{ message }}</p>
      </form>
    </main>
    <div v-else class="dashboard">
      <aside class="sidebar">
        <span class="eyebrow">MEU ESPAÇO</span
        ><button :class="['nav-button', { selected: tab === 'week' }]" @click="tab = 'week'">
          <CalendarDays :size="18" aria-hidden="true" /> Minha semana</button
        ><button :class="['nav-button', { selected: tab === 'month' }]" @click="tab = 'month'">
          <CalendarDays :size="18" aria-hidden="true" /> Calendário</button
        ><button :class="['nav-button', { selected: tab === 'goals' }]" @click="tab = 'goals'">
          <Target :size="18" aria-hidden="true" /> Minhas metas
        </button>
        <div class="sidebar-note">
          <Sparkles :size="28" :stroke-width="1.5" aria-hidden="true" />
          <p>O progresso acontece um dia de cada vez.</p>
        </div>
      </aside>
      <main :class="['content', { 'week-layout': tab === 'week' }]">
        <div v-if="loading" role="status" class="loading">Carregando sua semana...</div>
        <template v-else-if="tab === 'week'">
          <div class="page-heading">
            <div>
              <span class="eyebrow">SEU PAINEL SEMANAL</span>
              <div class="month-heading">
                <CalendarDays :size="17" aria-hidden="true" /><span class="desktop-date-label">{{
                  monthLabel
                }}</span
                ><span class="mobile-date-label">{{ compactMonthLabel }}</span>
              </div>
              <h1>Uma semana de <em>cada vez.</em></h1>
              <p>O que importa é continuar no seu ritmo.</p>
            </div>
            <button class="small-button" @click="tab = 'goals'">
              <Plus :size="17" aria-hidden="true" /> Nova meta
            </button>
          </div>
          <div class="summary-grid">
            <div class="summary-card featured">
              <div class="card-top">
                {{
                  future ? 'PRÓXIMA SEMANA' : current ? 'PROGRESSO ATÉ HOJE' : 'RESULTADO DA SEMANA'
                }}
                <Sparkles :size="23" aria-hidden="true" />
              </div>
              <div class="progress-main">
                <strong>{{ future ? 0 : pace.percent }}%</strong
                ><span>{{
                  future ? 'sem atividades vencidas' : 'das refeições e atividades previstas'
                }}</span>
              </div>
              <div class="progress-track"><div :style="{ width: `${pace.percent}%` }"></div></div>
              <small
                >{{ pace.completed }} de {{ pace.total }} atividades previstas até esta data
                <template v-if="pace.upcoming"> · {{ pace.upcoming }} por vir</template></small
              >
              <small class="progress-explanation"
                >Cada refeição conta no percentual. Livres dentro do limite contam como
                certas.</small
              >
              <div class="week-total">
                Plano completo: {{ stats.completed }} de {{ stats.total }} · {{ stats.percent }}%
              </div>
            </div>
            <div class="summary-card">
              <div class="card-top">
                PONTOS CONQUISTADOS <Sparkles :size="22" aria-hidden="true" />
              </div>
              <strong class="stat-number">{{ stats.points }} <small>pts</small></strong>
              <p>Cada passo conta.</p>
            </div>
            <div class="summary-card">
              <div class="card-top">METAS NA SEMANA <Target :size="22" aria-hidden="true" /></div>
              <strong class="stat-number">{{ activeThisWeek }}</strong>
              <p>Um plano feito por você.</p>
            </div>
          </div>
          <section class="week-section">
            <div class="section-heading">
              <div>
                <span class="eyebrow">CHECKLIST</span>
                <h2>Seu plano da semana</h2>
              </div>
              <div class="week-nav">
                <button aria-label="Semana anterior" @click="monday = addDays(monday, -7)">
                  <ChevronLeft :size="19" /></button
                ><span class="desktop-date-label">{{ label }}</span
                ><span class="mobile-date-label">{{ compactWeekLabel }}</span
                ><button aria-label="Próxima semana" @click="monday = addDays(monday, 7)">
                  <ChevronRight :size="19" />
                </button>
              </div>
            </div>
            <button v-if="!current" class="today-link" @click="monday = mondayOf(new Date())">
              Voltar para esta semana
            </button>
            <div
              v-if="weeklyFoodAllowances.length"
              class="free-meal-overview"
              aria-label="Refeições livres da semana"
            >
              <div
                v-for="allowance in weeklyFoodAllowances"
                :key="allowance.goal.id"
                class="free-meal-summary"
              >
                <Utensils :size="17" aria-hidden="true" />
                <span
                  ><strong>{{ allowance.goal.title }}</strong> · Refeições livres usadas:
                  {{ allowance.used }} de {{ allowance.limit }} permitidas
                  <small>{{
                    allowance.excess
                      ? `${allowance.excess} além do limite. Confira os registros dos dias.`
                      : 'Opcionais · de segunda a domingo.'
                  }}</small>
                </span>
              </div>
            </div>
            <div v-if="!days.some((date) => planned(date).length)" class="empty-state">
              <Sparkles :size="32" aria-hidden="true" />
              <h3>Nenhuma meta nesta semana</h3>
              <p>Crie uma meta para montar seu checklist semanal.</p>
              <button class="primary-button" @click="tab = 'goals'">Ver minhas metas</button>
            </div>
            <div v-else class="days-grid">
              <article
                v-for="date in visibleDays"
                :key="localKey(date)"
                :class="['day-card', { 'is-today': localKey(date) === localKey(new Date()) }]"
              >
                <div class="day-heading">
                  <button
                    type="button"
                    class="day-open"
                    :aria-label="`Abrir registros de ${date.toLocaleDateString('pt-BR')}`"
                    @click="openDay(date)"
                  >
                    <span>{{ fullWeekdays[date.getDay()] }}</span
                    ><strong
                      >{{ date.getDate() }}
                      <small>{{
                        date.toLocaleDateString('pt-BR', { month: 'short' })
                      }}</small></strong
                    >
                  </button>
                  <span v-if="localKey(date) === localKey(new Date())" class="today-pill"
                    >HOJE</span
                  >
                </div>
                <div v-if="planned(date).length" class="tasks">
                  <button
                    type="button"
                    v-for="goal in planned(date)"
                    :key="goal.id"
                    :class="['task', goal.category, { done: isDone(goal, date) }]"
                    :aria-label="`Detalhar ${goal.title} em ${date.toLocaleDateString('pt-BR')}`"
                    @click="openDay(date)"
                  >
                    <span class="check-visual" aria-hidden="true"><Check :size="13" /></span
                    ><span class="task-title"
                      >{{ goal.title
                      }}<small
                        >{{
                          goal.category === 'alimentacao'
                            ? `${mealCount(goal, date).checked}/${mealCount(goal, date).total} registradas${mealCount(goal, date).adherent === null ? '' : ` · ${mealCount(goal, date).adherent} válidas`}`
                            : goal.goal_mode === 'weekly'
                              ? `${Math.min(weeklyCount(goal, date)?.completed || 0, weeklyCount(goal, date)?.target || 1)}/${weeklyCount(goal, date)?.target || 1} idas na semana`
                              : checklistCount(goal, date).total
                                ? `${checklistCount(goal, date).checked}/${checklistCount(goal, date).total} itens`
                                : categoryName(goal.category)
                        }}
                        · {{ goal.points }} pts{{
                          goal.goal_mode === 'weekly' ? '/semana' : ''
                        }}</small
                      ></span
                    >
                  </button>
                </div>
                <p v-else class="rest-day">Dia livre para respirar ☀</p>
                <button
                  v-if="planned(date).length"
                  type="button"
                  class="day-edit-action"
                  @click="openDay(date)"
                >
                  <Pencil :size="14" /> Editar dia
                </button>
              </article>
            </div>
          </section> </template
        ><template v-else-if="tab === 'month'">
          <MonthView
            :goals="goals"
            :completions="completions"
            :history="history"
            :day-details="dayDetails"
            @open-day="openDay"
            @current-week="goToCurrentWeek"
          /> </template
        ><template v-else
          ><div class="page-heading">
            <div>
              <span class="eyebrow">SEU PLANO</span>
              <h1>Metas que cabem <em>na vida.</em></h1>
              <p>Escolha ações simples que você gostaria de repetir.</p>
            </div>
            <button
              type="button"
              class="small-button report-button"
              :disabled="!goals.length"
              @click="downloadReport"
            >
              <Download :size="17" aria-hidden="true" /> Exportar CSV
            </button>
          </div>
          <section class="panel report-panel" aria-label="Exportar e importar registros">
            <div>
              <strong>Período do relatório</strong>
              <label
                >Exportar
                <select v-model="reportMode">
                  <option value="all">Tudo desde o início</option>
                  <option value="month">Um mês</option>
                  <option value="range">Intervalo de datas</option>
                </select>
              </label>
              <label v-if="reportMode === 'month'"
                >Mês<input v-model="reportMonth" type="month"
              /></label>
              <div v-if="reportMode === 'range'" class="report-dates">
                <label>De<input v-model="reportFrom" type="date" /></label>
                <label>Até<input v-model="reportTo" type="date" /></label>
              </div>
            </div>
            <div>
              <strong>Restaurar registros</strong>
              <label
                >Selecione um CSV exportado por esta versão<input
                  type="file"
                  accept=".csv,text/csv"
                  @change="selectBackup"
              /></label>
              <p v-if="pendingBackup">
                {{ pendingBackupName }} · {{ pendingBackup.length }} metas reconhecidas. A
                importação adiciona apenas registros ausentes.
              </p>
              <button
                v-if="pendingBackup"
                type="button"
                class="small-button"
                :disabled="busy"
                @click="restoreBackup"
              >
                {{ busy ? 'Importando...' : 'Importar registros' }}
              </button>
              <p v-else>
                Arquivos antigos sem a coluna de restauração continuam legíveis, mas não podem ser
                importados com segurança.
              </p>
            </div>
            <p v-if="reportMessage" role="status" class="notice report-notice">
              {{ reportMessage }}
            </p>
          </section>
          <div class="goals-layout">
            <form class="goal-form panel" @submit.prevent="save">
              <span class="eyebrow">{{ editing ? 'AJUSTAR META' : 'NOVA META' }}</span>
              <h2>{{ editing ? 'Editar meta' : 'Crie uma meta' }}</h2>
              <label
                >O que você quer fazer?<input
                  v-model="form.title"
                  required
                  maxlength="100"
                  placeholder="Ex.: Fazer treino de força"
              /></label>
              <div class="form-row">
                <label
                  >Categoria<select v-model="form.category">
                    <option value="treino">Treino</option>
                    <option value="alimentacao">Alimentação</option>
                    <option value="outro">Outro</option>
                  </select></label
                ><label
                  >Pontos<input
                    v-model.number="form.points"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    required
                /></label>
              </div>
              <div v-if="form.category === 'alimentacao'" class="free-meal-settings">
                <label
                  >Refeições livres permitidas por semana
                  <input
                    v-model.number="form.free_meals_per_week"
                    type="number"
                    min="0"
                    max="84"
                    step="1"
                    required
                    aria-describedby="free-meal-help"
                  />
                </label>
                <p id="free-meal-help">
                  São opcionais. Seguir a dieta em todas as refeições também conclui a meta. Use 0
                  para não permitir refeições livres. A semana vai de segunda a domingo.
                </p>
              </div>
              <fieldset>
                <legend>Período da meta</legend>
                <label class="active-switch"
                  ><input
                    type="checkbox"
                    :checked="form.duration_days !== null"
                    @change="togglePeriod"
                  />Duração definida</label
                >
                <div v-if="form.duration_days !== null" class="form-row period-fields">
                  <label>Começa em<input v-model="form.start_date" type="date" required /></label>
                  <label
                    >Por quantos dias?<input
                      v-model.number="form.duration_days"
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      required
                  /></label>
                </div>
                <p v-if="form.duration_days !== null">
                  Para 14 marcações diárias, escolha todos os dias da semana.
                </p>
              </fieldset>
              <fieldset v-if="form.category !== 'alimentacao'">
                <legend>Como contar esta meta?</legend>
                <label
                  >Tipo de meta
                  <select :value="form.goal_mode" @change="changeMode">
                    <option value="fixed">Dias fixos</option>
                    <option value="weekly">Frequência semanal (dias livres)</option>
                  </select>
                </label>
                <label v-if="form.goal_mode === 'weekly'"
                  >Quantas vezes na semana?
                  <input
                    v-model.number="form.weekly_target"
                    type="number"
                    min="1"
                    max="7"
                    step="1"
                    required
                  />
                </label>
                <p v-if="form.goal_mode === 'weekly'">
                  Marque os dias em que fez a atividade. Os pontos são ganhos uma vez ao atingir a
                  frequência.
                </p>
              </fieldset>
              <fieldset v-if="form.category === 'alimentacao'" class="meal-options-field">
                <legend>Refeições para acompanhar</legend>
                <p>
                  Estas opções aparecem nos dias da meta. Você pode ajustá-las em um dia específico
                  depois.
                </p>
                <div class="meal-option-list">
                  <span
                    v-for="(option, index) in form.meal_options"
                    :key="option.id"
                    class="meal-option-chip"
                    >{{ option.label
                    }}<button
                      type="button"
                      :disabled="index === 0"
                      :aria-label="`Subir ${option.label}`"
                      @click="moveGoalMeal(option.id, -1)"
                    >
                      <ArrowUp :size="14" /></button
                    ><button
                      type="button"
                      :disabled="index === form.meal_options.length - 1"
                      :aria-label="`Descer ${option.label}`"
                      @click="moveGoalMeal(option.id, 1)"
                    >
                      <ArrowDown :size="14" /></button
                    ><button
                      type="button"
                      :aria-label="`Remover ${option.label}`"
                      :disabled="form.meal_options.length === 1"
                      @click="removeGoalMeal(option.id)"
                    >
                      <X :size="14" /></button
                  ></span>
                </div>
                <div class="meal-add">
                  <input
                    v-model="newGoalMeal"
                    type="text"
                    maxlength="40"
                    placeholder="Ex.: Ceia"
                    aria-label="Nova refeição da meta"
                    @keydown.enter.prevent="addGoalMeal"
                  /><button type="button" class="small-button" @click="addGoalMeal">
                    <Plus :size="16" /> Adicionar
                  </button>
                </div>
              </fieldset>
              <fieldset v-if="form.category !== 'alimentacao'" class="meal-options-field">
                <legend>Checklist da meta (opcional)</legend>
                <p>
                  Adicione etapas para marcar em cada dia. Sem itens, a meta usa um check simples.
                </p>
                <div class="meal-option-list">
                  <span
                    v-for="(option, index) in form.checklist_options"
                    :key="option.id"
                    class="meal-option-chip"
                    >{{ option.label
                    }}<button
                      type="button"
                      :disabled="index === 0"
                      :aria-label="`Subir ${option.label}`"
                      @click="moveGoalChecklist(option.id, -1)"
                    >
                      <ArrowUp :size="14" /></button
                    ><button
                      type="button"
                      :disabled="index === form.checklist_options.length - 1"
                      :aria-label="`Descer ${option.label}`"
                      @click="moveGoalChecklist(option.id, 1)"
                    >
                      <ArrowDown :size="14" /></button
                    ><button
                      type="button"
                      :aria-label="`Remover ${option.label}`"
                      @click="removeGoalChecklist(option.id)"
                    >
                      <X :size="14" /></button
                  ></span>
                </div>
                <div class="meal-add">
                  <input
                    v-model="newGoalChecklist"
                    type="text"
                    maxlength="40"
                    placeholder="Ex.: Aquecer, treinar, alongar"
                    aria-label="Novo item do checklist"
                    @keydown.enter.prevent="addGoalChecklist"
                  /><button type="button" class="small-button" @click="addGoalChecklist">
                    <Plus :size="16" /> Adicionar
                  </button>
                </div>
              </fieldset>
              <fieldset v-if="form.category === 'alimentacao' || form.goal_mode === 'fixed'">
                <legend>Em quais dias?</legend>
                <div class="day-picker">
                  <button
                    v-for="day in [1, 2, 3, 4, 5, 6, 0]"
                    :key="day"
                    type="button"
                    :class="{ active: form.scheduled_weekdays.includes(day) }"
                    :aria-pressed="form.scheduled_weekdays.includes(day)"
                    :aria-label="fullWeekdays[day]"
                    @click="changeDay(day)"
                  >
                    {{ weekdays[day] }}
                  </button>
                </div>
              </fieldset>
              <fieldset
                v-if="
                  form.goal_mode === 'fixed' &&
                  form.scheduled_weekdays.length &&
                  formDefaultOptions.length
                "
                class="weekday-meals-field"
              >
                <legend>Opções em cada dia da semana</legend>
                <p>Todos usam os itens acima. Personalize apenas os dias que quiser.</p>
                <div
                  v-for="day in [1, 2, 3, 4, 5, 6, 0].filter((value) =>
                    form.scheduled_weekdays.includes(value),
                  )"
                  :key="day"
                  class="weekday-meals-card"
                >
                  <div class="weekday-meals-header">
                    <strong>{{ fullWeekdays[day] }}</strong>
                    <div>
                      <button type="button" class="text-button" @click="openWeekdayModal(day)">
                        {{
                          formWeekdayOptions[String(day)] ? 'Editar opções' : 'Personalizar'
                        }}</button
                      ><button
                        v-if="formWeekdayOptions[String(day)]"
                        type="button"
                        class="text-button"
                        @click="resetWeekday(day)"
                      >
                        Usar padrão
                      </button>
                    </div>
                  </div>
                  <small>{{
                    (formWeekdayOptions[String(day)] || formDefaultOptions)
                      .map((option) => option.label)
                      .join(' · ')
                  }}</small>
                </div>
              </fieldset>
              <label class="active-switch"
                ><input v-model="form.active" type="checkbox" /> Meta ativa</label
              >
              <div class="form-actions">
                <button class="primary-button" :disabled="busy">
                  {{ editing ? 'Salvar alterações' : 'Adicionar meta' }} ↗</button
                ><button v-if="editing" type="button" class="text-button" @click="cancelEdit">
                  Cancelar
                </button>
              </div>
            </form>
            <section class="goal-list panel">
              <span class="eyebrow">SEU REPERTÓRIO</span>
              <h2>
                Minhas metas <span>{{ goals.length }}</span>
              </h2>
              <div v-if="!goals.length" class="list-empty">
                Suas metas aparecerão aqui. Que tal começar com uma ação pequena?
              </div>
              <article
                v-for="goal in goals"
                :key="goal.id"
                :class="['goal-item', { inactive: !goal.active }]"
              >
                <div class="goal-icon" :class="goal.category">
                  <Dumbbell v-if="goal.category === 'treino'" :size="20" />
                  <Utensils v-else-if="goal.category === 'alimentacao'" :size="20" />
                  <Sparkles v-else :size="20" />
                </div>
                <div class="goal-details">
                  <strong>{{ goal.title }}</strong
                  ><span
                    >{{ categoryName(goal.category) }} · {{ goal.points }} pts ·
                    {{
                      goal.goal_mode === 'weekly'
                        ? `${goal.weekly_target || 1}x por semana · dias livres`
                        : goal.scheduled_weekdays.map((day) => weekdays[day]).join(', ')
                    }}{{
                      goal.start_date && goal.duration_days
                        ? ` · ${goal.duration_days} dias desde ${new Date(`${goal.start_date}T12:00:00`).toLocaleDateString('pt-BR')}`
                        : ''
                    }}</span
                  ><small v-if="goal.category === 'alimentacao'"
                    >Até {{ goal.free_meals_per_week ?? 0 }} refeições livres por semana ·
                    opcionais</small
                  ><small v-if="!goal.active">Pausada</small>
                </div>
                <div class="goal-actions">
                  <button
                    :disabled="busy"
                    :aria-label="goal.active ? `Pausar ${goal.title}` : `Ativar ${goal.title}`"
                    @click="pause(goal)"
                  >
                    <CirclePause v-if="goal.active" :size="16" /><CirclePlay
                      v-else
                      :size="16"
                    /></button
                  ><button :aria-label="`Editar ${goal.title}`" @click="edit(goal)">
                    <Pencil :size="16" /></button
                  ><button
                    :disabled="busy"
                    :aria-label="`Excluir ${goal.title}`"
                    @click="remove(goal)"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
              </article>
            </section></div
        ></template>
        <AppNotice
          v-if="message && !selectedDay && editingWeekday === null"
          :message="message"
          :error="messageIsError"
          @dismiss="message = ''"
        />
        <footer>Feito para celebrar a constância, no seu tempo. ✦</footer>
      </main>
    </div>
    <ConfirmDialog
      v-if="confirmation"
      v-bind="confirmation"
      @confirm="finishConfirmation(true)"
      @cancel="finishConfirmation(false)"
    />
    <div
      v-if="editingWeekday !== null"
      class="dialog-backdrop"
      @click.self="editingWeekday = null"
      @keydown.esc="editingWeekday = null"
    >
      <section
        ref="weekdayDialog"
        class="day-dialog weekday-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekday-dialog-title"
        @keydown="keepWeekdayFocus"
      >
        <div class="dialog-header">
          <div>
            <span class="eyebrow">OPÇÕES DA META</span>
            <h2 id="weekday-dialog-title">{{ fullWeekdays[editingWeekday] }}</h2>
          </div>
          <button
            ref="weekdayCloseButton"
            type="button"
            class="dialog-close"
            aria-label="Fechar"
            @click="editingWeekday = null"
          >
            <X :size="21" />
          </button>
        </div>
        <p class="weekday-dialog-hint">
          Escolha os itens e ajuste a ordem para este dia da semana. As alterações entram no
          cadastro da meta quando você salvá-la.
        </p>
        <ol class="weekday-editor-list">
          <li v-for="(option, index) in weekdayDraft" :key="option.id">
            <span>{{ option.label }}</span>
            <div class="meal-order-actions">
              <button
                type="button"
                :disabled="index === 0"
                :aria-label="`Subir ${option.label}`"
                @click="moveWeekdayMeal(option.id, -1)"
              >
                <ArrowUp :size="16" /></button
              ><button
                type="button"
                :disabled="index === weekdayDraft.length - 1"
                :aria-label="`Descer ${option.label}`"
                @click="moveWeekdayMeal(option.id, 1)"
              >
                <ArrowDown :size="16" />
              </button>
            </div>
            <button
              type="button"
              class="meal-remove"
              :disabled="form.category === 'alimentacao' && weekdayDraft.length === 1"
              :aria-label="`Remover ${option.label}`"
              @click="removeWeekdayMeal(option.id)"
            >
              <X :size="16" />
            </button>
          </li>
        </ol>
        <div class="meal-add">
          <input
            v-model="weekdayMealInput"
            type="text"
            maxlength="40"
            :placeholder="form.category === 'alimentacao' ? 'Ex.: Ceia' : 'Ex.: Alongar'"
            aria-label="Novo item neste dia da semana"
            @keydown.enter.prevent="addWeekdayMeal"
          /><button type="button" class="small-button" @click="addWeekdayMeal">
            <Plus :size="16" /> Adicionar
          </button>
        </div>
        <p v-if="weekdayModalError" class="notice" role="alert">{{ weekdayModalError }}</p>
        <div class="dialog-actions">
          <button type="button" class="text-button" @click="editingWeekday = null">Cancelar</button
          ><button type="button" class="primary-button" @click="saveWeekdayModal">
            Aplicar opções
          </button>
        </div>
      </section>
    </div>
    <div
      v-if="selectedDay"
      class="dialog-backdrop"
      @click.self="selectedDay = null"
      @keydown.esc="selectedDay = null"
    >
      <section
        ref="dayDialog"
        class="day-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-dialog-title"
        @keydown="keepDialogFocus"
      >
        <div class="dialog-header">
          <div>
            <span class="eyebrow">EDITAR DIA</span>
            <h2 id="day-dialog-title">
              {{
                selectedDay.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              }}
            </h2>
          </div>
          <button
            type="button"
            ref="dialogCloseButton"
            class="dialog-close"
            aria-label="Fechar"
            @click="selectedDay = null"
          >
            <X :size="21" />
          </button>
        </div>
        <div v-if="planned(selectedDay).length" class="dialog-summary">
          <span
            >{{ daySummary(selectedDay).completed }} de {{ daySummary(selectedDay).total }} metas
            concluídas</span
          ><button type="button" @click="openWeekOf(selectedDay)">
            Ver na semana <ChevronRight :size="15" />
          </button>
        </div>
        <p v-if="!planned(selectedDay).length" class="dialog-empty">
          Nenhuma meta programada para este dia.
        </p>
        <form v-else @submit.prevent="saveDay">
          <div v-for="goal in planned(selectedDay)" :key="goal.id" class="day-goal">
            <div class="day-goal-title">
              <span class="goal-icon" :class="goal.category"
                ><Utensils v-if="goal.category === 'alimentacao'" :size="19" /><Dumbbell
                  v-else-if="goal.category === 'treino'"
                  :size="19" /><ClipboardList v-else :size="19"
              /></span>
              <div>
                <strong>{{ goal.title }}</strong
                ><small
                  >{{ categoryName(goal.category) }} · {{ goal.points }} pts{{
                    goal.goal_mode === 'weekly' ? '/semana' : ''
                  }}</small
                >
              </div>
            </div>
            <template v-if="goal.category === 'alimentacao' || dayDrafts[goal.id]!.options.length">
              <p class="meal-hint">
                {{
                  goal.category === 'alimentacao'
                    ? 'Registre cada refeição. Seguir o plano ou usar uma refeição livre dentro do limite conta para concluir o dia.'
                    : 'Marque todos os itens para concluir esta meta do dia.'
                }}
              </p>
              <div v-if="goal.category === 'alimentacao'" class="free-meal-summary" role="status">
                <span
                  >Refeições livres usadas nesta semana:
                  <strong
                    >{{ draftFreeUsage(goal).used }} de
                    {{ draftFreeUsage(goal).limit }} permitidas</strong
                  >
                  <small v-if="dayDrafts[goal.id]!.freeMealLimitOverride !== null"
                    >Limite corrigido para esta data.</small
                  >
                  <small v-else-if="(goal.free_meals_per_week ?? 0) !== currentFreeMealLimit(goal)"
                    >Este dia usa o limite histórico. A meta atual permite
                    {{ currentFreeMealLimit(goal) }}; use “Corrigir limite deste dia” abaixo para
                    ajustar.</small
                  >
                  <small>{{
                    draftFreeUsage(goal).excess
                      ? `${draftFreeUsage(goal).excess} além do limite. As excedentes não contam para concluir a meta.`
                      : 'Você pode seguir a dieta sem usar nenhuma. O contador inclui as alterações deste dia.'
                  }}</small>
                </span>
              </div>
              <details
                v-if="
                  goal.category === 'alimentacao' &&
                  (localKey(selectedDay) < localKey(new Date()) ||
                    dayDrafts[goal.id]!.freeMealLimitOverride !== null)
                "
                class="day-limit-correction"
              >
                <summary>Corrigir limite deste dia</summary>
                <p>
                  O limite histórico deste dia é {{ goal.free_meals_per_week ?? 0 }}. A meta atual
                  permite {{ currentFreeMealLimit(goal) }} por semana. Você pode corrigir o limite
                  considerado nesta data; a contagem continua incluindo as refeições livres da
                  semana inteira.
                </p>
                <button
                  v-if="
                    dayDrafts[goal.id]!.freeMealLimitOverride === null ||
                    dayDrafts[goal.id]!.freeMealLimitOverride !== currentFreeMealLimit(goal)
                  "
                  type="button"
                  class="small-button use-current-limit"
                  @click="dayDrafts[goal.id]!.freeMealLimitOverride = currentFreeMealLimit(goal)"
                >
                  Usar limite atual: {{ currentFreeMealLimit(goal) }}
                </button>
                <label
                  >Limite semanal considerado neste dia
                  <input
                    type="number"
                    min="0"
                    max="84"
                    step="1"
                    required
                    :value="
                      dayDrafts[goal.id]!.freeMealLimitOverride ?? goal.free_meals_per_week ?? 0
                    "
                    @input="correctDayLimit(goal.id, $event)"
                  />
                </label>
                <button
                  v-if="dayDrafts[goal.id]!.freeMealLimitOverride !== null"
                  type="button"
                  class="text-button"
                  @click="dayDrafts[goal.id]!.freeMealLimitOverride = null"
                >
                  Restaurar limite histórico
                </button>
                <p>Aplica somente a este dia ao salvar o registro.</p>
              </details>
              <div
                v-for="(option, index) in dayDrafts[goal.id]!.options"
                :key="option.id"
                :class="['meal-row', { 'food-row': goal.category === 'alimentacao' }]"
              >
                <label class="meal-check"
                  ><input
                    v-model="dayDrafts[goal.id]!.items[option.id]!.checked"
                    type="checkbox"
                  />{{ option.label }}</label
                >
                <label v-if="goal.category === 'alimentacao'" class="meal-adherence"
                  >Aderência ao plano
                  <select
                    v-model="dayDrafts[goal.id]!.items[option.id]!.adherent"
                    :disabled="!dayDrafts[goal.id]!.items[option.id]!.checked"
                    @change="dayDrafts[goal.id]!.trackAdherence = true"
                  >
                    <option :value="null">Não informada</option>
                    <option :value="true">Segui o plano</option>
                    <option value="free">Refeição livre</option>
                    <option :value="false">Fora do plano</option>
                  </select>
                  <small v-if="draftFreeExceeded(goal, option.id)" class="free-meal-warning"
                    >Esta refeição excede o limite semanal e não conta para a meta.</small
                  >
                </label>
                <textarea
                  v-model="dayDrafts[goal.id]!.items[option.id]!.description"
                  class="meal-description"
                  rows="1"
                  maxlength="300"
                  :aria-label="
                    goal.category === 'alimentacao'
                      ? `O que você comeu em ${option.label}`
                      : `Detalhes de ${option.label}`
                  "
                  :placeholder="
                    goal.category === 'alimentacao'
                      ? 'O que você comeu? (opcional)'
                      : 'Detalhe opcional'
                  "
                  @input="resizeMealDescription($event.target as HTMLTextAreaElement)"
                ></textarea>
                <div class="meal-order-actions">
                  <button
                    type="button"
                    :disabled="index === 0"
                    :aria-label="`Subir ${option.label}`"
                    @click="moveDayMeal(goal.id, option.id, -1)"
                  >
                    <ArrowUp :size="15" /></button
                  ><button
                    type="button"
                    :disabled="index === dayDrafts[goal.id]!.options.length - 1"
                    :aria-label="`Descer ${option.label}`"
                    @click="moveDayMeal(goal.id, option.id, 1)"
                  >
                    <ArrowDown :size="15" />
                  </button>
                </div>
                <button
                  type="button"
                  class="meal-remove"
                  :disabled="
                    dayDrafts[goal.id]!.options.length === 1 &&
                    (goal.category === 'alimentacao' ||
                      checklistOptionsForDate(goal, selectedDay).length > 0)
                  "
                  :aria-label="`Remover ${option.label} deste dia`"
                  @click="
                    removeDayMeal(
                      goal.id,
                      option.id,
                      goal.category,
                      checklistOptionsForDate(goal, selectedDay).length > 0,
                    )
                  "
                >
                  <X :size="16" />
                </button>
              </div>
            </template>
            <p
              v-if="goal.category === 'alimentacao' && !dayDrafts[goal.id]!.trackAdherence"
              class="meal-hint"
            >
              Registro antigo sem avaliação de aderência. Classifique as refeições para atualizar
              este dia.
            </p>
            <label v-if="goal.category !== 'alimentacao'" class="meal-check completion-check"
              ><input v-model="dayDrafts[goal.id]!.completed" type="checkbox" />{{
                goal.goal_mode === 'weekly' ? 'Fiz esta atividade hoje' : 'Meta concluída'
              }}</label
            >
            <div class="meal-add">
              <input
                v-model="newDayMeals[goal.id]"
                type="text"
                maxlength="40"
                :placeholder="
                  goal.category === 'alimentacao'
                    ? 'Outra refeição neste dia'
                    : 'Novo item neste dia'
                "
                :aria-label="`Novo item de ${goal.title} neste dia`"
                @keydown.enter.prevent="addDayMeal(goal.id)"
              /><button type="button" class="small-button" @click="addDayMeal(goal.id)">
                <Plus :size="16" /> Adicionar
              </button>
            </div>
            <p v-if="goal.category === 'alimentacao'" class="meal-hint meal-progress" role="status">
              {{
                Math.round(
                  goalProgress(goal, localKey(selectedDay), completions, detailsWithDraft(goal)) *
                    100,
                )
              }}% das refeições deste dia dentro do plano.
            </p>
            <label class="day-note"
              >Observação do dia (opcional)<textarea
                v-model="dayDrafts[goal.id]!.note"
                maxlength="500"
                rows="2"
                placeholder="Adicione um detalhe que queira lembrar"
              ></textarea>
            </label>
          </div>
          <div class="dialog-actions">
            <button type="button" class="text-button" @click="selectedDay = null">Cancelar</button
            ><button type="submit" class="primary-button" :disabled="busy">
              {{ busy ? 'Salvando...' : 'Salvar dia' }}
            </button>
          </div>
          <p v-if="message" role="alert" class="notice">{{ message }}</p>
        </form>
      </section>
    </div>
  </div>
</template>
