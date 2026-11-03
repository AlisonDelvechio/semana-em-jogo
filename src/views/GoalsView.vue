<script setup lang="ts">
import {
  CirclePause,
  CirclePlay,
  ClipboardList,
  Dumbbell,
  Pencil,
  Plus,
  Trash2,
  Utensils,
} from '@lucide/vue'
import { weekdays } from '../lib/dates'
import { categoryName } from '../lib/goals'
import type { BackupRecord } from '../lib/report'
import ReportsPanel from '../components/ReportsPanel.vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'

defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
  busy: boolean
  restore: (records: BackupRecord[]) => Promise<string>
}>()
const emit = defineEmits<{
  newGoal: []
  edit: [goal: Goal]
  pause: [goal: Goal]
  remove: [goal: Goal]
}>()

const schedule = (goal: Goal) =>
  (goal.goal_mode === 'weekly'
    ? `${goal.weekly_target || 1}x por semana · dias livres`
    : goal.scheduled_weekdays.map((day) => weekdays[day]).join(', ')) +
  (goal.start_date && goal.duration_days
    ? ` · ${goal.duration_days} dias desde ${new Date(`${goal.start_date}T12:00:00`).toLocaleDateString('pt-BR')}`
    : '')
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">SEU PLANO</span>
      <h1>Metas que cabem <em>na vida.</em></h1>
      <p>Escolha ações simples que você gostaria de repetir.</p>
    </div>
    <button type="button" class="small-button" @click="emit('newGoal')">
      <Plus :size="17" /> Nova meta
    </button>
  </div>

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
        <ClipboardList v-else :size="22" aria-hidden="true" />
      </div>
      <div class="goal-details">
        <strong>{{ goal.title }}</strong
        ><span>{{ categoryName(goal.category) }} · {{ schedule(goal) }}</span
        ><small v-if="goal.category === 'alimentacao'"
          >Até {{ goal.free_meals_per_week ?? 0 }} refeições livres por semana · opcionais</small
        ><small v-if="!goal.active">Pausada</small>
      </div>
      <div class="goal-actions">
        <button
          :disabled="busy"
          :aria-label="goal.active ? `Pausar ${goal.title}` : `Ativar ${goal.title}`"
          @click="emit('pause', goal)"
        >
          <CirclePause v-if="goal.active" :size="20" aria-hidden="true" /><CirclePlay
            v-else
            :size="20"
            aria-hidden="true"
          /><span>{{ goal.active ? 'Pausar' : 'Retomar' }}</span></button
        ><button :aria-label="`Editar ${goal.title}`" @click="emit('edit', goal)">
          <Pencil :size="20" aria-hidden="true" /><span>Editar</span></button
        ><button
          :disabled="busy"
          :aria-label="`Excluir ${goal.title}`"
          @click="emit('remove', goal)"
        >
          <Trash2 :size="20" aria-hidden="true" /><span>Excluir</span>
        </button>
      </div>
    </article>
  </section>
  <ReportsPanel
    :goals="goals"
    :completions="completions"
    :history="history"
    :day-details="dayDetails"
    :busy="busy"
    :restore="restore"
  />
</template>
