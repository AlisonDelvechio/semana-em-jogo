<script setup lang="ts">
import { computed } from 'vue'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Eye,
  Pencil,
  Plus,
  Sparkles,
  Utensils,
} from '@lucide/vue'
import {
  addDays,
  checklistOptionsForDate,
  countsForDay,
  freeMealUsage,
  fullWeekdays,
  isGoalDone,
  isMealAllowed,
  localKey,
  mealOptionsForDate,
  mondayOf,
  weekDays,
  weekPace,
  weeklyEntries,
} from '../lib/dates'
import { capitalizeFirst } from '../lib/format'
import { categoryName, plannedGoals } from '../lib/goals'
import { monthStats } from '../lib/month'
import { currentDate } from '../lib/today'
import InsightsPanel from '../components/InsightsPanel.vue'
import ProgressCard from '../components/ProgressCard.vue'
import TodayCard from '../components/TodayCard.vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'

const props = defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
  mobileWeek: boolean
  // Viewing someone else's shared records: no editing, no quick checks, no new goals.
  readonly?: boolean
}>()
const emit = defineEmits<{
  openDay: [date: Date]
  // Marks or unmarks a simple goal (no meals or checklist items) on a date.
  toggle: [goal: Goal, date: Date]
  newGoal: []
  showGoals: []
  currentWeek: []
  overlayChange: [open: boolean]
}>()
// Owned by the app: the day dialog ("Ver na semana") and the midnight rollover move them too.
const monday = defineModel<Date>('monday', { required: true })
const selectedWeekDay = defineModel<string>('selectedWeekDay', { required: true })

const todayKey = () => localKey(currentDate())
const days = computed(() => weekDays(monday.value))
const visibleDays = computed(() => {
  if (!props.mobileWeek) return days.value
  const selected = days.value.find((date) => localKey(date) === selectedWeekDay.value)
  return [selected || days.value[0]!]
})
const current = computed(() => localKey(monday.value) === localKey(mondayOf(currentDate())))
const future = computed(() => localKey(monday.value) > localKey(mondayOf(currentDate())))
const pace = computed(() =>
  weekPace(
    props.goals,
    props.completions,
    monday.value,
    currentDate(),
    props.history,
    props.dayDetails,
  ),
)
const overviewMonth = computed(() =>
  current.value ? currentDate() : new Date(monday.value.getFullYear(), monday.value.getMonth(), 1),
)
const monthlyProgress = computed(() =>
  monthStats(
    props.goals,
    props.completions,
    props.history,
    props.dayDetails,
    overviewMonth.value,
    currentDate(),
  ),
)
const overviewMonthLabel = computed(() =>
  overviewMonth.value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
)
const monthCaption = computed(() => {
  const key = localKey(overviewMonth.value).slice(0, 7),
    today = todayKey().slice(0, 7)
  return key === today ? 'Até hoje' : key < today ? 'Mês encerrado' : 'Mês futuro'
})
const label = computed(
  () =>
    `${days.value[0]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${days.value[6]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`,
)
const compactWeekLabel = computed(
  () =>
    `${days.value[0]!.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${days.value[6]!.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`,
)
const monthLabel = computed(() => {
  const start = days.value[0]!,
    end = days.value[6]!
  const format = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return capitalizeFirst(
    format(start) === format(end) ? format(start) : `${format(start)} · ${format(end)}`,
  )
})
const compactMonthLabel = computed(() => {
  const start = days.value[0]!,
    end = days.value[6]!
  const short = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return capitalizeFirst(
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
      ? `${short(start)} ${start.getFullYear()}`
      : `${short(start)} · ${short(end)} ${end.getFullYear()}`,
  )
})

const planned = (date: Date) => plannedGoals(props.goals, props.history, date)
const weeklyFoodAllowances = computed(() => {
  const versions = new Map<string, Goal>()
  days.value.forEach((date) =>
    planned(date).forEach((goal) => {
      if (goal.category === 'alimentacao') versions.set(goal.id, goal)
    }),
  )
  return [...versions.values()].map((goal) => {
    const { used } = freeMealUsage(goal, localKey(monday.value), props.dayDetails)
    const limit = goal.free_meals_per_week ?? 0
    return { goal, used, limit, excess: Math.max(0, used - limit) }
  })
})
const isDone = (goal: Goal, date: Date) =>
  isGoalDone(goal, localKey(date), props.completions, props.dayDetails)
const detailFor = (goal: Goal, date: Date) =>
  props.dayDetails.find((entry) => entry.goal_id === goal.id && entry.local_date === localKey(date))
const mealCount = (goal: Goal, date: Date) => {
  const detail = detailFor(goal, date)
  // Optional meals that were not recorded stay out of the count.
  const options = (detail?.meal_options || mealOptionsForDate(goal, date)).filter((option) =>
    countsForDay(option, detail),
  )
  return {
    checked: detail
      ? options.filter(({ id }) => detail.meals[id]?.checked).length
      : isDone(goal, date)
        ? options.length
        : 0,
    total: options.length,
    adherent: detail?.adherence_recorded
      ? options.filter(({ id }) => isMealAllowed(goal, localKey(date), id, props.dayDetails)).length
      : null,
  }
}
const checklistCount = (goal: Goal, date: Date) => {
  const detail = detailFor(goal, date)
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
const weeklyCount = (goal: Goal, date: Date) =>
  weeklyEntries(
    [props.goals.find((entry) => entry.id === goal.id) || goal],
    props.completions,
    mondayOf(date),
    props.history,
    props.dayDetails,
  )[0]
// Simple goals are marked straight from the card; goals with meals or checklist
// items open the day record, where each item is filled in.
const canQuickToggle = (goal: Goal, date: Date) =>
  !props.readonly && goal.category !== 'alimentacao' && checklistCount(goal, date).total === 0
const taskSummary = (goal: Goal, date: Date) => {
  if (goal.category === 'alimentacao') {
    const count = mealCount(goal, date)
    return count.adherent === null
      ? `${count.checked}/${count.total} registradas`
      : `${count.adherent}/${count.total} refeições válidas`
  }
  if (goal.goal_mode === 'weekly') {
    const count = weeklyCount(goal, date)
    const target = count?.target || 1
    return `${Math.min(count?.completed || 0, target)}/${target} idas na semana`
  }
  const count = checklistCount(goal, date)
  return count.total ? `${count.checked}/${count.total} itens` : categoryName(goal.category)
}
</script>

<template>
  <div v-if="!readonly" class="page-heading">
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
    <button class="small-button heading-action" @click="emit('newGoal')">
      <Plus :size="17" aria-hidden="true" /><span class="heading-action-label">Nova meta</span>
    </button>
  </div>
  <section class="progress-overview" aria-label="Progresso da semana e do mês">
    <TodayCard
      :goals="goals"
      :completions="completions"
      :history="history"
      :day-details="dayDetails"
      :readonly="readonly"
      @open-day="emit('openDay', $event)"
    />
    <ProgressCard
      title="Semana"
      :period="label"
      :percent="pace.percent"
      :caption="future ? 'Semana futura' : current ? 'Até hoje' : 'Semana encerrada'"
    />
    <ProgressCard
      title="Mês"
      :period="overviewMonthLabel"
      :percent="monthlyProgress.percent"
      :caption="monthCaption"
    />
  </section>
  <section class="week-section">
    <div class="section-heading">
      <div>
        <span class="eyebrow">CHECKLIST</span>
        <h2>{{ readonly ? 'Plano da semana' : 'Seu plano da semana' }}</h2>
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
    <button
      v-if="!current || (mobileWeek && selectedWeekDay !== todayKey())"
      class="today-link"
      @click="emit('currentWeek')"
    >
      Voltar para hoje
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
    <div v-if="mobileWeek" class="week-strip" role="group" aria-label="Escolher dia da semana">
      <button
        v-for="date in days"
        :key="localKey(date)"
        type="button"
        :class="{
          selected: localKey(date) === selectedWeekDay,
          'is-today': localKey(date) === todayKey(),
        }"
        :aria-label="`Selecionar dia ${date.toLocaleDateString('pt-BR')}`"
        :aria-pressed="localKey(date) === selectedWeekDay"
        @click="selectedWeekDay = localKey(date)"
      >
        <span>{{ fullWeekdays[date.getDay()]!.slice(0, 1) }}</span
        ><strong>{{ date.getDate() }}</strong
        ><small>{{ localKey(date) === todayKey() ? 'Hoje' : '' }}</small>
      </button>
    </div>
    <div v-if="!days.some((date) => planned(date).length)" class="empty-state">
      <Sparkles :size="32" aria-hidden="true" />
      <h3>Nenhuma meta nesta semana</h3>
      <p v-if="readonly">Não há metas compartilhadas previstas para esta semana.</p>
      <template v-else>
        <p>Crie uma meta para montar seu checklist semanal.</p>
        <button class="primary-button" @click="emit('showGoals')">Ver minhas metas</button>
      </template>
    </div>
    <div v-else class="days-grid">
      <article
        v-for="date in visibleDays"
        :key="localKey(date)"
        :class="['day-card', { 'is-today': localKey(date) === todayKey() }]"
      >
        <div class="day-heading">
          <button
            type="button"
            class="day-open"
            :aria-label="`Abrir registros de ${date.toLocaleDateString('pt-BR')}`"
            @click="emit('openDay', date)"
          >
            <span>{{ fullWeekdays[date.getDay()] }}</span
            ><strong
              >{{ date.getDate() }}
              <small>{{ date.toLocaleDateString('pt-BR', { month: 'short' }) }}</small></strong
            >
          </button>
          <span v-if="localKey(date) === todayKey()" class="today-pill">HOJE</span>
        </div>
        <div v-if="planned(date).length" class="tasks">
          <div
            v-for="goal in planned(date)"
            :key="goal.id"
            :class="['task', goal.category, { done: isDone(goal, date) }]"
          >
            <button
              v-if="canQuickToggle(goal, date)"
              type="button"
              class="task-check"
              role="checkbox"
              :aria-checked="isDone(goal, date)"
              :aria-label="`Marcar ${goal.title} em ${date.toLocaleDateString('pt-BR')}`"
              @click="emit('toggle', goal, date)"
            >
              <span class="check-visual" aria-hidden="true"><Check :size="18" /></span>
            </button>
            <span v-else class="check-visual" aria-hidden="true"><Check :size="18" /></span>
            <button
              type="button"
              class="task-open"
              :aria-label="`${goal.title}: ${isDone(goal, date) ? 'Concluída' : 'Pendente'}. Detalhar em ${date.toLocaleDateString('pt-BR')}`"
              @click="emit('openDay', date)"
            >
              <span class="task-title"
                >{{ goal.title }}<small>{{ taskSummary(goal, date) }}</small></span
              >
            </button>
            <span class="task-category-icon" :class="goal.category" aria-hidden="true"
              ><Dumbbell v-if="goal.category === 'treino'" :size="20" /><Utensils
                v-else-if="goal.category === 'alimentacao'"
                :size="20" /><ClipboardList v-else :size="20"
            /></span>
          </div>
        </div>
        <p v-else class="rest-day">Dia livre para respirar ☀</p>
        <button
          v-if="planned(date).length"
          type="button"
          class="day-edit-action"
          @click="emit('openDay', date)"
        >
          <template v-if="readonly"><Eye :size="18" aria-hidden="true" /> Ver dia</template>
          <template v-else><Pencil :size="18" aria-hidden="true" /> Editar dia</template>
        </button>
      </article>
    </div>
  </section>
  <InsightsPanel
    :goals="goals"
    :completions="completions"
    :history="history"
    :day-details="dayDetails"
    :monday="monday"
    :month="overviewMonth"
    @overlay-change="emit('overlayChange', $event)"
    @open-day="emit('openDay', $event)"
  />
</template>
