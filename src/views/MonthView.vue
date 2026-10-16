<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue'
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
import { monthStats } from '../lib/month'

const props = defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}>()
const emit = defineEmits<{ openDay: [date: Date]; currentWeek: [] }>()
const monthDate = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const monthDays = computed(() => calendarDays(monthDate.value))
const monthTitle = computed(() =>
  monthDate.value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
)
const isCurrentMonth = computed(
  () =>
    monthDate.value.getFullYear() === new Date().getFullYear() &&
    monthDate.value.getMonth() === new Date().getMonth(),
)
const progress = computed(() =>
  monthStats(
    props.goals,
    props.completions,
    props.history,
    props.dayDetails,
    monthDate.value,
    new Date(),
  ),
)
function shiftMonth(amount: number) {
  monthDate.value = new Date(monthDate.value.getFullYear(), monthDate.value.getMonth() + amount, 1)
}
function daySummary(date: Date) {
  const day = localKey(date)
  const entries = props.goals
    .map((goal) => goalForDate(goal, props.history, date))
    .filter((goal) => scheduledFor(goal, date))
    .filter(
      (goal) =>
        goal.goal_mode !== 'weekly' ||
        props.completions.some((entry) => entry.goal_id === goal.id && entry.local_date === day) ||
        props.dayDetails.some((entry) => entry.goal_id === goal.id && entry.local_date === day),
    )
  const counts = entries.map((goal) =>
    goalProgressCounts(goal, day, props.completions, props.dayDetails),
  )
  const total = counts.reduce((sum, entry) => sum + entry.total, 0)
  return {
    percent: total ? (counts.reduce((sum, entry) => sum + entry.completed, 0) / total) * 100 : 0,
    total: entries.length,
    completed: entries.filter((goal) =>
      isGoalDone(goal, localKey(date), props.completions, props.dayDetails),
    ).length,
  }
}
</script>

<template>
  <div class="page-heading month-page-heading">
    <div>
      <span class="eyebrow">VISÃO DO MÊS</span>
      <h1>Seu mês, <em>dia a dia.</em></h1>
      <p>Escolha uma data para ver e editar suas metas.</p>
    </div>
    <button class="small-button" @click="emit('currentWeek')">
      <CalendarDays :size="17" /> Ver esta semana
    </button>
  </div>
  <div class="month-overview">
    <div>
      <span class="eyebrow">PROGRESSO ATÉ HOJE</span>
      <strong>{{ progress.percent }}%</strong>
      <small>Cada refeição conta no percentual; livres permitidas também.</small>
      <small
        >{{ progress.dueCompleted }} de {{ progress.dueTotal }} atividades previstas até hoje</small
      >
    </div>
    <div>
      <span class="eyebrow">PLANO DO MÊS</span>
      <strong
        >{{ progress.completed }} <span>/ {{ progress.total }}</span></strong
      >
      <small>atividades concluídas no mês</small>
    </div>
    <div class="month-overview-tip">
      <CalendarDays :size="25" />
      <p>Toque em um dia para abrir seu registro. Metas semanais entram no mês da segunda-feira.</p>
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
          Mês atual
        </button>
        <button type="button" aria-label="Mês anterior" @click="shiftMonth(-1)">
          <ChevronLeft :size="19" />
        </button>
        <button type="button" aria-label="Próximo mês" @click="shiftMonth(1)">
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
        @click="emit('openDay', date)"
      >
        <span class="calendar-date">{{ date.getDate() }}</span>
        <span v-if="daySummary(date).total" class="calendar-day-content">
          <span class="calendar-count"
            >{{ daySummary(date).completed }}/{{ daySummary(date).total }}</span
          >
          <span class="calendar-progress"
            ><span :style="{ width: `${daySummary(date).percent}%` }"></span
          ></span>
          <small>{{ daySummary(date).total === 1 ? 'meta' : 'metas' }}</small>
        </span>
        <span v-else class="calendar-free">Livre</span>
      </button>
    </div>
  </section>
</template>
