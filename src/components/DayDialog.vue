<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  ListChecks,
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
import { capitalizeFirst } from '../lib/format'
import { categoryName, plannedGoals } from '../lib/goals'
import { createOption, moveMeal, OPTION_NAME_ERROR } from '../lib/meals'
import { currentDate } from '../lib/today'
import InlineAlert from './InlineAlert.vue'
import {
  defaultMealOptions,
  type Completion,
  type Goal,
  type GoalDayDetail,
  type GoalHistory,
  type MealAdherence,
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
  // Someone following this person's records (migration 012): view only, nothing is saved.
  readonly?: boolean
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
// Version of each record when the dialog opened, sent with the save so the database can
// refuse it if another device saved this day in the meantime. Records loaded before
// migration 011 have no updated_at: the check is skipped for them.
const openedVersions = new Map(
  planned.map((goal) => {
    const detail = props.dayDetails.find(
      (entry) => entry.goal_id === goal.id && entry.local_date === day,
    )
    return [goal.id, detail ? detail.updated_at : null] as const
  }),
)
const drafts = ref<Record<string, DayDraft>>(
  Object.fromEntries(planned.map((goal) => [goal.id, initialDraft(goal)])),
)
const draft = (goal: Goal) => drafts.value[goal.id]!
const newItems = ref<Record<string, string>>({})
// Goals whose items show the add, reorder and remove controls.
const editingItems = ref<Record<string, boolean>>({})

// One tap registers the meal and its adherence; tapping the chosen option again clears it.
const adherenceChoices: { value: MealAdherence; label: string; tone: string }[] = [
  { value: true, label: 'No plano', tone: 'on-plan' },
  { value: 'free', label: 'Livre', tone: 'free' },
  { value: false, label: 'Fora do plano', tone: 'off-plan' },
]
const isChosen = (goal: Goal, id: string, value: MealAdherence) =>
  Boolean(draft(goal).items[id]?.checked) && draft(goal).items[id]?.adherent === value
// Older records may mark a meal as eaten without saying whether it followed the plan.
const isUnclassified = (goal: Goal, id: string) =>
  Boolean(draft(goal).items[id]?.checked) && (draft(goal).items[id]?.adherent ?? null) === null
function choose(goal: Goal, id: string, value: MealAdherence) {
  const item = draft(goal).items[id]!
  const clear = isChosen(goal, id, value)
  item.checked = !clear
  item.adherent = clear ? null : value
  draft(goal).trackAdherence = true
}
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
// Applies to this date only; the goal's own setting is changed in the goal editor.
function setOptional(option: MealOption, event: Event) {
  if ((event.target as HTMLInputElement).checked) option.optional = true
  else delete option.optional
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
        // Non-food goals still store a meal list (the database requires 1 to 12 items).
        meal_options: food
          ? current.options
          : goal.meal_options?.length
            ? goal.meal_options
            : defaultMealOptions,
        checklist: food ? {} : current.items,
        checklist_options: food ? [] : current.options,
        note: current.note,
      },
      completed: completed === wasCompleted ? undefined : completed,
      expectedUpdatedAt: openedVersions.get(goal.id),
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
          <span class="eyebrow">{{ readonly ? 'REGISTRO DO DIA' : 'EDITAR DIA' }}</span>
          <h2 id="day-dialog-title">
            {{
              capitalizeFirst(
                date.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
              )
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
        <!-- A disabled fieldset turns every control inside it read-only at once. -->
        <fieldset class="day-goals" :disabled="readonly">
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
              <button
                v-if="!readonly"
                type="button"
                class="text-button day-goal-edit"
                :aria-expanded="Boolean(editingItems[goal.id])"
                :aria-label="`${editingItems[goal.id] ? 'Fechar edição dos itens' : 'Editar itens'} de ${goal.title}`"
                @click="editingItems[goal.id] = !editingItems[goal.id]"
              >
                <Check v-if="editingItems[goal.id]" :size="16" aria-hidden="true" /><ListChecks
                  v-else
                  :size="16"
                  aria-hidden="true"
                />{{ editingItems[goal.id] ? 'Pronto' : 'Editar itens' }}
              </button>
            </div>
            <details
              v-if="!readonly && (goal.category === 'alimentacao' || draft(goal).options.length)"
              class="dialog-help"
            >
              <summary>Como funciona?</summary>
              <p v-if="goal.category === 'alimentacao'">
                Toque em <strong>No plano</strong>, <strong>Livre</strong> ou
                <strong>Fora do plano</strong> para registrar cada refeição; toque de novo para
                desmarcar. Seguir o plano ou usar uma refeição livre dentro do limite conta para
                concluir o dia. As livres são opcionais: seguir a dieta sem usar nenhuma também
                conclui a meta. O contador inclui as alterações ainda não salvas.
              </p>
              <p v-else>Marque todos os itens para concluir esta meta do dia.</p>
              <p>
                Em <strong>Editar itens</strong>, adicione, remova ou reordene itens só desta data.
                Refeições <strong>opcionais</strong> só contam quando você as registra; sem
                registro, não entram no percentual nem impedem a meta de ser concluída.
              </p>
            </details>
            <template v-if="goal.category === 'alimentacao'">
              <div class="free-meal-summary" role="status">
                <span
                  >Refeições livres nesta semana:
                  <strong
                    >{{ freeUsage(goal).used }} de {{ freeUsage(goal).limit }} permitidas</strong
                  >
                  <small v-if="freeUsage(goal).excess"
                    >{{ freeUsage(goal).excess }} além do limite. As excedentes não contam para
                    concluir a meta.</small
                  >
                  <small v-if="draft(goal).freeMealLimitOverride !== null"
                    >Limite corrigido para esta data.</small
                  >
                  <small v-else-if="(goal.free_meals_per_week ?? 0) !== currentFreeMealLimit(goal)"
                    >Este dia usa o limite histórico. A meta atual permite
                    {{ currentFreeMealLimit(goal) }}; use “Corrigir limite deste dia” abaixo para
                    ajustar.</small
                  >
                </span>
              </div>
              <details
                v-if="!readonly && (isPast || draft(goal).freeMealLimitOverride !== null)"
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
            </template>
            <div
              v-for="(option, index) in draft(goal).options"
              :key="option.id"
              :class="['meal-row', { 'food-row': goal.category === 'alimentacao' }]"
            >
              <template v-if="goal.category === 'alimentacao'">
                <span :id="`meal-${goal.id}-${option.id}`" class="meal-name"
                  >{{ option.label
                  }}<span v-if="option.optional" class="optional-tag">Opcional</span></span
                >
                <div
                  class="adherence-options"
                  role="group"
                  :aria-labelledby="`meal-${goal.id}-${option.id}`"
                >
                  <button
                    v-for="choice in adherenceChoices"
                    :key="String(choice.value)"
                    type="button"
                    :class="['adherence-option', choice.tone]"
                    :aria-pressed="isChosen(goal, option.id, choice.value)"
                    @click="choose(goal, option.id, choice.value)"
                  >
                    <Check
                      v-if="isChosen(goal, option.id, choice.value)"
                      :size="16"
                      aria-hidden="true"
                    />{{ choice.label }}
                  </button>
                </div>
                <small v-if="isUnclassified(goal, option.id)" class="meal-legacy"
                  >Registrada sem classificação. Escolha uma opção para atualizar.</small
                >
                <small v-if="freeMealExceeded(goal, option.id)" class="free-meal-warning"
                  >Esta refeição excede o limite semanal e não conta para a meta.</small
                >
              </template>
              <label v-else class="meal-check"
                ><input v-model="draft(goal).items[option.id]!.checked" type="checkbox" />{{
                  option.label
                }}</label
              >
              <textarea
                v-if="!readonly || draft(goal).items[option.id]!.description"
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
              <div v-if="editingItems[goal.id]" class="meal-item-tools">
                <label v-if="goal.category === 'alimentacao'" class="option-optional"
                  ><input
                    type="checkbox"
                    :checked="Boolean(option.optional)"
                    :aria-label="`${option.label} é opcional neste dia`"
                    @change="setOptional(option, $event)"
                  />Opcional neste dia</label
                >
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
            </div>
            <p
              v-if="goal.category === 'alimentacao' && !draft(goal).trackAdherence && !readonly"
              class="meal-hint"
            >
              Registro antigo sem avaliação de aderência. Classifique as refeições para atualizar
              este dia.
            </p>
            <label
              v-if="goal.category !== 'alimentacao' && !draft(goal).options.length"
              class="meal-check completion-check"
              ><input v-model="draft(goal).completed" type="checkbox" />{{
                goal.goal_mode === 'weekly' ? 'Fiz esta atividade hoje' : 'Meta concluída'
              }}</label
            >
            <div v-if="editingItems[goal.id]" class="meal-add">
              <input
                v-model="newItems[goal.id]"
                type="text"
                maxlength="40"
                :placeholder="
                  goal.category === 'alimentacao'
                    ? 'Outra refeição neste dia'
                    : 'Novo item neste dia'
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
            <label v-if="!readonly || draft(goal).note" class="day-note"
              >Observação do dia (opcional)<textarea
                v-model="draft(goal).note"
                maxlength="500"
                rows="2"
                placeholder="Adicione um detalhe que queira lembrar"
              ></textarea>
            </label>
          </div>
        </fieldset>
        <div v-if="readonly" class="dialog-actions">
          <button type="button" class="primary-button" @click="emit('close')">Fechar</button>
        </div>
        <div v-else class="dialog-actions">
          <button type="button" class="text-button" @click="emit('close')">Cancelar</button
          ><button type="submit" class="primary-button" :disabled="busy">
            {{ busy ? 'Salvando...' : 'Salvar dia' }}
          </button>
        </div>
        <InlineAlert v-if="error || message" :message="error || message" />
      </form>
    </section>
  </div>
</template>
