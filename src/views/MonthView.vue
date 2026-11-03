<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import FormDialog from '../components/FormDialog.vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Dumbbell,
  Utensils,
  ClipboardList,
  Pencil,
} from '@lucide/vue'
import ProgressCard from '../components/ProgressCard.vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  calendarDays,
  goalForDate,
  goalProgressCounts,
  isGoalDone,
  localKey,
  scheduledFor,
  weekdays,
} from '../lib/dates'
import { currentDate, todayKey } from '../lib/today'
import { monthStats } from '../lib/month'

const props = defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}>()
const emit = defineEmits<{
  openDay: [date: Date]
  currentWeek: []
  overlayChange: [open: boolean]
}>()
const selectedDate = ref(currentDate())
const summaryOpen = ref(false)
watch(summaryOpen, (open) => emit('overlayChange', open), { flush: 'sync' })
onUnmounted(() => emit('overlayChange', false))
function selectDate(date: Date) {
  selectedDate.value = date
  summaryOpen.value = true
}
async function editSelectedDay() {
  summaryOpen.value = false
  await nextTick()
  emit('openDay', selectedDate.value)
}
const monthDate = ref(new Date(currentDate().getFullYear(), currentDate().getMonth(), 1))
const monthDays = computed(() => calendarDays(monthDate.value))
const monthTitle = computed(() =>
  monthDate.value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
)
const isCurrentMonth = computed(
  () =>
    monthDate.value.getFullYear() === currentDate().getFullYear() &&
    monthDate.value.getMonth() === currentDate().getMonth(),
)
const progress = computed(() =>
  monthStats(
    props.goals,
    props.completions,
    props.history,
    props.dayDetails,
    monthDate.value,
    currentDate(),
  ),
)
const monthCaption = computed(() =>
  isCurrentMonth.value
    ? 'Até hoje'
    : monthDate.value > currentDate()
      ? 'Mês futuro'
      : 'Mês encerrado',
)
function selectMonth(date: Date) {
  monthDate.value = new Date(date.getFullYear(), date.getMonth(), 1)
  selectedDate.value = isCurrentMonth.value ? currentDate() : new Date(monthDate.value)
}
// Left open across midnight on the last day of a month: keep showing "this month".
watch(todayKey, (next, previous) => {
  if (
    localKey(monthDate.value).slice(0, 7) === previous.slice(0, 7) &&
    next.slice(0, 7) !== previous.slice(0, 7)
  )
    selectMonth(currentDate())
})
function shiftMonth(amount: number) {
  selectMonth(new Date(monthDate.value.getFullYear(), monthDate.value.getMonth() + amount, 1))
}
function entriesForDate(date: Date) {
  const day = localKey(date)
  return props.goals
    .map((goal) => goalForDate(goal, props.history, date))
    .filter((goal) => scheduledFor(goal, date))
    .filter(
      (goal) =>
        goal.goal_mode !== 'weekly' ||
        props.completions.some((entry) => entry.goal_id === goal.id && entry.local_date === day) ||
        props.dayDetails.some((entry) => entry.goal_id === goal.id && entry.local_date === day),
    )
}
function daySummary(date: Date) {
  const entries = entriesForDate(date)
  const counts = entries.map((goal) =>
    goalProgressCounts(goal, localKey(date), props.completions, props.dayDetails),
  )
  const total = counts.reduce((sum, entry) => sum + entry.total, 0)
  const completed = counts.reduce((sum, entry) => sum + entry.completed, 0)
  return {
    percent: total ? Math.round((completed / total) * 100) : 0,
    status: total && completed === total ? 'complete' : completed ? 'partial' : 'pending',
    total: entries.length,
    completed: entries.filter((goal) =>
      isGoalDone(goal, localKey(date), props.completions, props.dayDetails),
    ).length,
  }
}
const selectedSummary = computed(() => daySummary(selectedDate.value))
const selectedGoals = computed(() => entriesForDate(selectedDate.value))
const selectedTitle = computed(() =>
  selectedDate.value.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }),
)
function goalCounts(goal: Goal) {
  return goalProgressCounts(goal, localKey(selectedDate.value), props.completions, props.dayDetails)
}
</script>

<template>
  <div class="page-heading month-page-heading">
    <div>
      <span class="eyebrow">VISÃO DO MÊS</span>
      <h1>Seu mês, <em>dia a dia.</em></h1>
      <p>Acompanhe seu progresso e escolha um dia no calendário.</p>
    </div>
    <button class="small-button" @click="emit('currentWeek')">
      <CalendarDays :size="20" aria-hidden="true" /> Ver esta semana
    </button>
  </div>
  <div class="month-progress-summary">
    <ProgressCard
      title="Mês"
      :period="monthTitle"
      :percent="progress.percent"
      :caption="monthCaption"
    />
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
          @click="selectMonth(currentDate())"
        >
          Mês atual
        </button>
        <button type="button" aria-label="Mês anterior" @click="shiftMonth(-1)">
          <ChevronLeft :size="20" />
        </button>
        <button type="button" aria-label="Próximo mês" @click="shiftMonth(1)">
          <ChevronRight :size="20" />
        </button>
      </div>
    </div>
    <div
      class="calendar-grid-scroll"
      tabindex="0"
      role="region"
      aria-label="Dias do mês; deslize horizontalmente se necessário"
    >
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
            'is-today': localKey(date) === localKey(currentDate()),
            selected: localKey(date) === localKey(selectedDate),
          }"
          :aria-pressed="localKey(date) === localKey(selectedDate)"
          :aria-label="`${date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}: ${daySummary(date).total ? `${daySummary(date).percent}% de progresso; ${daySummary(date).completed} de ${daySummary(date).total} metas concluídas` : 'sem metas previstas'}. Ver resumo`"
          @click="selectDate(date)"
        >
          <span class="calendar-date">{{ date.getDate() }}</span>
          <span
            v-if="daySummary(date).total"
            class="calendar-status"
            :class="daySummary(date).status"
            :style="{ '--day-progress': `${daySummary(date).percent}%` }"
            aria-hidden="true"
            ><Check v-if="daySummary(date).status === 'complete'" :size="14" :stroke-width="3"
          /></span>
          <span v-else class="calendar-no-goals" aria-hidden="true"></span>
          <span class="calendar-desktop-detail" aria-hidden="true">
            <span v-if="daySummary(date).total" class="calendar-day-totals">
              <span>{{
                localKey(date) > localKey(currentDate())
                  ? `${daySummary(date).total} metas previstas`
                  : `${daySummary(date).completed}/${daySummary(date).total} concluídas`
              }}</span>
              <strong v-if="localKey(date) <= localKey(currentDate())"
                >{{ daySummary(date).percent }}%</strong
              >
            </span>
            <span
              v-for="goal in entriesForDate(date).slice(0, 2)"
              :key="goal.id"
              class="calendar-goal"
              :class="{ done: isGoalDone(goal, localKey(date), completions, dayDetails) }"
            >
              <Check
                v-if="isGoalDone(goal, localKey(date), completions, dayDetails)"
                :size="14"
              /><span v-else class="calendar-goal-dot"></span><span>{{ goal.title }}</span>
            </span>
            <span v-if="daySummary(date).total > 2" class="calendar-more"
              >+{{ daySummary(date).total - 2 }} metas</span
            >
            <span v-if="!daySummary(date).total" class="calendar-empty">Sem metas previstas</span>
          </span>
        </button>
      </div>
    </div>
    <div class="calendar-legend" aria-label="Legenda do progresso diário">
      <span
        ><i class="calendar-status complete" aria-hidden="true"
          ><Check :size="14" :stroke-width="3"
        /></i>
        Concluído</span
      >
      <span
        ><i class="calendar-status partial" style="--day-progress: 50%" aria-hidden="true"></i>
        Parcial</span
      >
      <span><i class="calendar-status pending" aria-hidden="true"></i> Pendente</span>
    </div>
  </section>
  <Teleport to="body"
    ><FormDialog
      v-if="summaryOpen"
      :title="selectedTitle"
      title-id="selected-day-title"
      close-label="Fechar resumo do dia"
      class="calendar-summary-modal"
      @close="summaryOpen = false"
      ><section class="day-card selected-day-card" aria-label="Resumo do dia">
        <div class="selected-day-heading">
          <span v-if="selectedSummary.total"
            >{{ selectedSummary.completed }} de {{ selectedSummary.total }} metas concluídas</span
          >
        </div>
        <div v-if="selectedGoals.length" class="tasks">
          <button
            v-for="goal in selectedGoals"
            :key="goal.id"
            type="button"
            class="task"
            :class="{ done: isGoalDone(goal, localKey(selectedDate), completions, dayDetails) }"
            @click="editSelectedDay"
            :aria-label="`${goal.title}: ${isGoalDone(goal, localKey(selectedDate), completions, dayDetails) ? 'Concluída' : 'Pendente'}. Editar dia`"
          >
            <span class="check-visual" aria-hidden="true"><Check :size="18" /></span>
            <span class="task-title"
              >{{ goal.title
              }}<small
                >{{ goalCounts(goal).completed }} de {{ goalCounts(goal).total }}
                {{
                  goal.category === 'alimentacao' ? 'refeições válidas' : 'itens concluídos'
                }}</small
              ></span
            >
            <span class="task-category-icon" :class="goal.category" aria-hidden="true"
              ><Dumbbell v-if="goal.category === 'treino'" :size="20" /><Utensils
                v-else-if="goal.category === 'alimentacao'"
                :size="20" /><ClipboardList v-else :size="20"
            /></span>
          </button>
        </div>
        <p v-else class="rest-day">Nenhuma meta prevista ou registrada neste dia.</p>
        <button
          v-if="selectedGoals.length"
          type="button"
          class="day-edit-action"
          @click="editSelectedDay"
        >
          <Pencil :size="18" aria-hidden="true" /> Editar dia
        </button>
      </section></FormDialog
    ></Teleport
  >
</template>
