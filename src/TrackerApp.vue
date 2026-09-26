<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Utensils,
  X,
} from '@lucide/vue'
import {
  cloudEnabled,
  createGoal,
  deleteGoal,
  loadData,
  saveDayDetail,
  setCompleted,
  supabase,
  updateGoal,
} from './lib/data'
import {
  addDays,
  calendarDays,
  fullWeekdays,
  localKey,
  mondayOf,
  goalForDate,
  isGoalDone,
  mealOptionsForDate,
  scheduledFor,
  weekDays,
  weekPace,
  weekdays,
  weekStats,
} from './lib/dates'
import { moveMeal } from './lib/meals'
import {
  defaultMealOptions,
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
const monthDate = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const loading = ref(true),
  busy = ref(false),
  message = ref('')
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
type DayDraft = { meals: MealEntries; meal_options: MealOption[]; note: string; completed: boolean }
const dayDrafts = ref<Record<string, DayDraft>>({})
const newGoalMeal = ref('')
const newDayMeals = ref<Record<string, string>>({})
const fresh = (): GoalInput => ({
  title: '',
  category: 'treino',
  scheduled_weekdays: [],
  points: 10,
  active: true,
  meal_options: defaultMealOptions.map((option) => ({ ...option })),
  meal_options_by_weekday: {},
})
const form = ref<GoalInput>(fresh())
const days = computed(() => weekDays(monday.value))
const monthDays = computed(() => calendarDays(monthDate.value))
const monthTitle = computed(() =>
  monthDate.value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
)
const isCurrentMonth = computed(
  () =>
    monthDate.value.getFullYear() === new Date().getFullYear() &&
    monthDate.value.getMonth() === new Date().getMonth(),
)
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
const current = computed(() => localKey(monday.value) === localKey(mondayOf(new Date())))
const future = computed(() => localKey(monday.value) > localKey(mondayOf(new Date())))
const monthLabel = computed(() => {
  const start = days.value[0]!,
    end = days.value[6]!
  const format = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return format(start) === format(end) ? format(start) : `${format(start)} · ${format(end)}`
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
}
const planned = (date: Date) =>
  goals.value
    .map((goal) => goalForDate(goal, history.value, date))
    .filter((goal) => scheduledFor(goal, date))
const activeThisWeek = computed(
  () => new Set(days.value.flatMap((date) => planned(date).map((goal) => goal.id))).size,
)
const isDone = (goal: Goal, date: Date) =>
  isGoalDone(goal, localKey(date), completions.value, dayDetails.value)
const daySummary = (date: Date) => {
  const entries = planned(date)
  return { total: entries.length, completed: entries.filter((goal) => isDone(goal, date)).length }
}
const monthProgress = computed(() => {
  const inMonth = monthDays.value.filter((date) => date.getMonth() === monthDate.value.getMonth())
  const total = inMonth.reduce((sum, date) => sum + daySummary(date).total, 0)
  const completed = inMonth.reduce((sum, date) => sum + daySummary(date).completed, 0)
  const due = inMonth.filter((date) => localKey(date) <= localKey(new Date()))
  const dueTotal = due.reduce((sum, date) => sum + daySummary(date).total, 0)
  const dueCompleted = due.reduce((sum, date) => sum + daySummary(date).completed, 0)
  return {
    total,
    completed,
    dueTotal,
    dueCompleted,
    percent: dueTotal ? Math.round((dueCompleted / dueTotal) * 100) : 0,
  }
})
function shiftMonth(amount: number) {
  monthDate.value = new Date(monthDate.value.getFullYear(), monthDate.value.getMonth() + amount, 1)
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
    report('Use um nome único de até 40 caracteres (máximo de 12 refeições).')
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
function openWeekdayModal(day: number) {
  weekdayTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  editingWeekday.value = day
  weekdayDraft.value = (
    form.value.meal_options_by_weekday[String(day)] || form.value.meal_options
  ).map((option) => ({ ...option }))
  weekdayMealInput.value = ''
  weekdayModalError.value = ''
}
function resetWeekday(day: number) {
  delete form.value.meal_options_by_weekday[String(day)]
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
  if (weekdayDraft.value.length > 1)
    weekdayDraft.value = weekdayDraft.value.filter((option) => option.id !== id)
}
function saveWeekdayModal() {
  if (editingWeekday.value === null) return
  form.value.meal_options_by_weekday[String(editingWeekday.value)] = weekdayDraft.value.map(
    (option) => ({ ...option }),
  )
  editingWeekday.value = null
}
function moveWeekdayMeal(id: string, offset: -1 | 1) {
  weekdayDraft.value = moveMeal(weekdayDraft.value, id, offset)
}
function addDayMeal(goalId: string) {
  const draft = dayDrafts.value[goalId]!
  const option = addOption(draft.meal_options, newDayMeals.value[goalId] || '')
  if (option) {
    draft.meal_options.push(option)
    draft.meals[option.id] = { checked: false, description: '' }
    newDayMeals.value[goalId] = ''
  }
}
function removeDayMeal(goalId: string, id: string) {
  const draft = dayDrafts.value[goalId]!
  if (draft.meal_options.length > 1) {
    draft.meal_options = draft.meal_options.filter((option) => option.id !== id)
    delete draft.meals[id]
  }
}
function moveDayMeal(goalId: string, id: string, offset: -1 | 1) {
  const draft = dayDrafts.value[goalId]!
  draft.meal_options = moveMeal(draft.meal_options, id, offset)
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
      const meal_options = (detail?.meal_options || mealOptionsForDate(goal, date)).map(
        (option) => ({ ...option }),
      )
      const meals = Object.fromEntries(
        meal_options.map(({ id }) => [
          id,
          {
            checked: detail
              ? Boolean(detail.meals[id]?.checked)
              : goal.category === 'alimentacao' && completed,
            description: detail?.meals[id]?.description || '',
          },
        ]),
      ) as MealEntries
      return [goal.id, { meals, meal_options, note: detail?.note || '', completed }]
    }),
  )
}
watch(selectedDay, async (date) => {
  await nextTick()
  if (date) dialogCloseButton.value?.focus()
  else dayTrigger?.focus()
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
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
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
      const draft = dayDrafts.value[goal.id]!
      await saveDayDetail({
        goal_id: goal.id,
        local_date: localKey(date),
        meals: draft.meals,
        meal_options: draft.meal_options,
        note: draft.note,
      })
      if (goal.category !== 'alimentacao' && draft.completed !== isDone(goal, date))
        await setCompleted(goal.id, localKey(date), draft.completed)
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
    scheduled_weekdays: [...form.value.scheduled_weekdays],
  }
  if (
    !input.title ||
    !input.scheduled_weekdays.length ||
    !Number.isInteger(input.points) ||
    input.points < 1 ||
    (input.category === 'alimentacao' &&
      (!input.meal_options.length ||
        input.meal_options.length > 12 ||
        Object.values(input.meal_options_by_weekday).some(
          (options) => !options.length || options.length > 12,
        )))
  ) {
    message.value = 'Informe nome, dias e pontos válidos.'
    return
  }
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
    points: goal.points,
    active: goal.active,
    meal_options: (goal.meal_options || defaultMealOptions).map((option) => ({ ...option })),
    meal_options_by_weekday: Object.fromEntries(
      Object.entries(goal.meal_options_by_weekday || {}).map(([day, options]) => [
        day,
        options.map((option) => ({ ...option })),
      ]),
    ),
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function remove(goal: Goal) {
  if (!confirm(`Excluir “${goal.title}” e todo o histórico dessa meta?`)) return
  busy.value = true
  message.value = ''
  try {
    await deleteGoal(goal.id)
    await refresh()
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
  busy.value = true
  message.value = ''
  try {
    await updateGoal(goal.id, {
      title: goal.title,
      category: goal.category,
      scheduled_weekdays: goal.scheduled_weekdays,
      points: goal.points,
      active: !goal.active,
      meal_options: goal.meal_options || defaultMealOptions,
      meal_options_by_weekday: goal.meal_options_by_weekday || {},
    })
    await refresh()
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
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
      <main class="content">
        <div v-if="loading" role="status" class="loading">Carregando sua semana...</div>
        <template v-else-if="tab === 'week'"
          ><div class="page-heading">
            <div>
              <span class="eyebrow">SEU PAINEL SEMANAL</span>
              <div class="month-heading">
                <CalendarDays :size="17" aria-hidden="true" /> {{ monthLabel }}
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
                ><span>{{ future ? 'sem atividades vencidas' : 'do previsto até este dia' }}</span>
              </div>
              <div class="progress-track"><div :style="{ width: `${pace.percent}%` }"></div></div>
              <small
                >{{ pace.completed }} de {{ pace.total }} atividades previstas até esta data
                <template v-if="pace.upcoming"> · {{ pace.upcoming }} por vir</template></small
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
                ><span>{{ label }}</span
                ><button aria-label="Próxima semana" @click="monday = addDays(monday, 7)">
                  <ChevronRight :size="19" />
                </button>
              </div>
            </div>
            <button v-if="!current" class="today-link" @click="monday = mondayOf(new Date())">
              Voltar para esta semana
            </button>
            <div v-if="!days.some((date) => planned(date).length)" class="empty-state">
              <Sparkles :size="32" aria-hidden="true" />
              <h3>Nenhuma meta nesta semana</h3>
              <p>Crie uma meta para montar seu checklist semanal.</p>
              <button class="primary-button" @click="tab = 'goals'">Ver minhas metas</button>
            </div>
            <div v-else class="days-grid">
              <article
                v-for="date in days"
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
                            ? `${mealCount(goal, date).checked}/${mealCount(goal, date).total} refeições`
                            : categoryName(goal.category)
                        }}
                        · {{ goal.points }} pts</small
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
          </section></template
        ><template v-else-if="tab === 'month'">
          <div class="page-heading month-page-heading">
            <div>
              <span class="eyebrow">VISÃO DO MÊS</span>
              <h1>Seu mês, <em>dia a dia.</em></h1>
              <p>Escolha uma data para ver e editar suas metas.</p>
            </div>
            <button class="small-button" @click="goToCurrentWeek">
              <CalendarDays :size="17" /> Ver esta semana
            </button>
          </div>
          <div class="month-overview">
            <div>
              <span class="eyebrow">PROGRESSO ATÉ HOJE</span
              ><strong>{{ monthProgress.percent }}%</strong
              ><small
                >{{ monthProgress.dueCompleted }} de {{ monthProgress.dueTotal }} atividades
                previstas até hoje</small
              >
            </div>
            <div>
              <span class="eyebrow">PLANO DO MÊS</span
              ><strong
                >{{ monthProgress.completed }} <span>/ {{ monthProgress.total }}</span></strong
              ><small>atividades concluídas no mês</small>
            </div>
            <div class="month-overview-tip">
              <CalendarDays :size="25" />
              <p>
                Toque em um dia para abrir seu registro. As alterações ficam salvas naquela data.
              </p>
            </div>
          </div>
          <section class="calendar-panel" aria-label="Calendário mensal">
            <div class="calendar-header">
              <div>
                <span class="eyebrow">CALENDÁRIO</span>
                <h2>{{ monthTitle }}</h2>
              </div>
              <div class="calendar-nav">
                <button
                  v-if="!isCurrentMonth"
                  type="button"
                  class="today-link"
                  @click="monthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1)"
                >
                  Mês atual</button
                ><button type="button" aria-label="Mês anterior" @click="shiftMonth(-1)">
                  <ChevronLeft :size="19" /></button
                ><button type="button" aria-label="Próximo mês" @click="shiftMonth(1)">
                  <ChevronRight :size="19" />
                </button>
              </div>
            </div>
            <div class="calendar-grid">
              <div v-for="weekday in [1, 2, 3, 4, 5, 6, 0]" :key="weekday" class="calendar-weekday">
                {{ weekdays[weekday] }}
              </div>
              <button
                v-for="date in monthDays"
                :key="localKey(date)"
                type="button"
                class="calendar-day"
                :class="{
                  'outside-month': date.getMonth() !== monthDate.getMonth(),
                  'is-today': localKey(date) === localKey(new Date()),
                  'has-goals': daySummary(date).total > 0,
                }"
                :aria-label="`${date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}: ${daySummary(date).completed} de ${daySummary(date).total} metas concluídas. Abrir registro`"
                @click="openDay(date)"
              >
                <span class="calendar-date">{{ date.getDate() }}</span>
                <span v-if="daySummary(date).total" class="calendar-day-content"
                  ><span class="calendar-count"
                    >{{ daySummary(date).completed }}/{{ daySummary(date).total }}</span
                  ><span class="calendar-progress"
                    ><span
                      :style="{
                        width: `${(daySummary(date).completed / daySummary(date).total) * 100}%`,
                      }"
                    ></span></span
                  ><small>{{ daySummary(date).total === 1 ? 'meta' : 'metas' }}</small></span
                >
                <span v-else class="calendar-free">Livre</span>
              </button>
            </div>
          </section> </template
        ><template v-else
          ><div class="page-heading">
            <div>
              <span class="eyebrow">SEU PLANO</span>
              <h1>Metas que cabem <em>na vida.</em></h1>
              <p>Escolha ações simples que você gostaria de repetir.</p>
            </div>
          </div>
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
              <fieldset>
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
                v-if="form.category === 'alimentacao' && form.scheduled_weekdays.length"
                class="weekday-meals-field"
              >
                <legend>Opções em cada dia da semana</legend>
                <p>Todos usam as refeições acima. Personalize apenas os dias que quiser.</p>
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
                          form.meal_options_by_weekday[String(day)]
                            ? 'Editar opções'
                            : 'Personalizar'
                        }}</button
                      ><button
                        v-if="form.meal_options_by_weekday[String(day)]"
                        type="button"
                        class="text-button"
                        @click="resetWeekday(day)"
                      >
                        Usar padrão
                      </button>
                    </div>
                  </div>
                  <small>{{
                    (form.meal_options_by_weekday[String(day)] || form.meal_options)
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
                    {{ goal.scheduled_weekdays.map((day) => weekdays[day]).join(', ') }}</span
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
        <p v-if="message" role="status" class="notice dashboard-notice">{{ message }}</p>
        <footer>Feito para celebrar a constância, no seu tempo. ✦</footer>
      </main>
    </div>
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
          Escolha as refeições e ajuste a ordem para este dia da semana. As alterações entram no
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
              :disabled="weekdayDraft.length === 1"
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
            placeholder="Ex.: Ceia"
            aria-label="Nova refeição neste dia da semana"
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
                ><small>{{ categoryName(goal.category) }} · {{ goal.points }} pts</small>
              </div>
            </div>
            <template v-if="goal.category === 'alimentacao'">
              <p class="meal-hint">
                Marque todas as refeições escolhidas para concluir esta meta do dia.
              </p>
              <div
                v-for="(option, index) in dayDrafts[goal.id]!.meal_options"
                :key="option.id"
                class="meal-row"
              >
                <label class="meal-check"
                  ><input
                    v-model="dayDrafts[goal.id]!.meals[option.id]!.checked"
                    type="checkbox"
                  />{{ option.label }}</label
                >
                <input
                  v-model="dayDrafts[goal.id]!.meals[option.id]!.description"
                  type="text"
                  maxlength="300"
                  :aria-label="`O que você comeu em ${option.label}`"
                  placeholder="O que você comeu? (opcional)"
                />
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
                    :disabled="index === dayDrafts[goal.id]!.meal_options.length - 1"
                    :aria-label="`Descer ${option.label}`"
                    @click="moveDayMeal(goal.id, option.id, 1)"
                  >
                    <ArrowDown :size="15" />
                  </button>
                </div>
                <button
                  type="button"
                  class="meal-remove"
                  :disabled="dayDrafts[goal.id]!.meal_options.length === 1"
                  :aria-label="`Remover ${option.label} deste dia`"
                  @click="removeDayMeal(goal.id, option.id)"
                >
                  <X :size="16" />
                </button>
              </div>
              <div class="meal-add">
                <input
                  v-model="newDayMeals[goal.id]"
                  type="text"
                  maxlength="40"
                  placeholder="Outra refeição neste dia"
                  :aria-label="`Nova refeição de ${goal.title} neste dia`"
                  @keydown.enter.prevent="addDayMeal(goal.id)"
                /><button type="button" class="small-button" @click="addDayMeal(goal.id)">
                  <Plus :size="16" /> Adicionar
                </button>
              </div>
            </template>
            <label v-else class="meal-check completion-check"
              ><input v-model="dayDrafts[goal.id]!.completed" type="checkbox" />Meta
              concluída</label
            >
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
    <nav v-if="!cloudEnabled || session" class="mobile-nav" aria-label="Navegação principal">
      <button :class="{ selected: tab === 'week' }" @click="tab = 'week'">
        <CalendarDays :size="21" /> <span>Semana</span></button
      ><button :class="{ selected: tab === 'month' }" @click="tab = 'month'">
        <CalendarDays :size="21" /> <span>Mês</span></button
      ><button :class="{ selected: tab === 'goals' }" @click="tab = 'goals'">
        <Target :size="21" /> <span>Metas</span>
      </button>
    </nav>
  </div>
</template>
