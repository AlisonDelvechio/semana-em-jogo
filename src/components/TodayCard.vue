<script setup lang="ts">
import { computed } from 'vue'
import { Sun, Pencil } from '@lucide/vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import {
  goalForDate,
  goalProgressCounts,
  isGoalDone,
  localKey,
  mondayOf,
  scheduledFor,
  weeklyEntries,
} from '../lib/dates'
import { currentDate } from '../lib/today'
const props = defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}>()
const emit = defineEmits<{ openDay: [date: Date] }>()
const today = computed(() => currentDate())
const planned = computed(() =>
  props.goals
    .map((goal) => goalForDate(goal, props.history, today.value))
    .filter((goal) => scheduledFor(goal, today.value)),
)
const meals = computed(() =>
  planned.value
    .filter((goal) => goal.category === 'alimentacao')
    .reduce(
      (sum, goal) => {
        const counts = goalProgressCounts(
          goal,
          localKey(today.value),
          props.completions,
          props.dayDetails,
        )
        return { completed: sum.completed + counts.completed, total: sum.total + counts.total }
      },
      { completed: 0, total: 0 },
    ),
)
const daily = computed(() => {
  const goals = planned.value.filter(
    (goal) => goal.category !== 'alimentacao' && goal.goal_mode !== 'weekly',
  )
  return {
    total: goals.length,
    completed: goals.filter((goal) =>
      isGoalDone(goal, localKey(today.value), props.completions, props.dayDetails),
    ).length,
  }
})
const weekly = computed(() =>
  weeklyEntries(
    props.goals.filter((goal) => planned.value.some((entry) => entry.id === goal.id)),
    props.completions,
    mondayOf(today.value),
    props.history,
    props.dayDetails,
    today.value,
  ),
)
const remaining = computed(() =>
  weekly.value.reduce((sum, row) => sum + Math.max(0, row.target - row.completed), 0),
)
</script>
<template>
  <article class="today-summary-card" aria-labelledby="today-summary-title">
    <div class="today-summary-heading">
      <Sun :size="22" aria-hidden="true" />
      <h2 id="today-summary-title">Hoje</h2>
      <span>{{ today.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) }}</span>
    </div>
    <div class="today-summary-counts">
      <p v-if="meals.total">
        <strong>{{ meals.completed }}/{{ meals.total }}</strong> refeições contabilizadas
      </p>
      <p v-if="daily.total">
        <strong>{{ daily.completed }}/{{ daily.total }}</strong> atividades do dia concluídas
      </p>
      <p v-if="weekly.length">
        {{
          remaining
            ? `${remaining} ${remaining === 1 ? 'ida restante' : 'idas restantes'} na semana`
            : 'Frequências semanais atingidas'
        }}
      </p>
      <p v-if="!planned.length">Nenhuma meta prevista hoje.</p>
    </div>
    <button
      v-if="planned.length"
      type="button"
      class="small-button"
      @click="emit('openDay', today)"
    >
      <Pencil :size="18" aria-hidden="true" /> Registrar hoje
    </button>
  </article>
</template>
