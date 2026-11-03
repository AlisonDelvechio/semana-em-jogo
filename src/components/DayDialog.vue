<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Plus,
  Utensils,
  X,
} from '@lucide/vue'
import type { DayEntry } from '../lib/data'
import {
  checklistOptionsForDate,
  freeMealUsage,
  goalProgress,
  isGoalDone,
  isMealAllowed,
  localKey,
  mealOptionsForDate,
} from '../lib/dates'
import { trapFocus } from '../lib/focus'
import { categoryName, plannedGoals } from '../lib/goals'
import { createOption, moveMeal, OPTION_NAME_ERROR } from '../lib/meals'
import { currentDate } from '../lib/today'
import {
  defaultMealOptions,
  type Completion,
  type Goal,
  type GoalDayDetail,
  type GoalHistory,
  type MealEntries,
  type MealOption,
} from '../types'

const props = defineProps<{
  date: Date
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
  busy: boolean
  // Error reported by the app while saving.
  message: string
}>()
const emit = defineEmits<{
  close: []
  save: [localDate: string, entries: DayEntry[]]
  openWeek: [date: Date]
}>()

type DayDraft = {
  items: MealEntries
  options: MealOption[]
  note: string
  completed: boolean
  trackAdherence: boolean
  freeMealLimitOverride: number | null
}

const day = localKey(props.date)
const isPast = day < localKey(currentDate())
// The goal versions are fixed while the dialog is open, so a background reload cannot
// remove a goal that still has a draft here.
const planned = plannedGoals(props.goals, props.history, props.date)
const isDone = (goal: Goal) => isGoalDone(goal, day, props.completions, props.dayDetails)
const summary = computed(() => {
  const entries = planned.filter(
    (goal) =>
      goal.goal_mode !== 'weekly' ||
      props.completions.some((entry) => entry.goal_id === goal.id && entry.local_date === day) ||
      props.dayDetails.some((entry) => entry.goal_id === goal.id && entry.local_date === day),
  )
  return { total: entries.length, completed: entries.filter(isDone).length }
})

function initialDraft(goal: Goal): DayDraft {
  const food = goal.category === 'alimentacao'
  const detail = props.dayDetails.find(
    (entry) => entry.goal_id === goal.id && entry.local_date === day,
  )
  const completed = isDone(goal)
  const options = (
    food
      ? detail?.meal_options || mealOptionsForDate(goal, props.date)
      : detail?.checklist_options?.length
        ? detail.checklist_options
        : checklistOptionsForDate(goal, props.date)
  ).map((option) => ({ ...option }))
  const entries = food ? detail?.meals : detail?.checklist
  const items = Object.fromEntries(
    options.map(({ id }) => [
      id,
      {
        checked:
          entries?.[id]?.checked ?? (completed && (food || !detail?.checklist_options?.length)),
        description: entries?.[id]?.description || '',
        adherent: entries?.[id]?.adherent ?? null,
      },
    ]),
  ) as MealEntries
  return {
    items,
    options,
    note: detail?.note || '',
    completed,
    trackAdherence: detail?.adherence_recorded ?? !detail,
    freeMealLimitOverride: detail?.free_meals_limit_override ?? null,
  }
}
const drafts = ref<Record<string, DayDraft>>(
  Object.fromEntries(planned.map((goal) => [goal.id, initialDraft(goal)])),
)
const draft = (goal: Goal) => drafts.value[goal.id]!
const newItems = ref<Record<string, string>>({})
const error = ref('')

const hasTemplateItems = (goal: Goal) => checklistOptionsForDate(goal, props.date).length > 0
const minimumItems = (goal: Goal) =>
  goal.category === 'alimentacao' || hasTemplateItems(goal) ? 1 : 0
function addItem(goal: Goal) {
  const current = draft(goal)
  const option = createOption(current.options, newItems.value[goal.id] || '')
  error.value = option ? '' : OPTION_NAME_ERROR
  if (!option) return
  current.options.push(option)
  current.items[option.id] = { checked: false, description: '' }
  newItems.value[goal.id] = ''
}
function removeItem(goal: Goal, id: string) {
  const current = draft(goal)
  if (current.options.length <= minimumItems(goal)) return
  current.options = current.options.filter((option) => option.id !== id)
  delete current.items[id]
}
function moveItem(goal: Goal, id: string, offset: -1 | 1) {
  draft(goal).options = moveMeal(draft(goal).options, id, offset)
}

// Day records including the unsaved changes, so counters reflect the draft.
function detailsWithDraft(goal: Goal): GoalDayDetail[] {
  const current = draft(goal)
  return [
    ...props.dayDetails.filter((detail) => detail.goal_id !== goal.id || detail.local_date !== day),
    {
      goal_id: goal.id,
      user_id: goal.user_id,
      local_date: day,
      meals: current.items,
      meal_options: current.options,
      adherence_recorded: current.trackAdherence,
      free_meals_limit_override: current.freeMealLimitOverride,
      note: current.note,
    },
  ]
}
const freeUsage = (goal: Goal) => freeMealUsage(goal, day, detailsWithDraft(goal))
const currentFreeMealLimit = (goal: Goal) =>
  props.goals.find((entry) => entry.id === goal.id)?.free_meals_per_week ?? 0
const freeMealExceeded = (goal: Goal, id: string) =>
  draft(goal).items[id]?.checked &&
  draft(goal).items[id]?.adherent === 'free' &&
  !isMealAllowed(goal, day, id, detailsWithDraft(goal))
const mealProgress = (goal: Goal) =>
  Math.round(goalProgress(goal, day, props.completions, detailsWithDraft(goal)) * 100)
function correctLimit(goal: Goal, event: Event) {
  draft(goal).freeMealLimitOverride = (event.target as HTMLInputElement).valueAsNumber
}

function resizeDescription(input: HTMLTextAreaElement) {
  input.style.height = 'auto'
  input.style.height = `${input.scrollHeight + 2}px`
}

function submit() {
  for (const goal of planned) {
    const limit = draft(goal).freeMealLimitOverride
    if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 84)) {
      error.value = 'Escolha de 0 a 84 refeições livres para corrigir este dia.'
      return
    }
  }
  error.value = ''
  // All goals of the day are stored together, so a failure never leaves half a day saved.
  const entries: DayEntry[] = planned.map((goal) => {
    const current = draft(goal)
    const food = goal.category === 'alimentacao'
    const completed = food
      ? undefined
      : current.options.length
        ? current.options.every(({ id }) => current.items[id]?.checked)
        : current.completed
    const wasCompleted = props.completions.some(
      (entry) => entry.goal_id === goal.id && entry.local_date === day,
    )
    return {
      detail: {
        goal_id: goal.id,
        local_date: day,
        meals: food ? current.items : {},
        adherence_recorded: food && current.trackAdherence,
        free_meals_limit_override: food ? current.freeMealLimitOverride : null,
        meal_options: food ? current.options : goal.meal_options || defaultMealOptions,
        checklist: food ? {} : current.items,
        checklist_options: food ? [] : current.options,
        note: current.note,
      },
      completed: completed === wasCompleted ? undefined : completed,
    }
  })
  emit('save', day, entries)
}

const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
onMounted(async () => {
  await nextTick()
  dialog.value
    ?.querySelectorAll<HTMLTextAreaElement>('.meal-description')
    .forEach(resizeDescription)
  closeButton.value?.focus()
})
onUnmounted(() => trigger?.focus())
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section
      ref="dialog"
      class="day-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-dialog-title"
      @keydown="trapFocus($event, dialog)"
    >
      <div class="dialog-header">
        <div>
          <span class="eyebrow">EDITAR DIA</span>
          <h2 id="day-dialog-title">
            {{
              date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
            }}
          </h2>
        </div>
        <button
          type="button"
          ref="closeButton"
          class="dialog-close"
          aria-label="Fechar"
          @click="emit('close')"
        >
          <X :size="21" />
        </button>
      </div>
      <div v-if="planned.length" class="dialog-summary">
        <span>{{ summary.completed }} de {{ summary.total }} metas concluídas</span
        ><button type="button" @click="emit('openWeek', date)">
          Ver na semana <ChevronRight :size="18" />
        </button>
      </div>
      <p v-if="!planned.length" class="dialog-empty">Nenhuma meta programada para este dia.</p>
      <form v-else @submit.prevent="submit">
        <div v-for="goal in planned" :key="goal.id" class="day-goal">
          <div class="day-goal-title">
            <span class="goal-icon" :class="goal.category"
              ><Utensils v-if="goal.category === 'alimentacao'" :size="19" /><Dumbbell
                v-else-if="goal.category === 'treino'"
                :size="19" /><ClipboardList v-else :size="19"
            /></span>
            <div>
              <strong>{{ goal.title }}</strong
              ><small>{{ categoryName(goal.category) }}</small>
            </div>
          </div>
          <template v-if="goal.category === 'alimentacao' || draft(goal).options.length">
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
                  >{{ freeUsage(goal).used }} de {{ freeUsage(goal).limit }} permitidas</strong
                >
                <small v-if="draft(goal).freeMealLimitOverride !== null"
                  >Limite corrigido para esta data.</small
                >
                <small v-else-if="(goal.free_meals_per_week ?? 0) !== currentFreeMealLimit(goal)"
                  >Este dia usa o limite histórico. A meta atual permite
                  {{ currentFreeMealLimit(goal) }}; use “Corrigir limite deste dia” abaixo para
                  ajustar.</small
                >
                <small>{{
                  freeUsage(goal).excess
                    ? `${freeUsage(goal).excess} além do limite. As excedentes não contam para concluir a meta.`
                    : 'Você pode seguir a dieta sem usar nenhuma. O contador inclui as alterações deste dia.'
                }}</small>
              </span>
            </div>
            <details
              v-if="
                goal.category === 'alimentacao' &&
                (isPast || draft(goal).freeMealLimitOverride !== null)
              "
              class="day-limit-correction"
            >
              <summary>Corrigir limite deste dia</summary>
              <p>
                O limite histórico deste dia é {{ goal.free_meals_per_week ?? 0 }}. A meta atual
                permite {{ currentFreeMealLimit(goal) }} por semana. Você pode corrigir o limite
                considerado nesta data; a contagem continua incluindo as refeições livres da semana
                inteira.
              </p>
              <button
                v-if="draft(goal).freeMealLimitOverride !== currentFreeMealLimit(goal)"
                type="button"
                class="small-button use-current-limit"
                @click="draft(goal).freeMealLimitOverride = currentFreeMealLimit(goal)"
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
                  :value="draft(goal).freeMealLimitOverride ?? goal.free_meals_per_week ?? 0"
                  @input="correctLimit(goal, $event)"
                />
              </label>
              <button
                v-if="draft(goal).freeMealLimitOverride !== null"
                type="button"
                class="text-button"
                @click="draft(goal).freeMealLimitOverride = null"
              >
                Restaurar limite histórico
              </button>
              <p>Aplica somente a este dia ao salvar o registro.</p>
            </details>
            <div
              v-for="(option, index) in draft(goal).options"
              :key="option.id"
              :class="['meal-row', { 'food-row': goal.category === 'alimentacao' }]"
            >
              <label class="meal-check"
                ><input v-model="draft(goal).items[option.id]!.checked" type="checkbox" />{{
                  option.label
                }}</label
              >
              <label v-if="goal.category === 'alimentacao'" class="meal-adherence"
                >Aderência ao plano
                <span class="select-control"
                  ><select
                    v-model="draft(goal).items[option.id]!.adherent"
                    :disabled="!draft(goal).items[option.id]!.checked"
                    @change="draft(goal).trackAdherence = true"
                  >
                    <option :value="null">Não informada</option>
                    <option :value="true">Segui o plano</option>
                    <option value="free">Refeição livre</option>
                    <option :value="false">Fora do plano</option></select
                  ><ChevronDown :size="20" class="select-chevron" aria-hidden="true"
                /></span>
                <small v-if="freeMealExceeded(goal, option.id)" class="free-meal-warning"
                  >Esta refeição excede o limite semanal e não conta para a meta.</small
                >
              </label>
              <textarea
                v-model="draft(goal).items[option.id]!.description"
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
                @input="resizeDescription($event.target as HTMLTextAreaElement)"
              ></textarea>
              <div class="meal-order-actions">
                <button
                  type="button"
                  :disabled="index === 0"
                  :aria-label="`Subir ${option.label}`"
                  @click="moveItem(goal, option.id, -1)"
                >
                  <ArrowUp :size="18" /></button
                ><button
                  type="button"
                  :disabled="index === draft(goal).options.length - 1"
                  :aria-label="`Descer ${option.label}`"
                  @click="moveItem(goal, option.id, 1)"
                >
                  <ArrowDown :size="18" />
                </button>
              </div>
              <button
                type="button"
                class="meal-remove"
                :disabled="draft(goal).options.length === 1 && minimumItems(goal) === 1"
                :aria-label="`Remover ${option.label} deste dia`"
                @click="removeItem(goal, option.id)"
              >
                <X :size="18" />
              </button>
            </div>
          </template>
          <p
            v-if="goal.category === 'alimentacao' && !draft(goal).trackAdherence"
            class="meal-hint"
          >
            Registro antigo sem avaliação de aderência. Classifique as refeições para atualizar este
            dia.
          </p>
          <label v-if="goal.category !== 'alimentacao'" class="meal-check completion-check"
            ><input v-model="draft(goal).completed" type="checkbox" />{{
              goal.goal_mode === 'weekly' ? 'Fiz esta atividade hoje' : 'Meta concluída'
            }}</label
          >
          <div class="meal-add">
            <input
              v-model="newItems[goal.id]"
              type="text"
              maxlength="40"
              :placeholder="
                goal.category === 'alimentacao' ? 'Outra refeição neste dia' : 'Novo item neste dia'
              "
              :aria-label="`Novo item de ${goal.title} neste dia`"
              @keydown.enter.prevent="addItem(goal)"
            /><button type="button" class="small-button" @click="addItem(goal)">
              <Plus :size="18" /> Adicionar
            </button>
          </div>
          <p v-if="goal.category === 'alimentacao'" class="meal-hint meal-progress" role="status">
            {{ mealProgress(goal) }}% das refeições deste dia dentro do plano.
          </p>
          <label class="day-note"
            >Observação do dia (opcional)<textarea
              v-model="draft(goal).note"
              maxlength="500"
              rows="2"
              placeholder="Adicione um detalhe que queira lembrar"
            ></textarea>
          </label>
        </div>
        <div class="dialog-actions">
          <button type="button" class="text-button" @click="emit('close')">Cancelar</button
          ><button type="submit" class="primary-button" :disabled="busy">
            {{ busy ? 'Salvando...' : 'Salvar dia' }}
          </button>
        </div>
        <p v-if="error || message" role="alert" class="notice">{{ error || message }}</p>
      </form>
    </section>
  </div>
</template>
