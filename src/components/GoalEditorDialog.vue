<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Check, ChevronDown, Plus, X } from '@lucide/vue'
import { fullWeekdays, localKey, weekdays } from '../lib/dates'
import { emptyGoalInput, goalToInput, INVALID_GOAL_MESSAGE, normalizeGoalInput } from '../lib/goals'
import { createOption, moveMeal, OPTION_NAME_ERROR } from '../lib/meals'
import { currentDate } from '../lib/today'
import FormDialog from './FormDialog.vue'
import InlineAlert from './InlineAlert.vue'
import NumberStepper from './NumberStepper.vue'
import WeekdayOptionsDialog from './WeekdayOptionsDialog.vue'
import type { Goal, GoalInput, MealOption } from '../types'

const props = defineProps<{
  // null creates a new goal.
  goal: Goal | null
  busy: boolean
  // Error reported by the app while saving.
  message: string
  // A confirmation dialog is open on top of the editor.
  confirming: boolean
}>()
const emit = defineEmits<{ close: []; save: [input: GoalInput] }>()

const form = ref<GoalInput>(props.goal ? goalToInput(props.goal) : emptyGoalInput())
const error = ref('')
const editingWeekday = ref<number | null>(null)

type OptionList = 'meal_options' | 'checklist_options'
// Text typed in each list's "add" field.
const newItem = ref<Record<OptionList, string>>({ meal_options: '', checklist_options: '' })
function addItem(list: OptionList) {
  const option = createOption(form.value[list], newItem.value[list])
  error.value = option ? '' : OPTION_NAME_ERROR
  if (!option) return
  form.value[list].push(option)
  newItem.value[list] = ''
}
function removeItem(list: OptionList, id: string) {
  if (list === 'meal_options' && form.value.meal_options.length <= 1) return
  form.value[list] = form.value[list].filter((option) => option.id !== id)
}
function moveItem(list: OptionList, id: string, offset: -1 | 1) {
  form.value[list] = moveMeal(form.value[list], id, offset)
}

const weekdayOptions = computed(() =>
  form.value.category === 'alimentacao'
    ? form.value.meal_options_by_weekday
    : form.value.checklist_options_by_weekday,
)
const defaultOptions = computed(() =>
  form.value.category === 'alimentacao' ? form.value.meal_options : form.value.checklist_options,
)
const optionsFor = (day: number) => weekdayOptions.value[String(day)] || defaultOptions.value
function resetWeekday(day: number) {
  delete weekdayOptions.value[String(day)]
}
function applyWeekday(options: MealOption[]) {
  if (editingWeekday.value === null) return
  weekdayOptions.value[String(editingWeekday.value)] = options.map((option) => ({ ...option }))
  editingWeekday.value = null
}

function toggleDay(day: number) {
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
    form.value.start_date = localKey(currentDate())
    form.value.duration_days = 14
    if (form.value.goal_mode === 'fixed' && !form.value.scheduled_weekdays.length)
      form.value.scheduled_weekdays = [0, 1, 2, 3, 4, 5, 6]
  } else {
    form.value.start_date = null
    form.value.duration_days = null
  }
}
function submit() {
  const input = normalizeGoalInput(form.value)
  error.value = input ? '' : INVALID_GOAL_MESSAGE
  if (input) emit('save', input)
}
</script>

<template>
  <FormDialog
    :inert="editingWeekday !== null || confirming"
    :title="goal ? 'Editar meta' : 'Nova meta'"
    description="Defina os detalhes da sua meta. Você pode ajustar quando quiser."
    :busy="busy"
    @close="emit('close')"
  >
    <form class="goal-form" @submit.prevent="submit">
      <div class="goal-basics-row">
        <label
          >O que você quer fazer?<input
            v-model="form.title"
            required
            maxlength="100"
            placeholder="Ex.: Fazer treino de força"
        /></label>
        <label
          >Categoria<span class="select-control"
            ><select v-model="form.category">
              <option value="treino">Treino</option>
              <option value="alimentacao">Alimentação</option>
              <option value="outro">Outro</option></select
            ><ChevronDown :size="20" class="select-chevron" aria-hidden="true" /></span
        ></label>
      </div>
      <div v-if="form.category === 'alimentacao'" class="free-meal-settings">
        <label
          >Refeições livres / semana
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
          São opcionais. Seguir a dieta em todas as refeições também conclui a meta. Use 0 para não
          permitir refeições livres. A semana vai de segunda a domingo.
        </p>
      </div>
      <fieldset v-if="form.category !== 'alimentacao'">
        <legend>Como contar esta meta?</legend>
        <div class="goal-frequency-row" :class="{ weekly: form.goal_mode === 'weekly' }">
          <label
            >Tipo de meta
            <span class="select-control"
              ><select :value="form.goal_mode" @change="changeMode">
                <option value="fixed">Dias fixos</option>
                <option value="weekly">Frequência semanal (dias livres)</option></select
              ><ChevronDown :size="20" class="select-chevron" aria-hidden="true"
            /></span>
          </label>
          <div v-if="form.goal_mode === 'weekly'" class="frequency-field">
            <label for="weekly-target">Quantas vezes na semana?</label>
            <NumberStepper
              v-model="form.weekly_target"
              input-id="weekly-target"
              label="frequência semanal"
              :min="1"
              :max="7"
            />
          </div>
        </div>
        <p v-if="form.goal_mode === 'weekly'">
          Marque os dias em que fez a atividade. A meta é concluída ao atingir a frequência semanal.
        </p>
      </fieldset>
      <div class="goal-period-settings">
        <label class="active-switch"
          ><input
            type="checkbox"
            :checked="form.duration_days !== null"
            @change="togglePeriod"
          /><span class="period-switch-text"
            ><span>Definir período da meta <span class="optional-label">Opcional</span></span
            ><small>Escolha quando a meta começa e por quantos dias ela vale.</small></span
          ></label
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
      </div>
      <fieldset v-if="form.category === 'alimentacao'" class="meal-options-field">
        <legend>Refeições para acompanhar</legend>
        <p>
          Estas opções aparecem nos dias da meta. Você pode ajustá-las em um dia específico depois.
        </p>
        <div class="meal-option-list">
          <span
            v-for="(option, index) in form.meal_options"
            :key="option.id"
            class="meal-option-chip"
            ><span class="option-item-label">{{ option.label }}</span
            ><span class="option-item-actions"
              ><button
                type="button"
                :disabled="index === 0"
                :aria-label="`Subir ${option.label}`"
                @click="moveItem('meal_options', option.id, -1)"
              >
                <ArrowUp :size="18" /></button
              ><button
                type="button"
                :disabled="index === form.meal_options.length - 1"
                :aria-label="`Descer ${option.label}`"
                @click="moveItem('meal_options', option.id, 1)"
              >
                <ArrowDown :size="18" /></button
              ><button
                type="button"
                :aria-label="`Remover ${option.label}`"
                :disabled="form.meal_options.length === 1"
                @click="removeItem('meal_options', option.id)"
              >
                <X :size="18" /></button></span
          ></span>
        </div>
        <div class="meal-add">
          <input
            v-model="newItem.meal_options"
            type="text"
            maxlength="40"
            placeholder="Ex.: Ceia"
            aria-label="Nova refeição da meta"
            @keydown.enter.prevent="addItem('meal_options')"
          /><button type="button" class="small-button" @click="addItem('meal_options')">
            <Plus :size="18" /> Adicionar
          </button>
        </div>
      </fieldset>
      <fieldset v-if="form.category !== 'alimentacao'" class="meal-options-field">
        <legend>Checklist da meta (opcional)</legend>
        <p>Adicione etapas para marcar em cada dia. Sem itens, a meta usa um check simples.</p>
        <div class="meal-option-list">
          <span
            v-for="(option, index) in form.checklist_options"
            :key="option.id"
            class="meal-option-chip"
            ><span class="option-item-label">{{ option.label }}</span
            ><span class="option-item-actions"
              ><button
                type="button"
                :disabled="index === 0"
                :aria-label="`Subir ${option.label}`"
                @click="moveItem('checklist_options', option.id, -1)"
              >
                <ArrowUp :size="18" /></button
              ><button
                type="button"
                :disabled="index === form.checklist_options.length - 1"
                :aria-label="`Descer ${option.label}`"
                @click="moveItem('checklist_options', option.id, 1)"
              >
                <ArrowDown :size="18" /></button
              ><button
                type="button"
                :aria-label="`Remover ${option.label}`"
                @click="removeItem('checklist_options', option.id)"
              >
                <X :size="18" /></button></span
          ></span>
        </div>
        <div class="meal-add">
          <input
            v-model="newItem.checklist_options"
            type="text"
            maxlength="40"
            placeholder="Ex.: Aquecer, treinar, alongar"
            aria-label="Novo item do checklist"
            @keydown.enter.prevent="addItem('checklist_options')"
          /><button type="button" class="small-button" @click="addItem('checklist_options')">
            <Plus :size="18" /> Adicionar
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
            @click="toggleDay(day)"
          >
            {{ weekdays[day] }}
          </button>
        </div>
      </fieldset>
      <fieldset
        v-if="form.goal_mode === 'fixed' && form.scheduled_weekdays.length && defaultOptions.length"
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
              <button type="button" class="text-button" @click="editingWeekday = day">
                {{ weekdayOptions[String(day)] ? 'Editar opções' : 'Personalizar' }}</button
              ><button
                v-if="weekdayOptions[String(day)]"
                type="button"
                class="text-button"
                @click="resetWeekday(day)"
              >
                Usar padrão
              </button>
            </div>
          </div>
          <small>{{
            optionsFor(day)
              .map((option) => option.label)
              .join(' · ')
          }}</small>
        </div>
      </fieldset>
      <label class="active-switch"
        ><input v-model="form.active" type="checkbox" /> Meta ativa</label
      >
      <InlineAlert v-if="error || message" :message="error || message" />
      <div class="form-actions">
        <button class="primary-button" :disabled="busy">
          <Check :size="20" aria-hidden="true" /><span>{{
            goal ? 'Salvar alterações' : 'Adicionar meta'
          }}</span></button
        ><button type="button" class="text-button" @click="emit('close')">Cancelar</button>
      </div>
    </form>
  </FormDialog>
  <WeekdayOptionsDialog
    v-if="editingWeekday !== null"
    :day="editingWeekday"
    :options="optionsFor(editingWeekday)"
    :category="form.category"
    @close="editingWeekday = null"
    @apply="applyWeekday"
  />
</template>
