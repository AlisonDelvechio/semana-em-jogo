<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ArrowDown, ArrowUp, Plus, X } from '@lucide/vue'
import { fullWeekdays } from '../lib/dates'
import { trapFocus } from '../lib/focus'
import { createOption, moveMeal, OPTION_NAME_ERROR } from '../lib/meals'
import type { Category, MealOption } from '../types'

const props = defineProps<{ day: number; options: MealOption[]; category: Category }>()
const emit = defineEmits<{ close: []; apply: [options: MealOption[]] }>()

const draft = ref(props.options.map((option) => ({ ...option })))
const newItem = ref('')
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
const minimum = props.category === 'alimentacao' ? 1 : 0

function add() {
  const option = createOption(draft.value, newItem.value)
  error.value = option ? '' : OPTION_NAME_ERROR
  if (!option) return
  draft.value.push(option)
  newItem.value = ''
}
function remove(id: string) {
  if (draft.value.length > minimum) draft.value = draft.value.filter((option) => option.id !== id)
}
function move(id: string, offset: -1 | 1) {
  draft.value = moveMeal(draft.value, id, offset)
}
onMounted(async () => {
  await nextTick()
  closeButton.value?.focus()
})
onUnmounted(() => trigger?.focus())
</script>

<template>
  <div
    class="dialog-backdrop weekday-backdrop"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <section
      ref="dialog"
      class="day-dialog weekday-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="weekday-dialog-title"
      @keydown="trapFocus($event, dialog)"
    >
      <div class="dialog-header">
        <div>
          <span class="eyebrow">OPÇÕES DA META</span>
          <h2 id="weekday-dialog-title">{{ fullWeekdays[day] }}</h2>
        </div>
        <button
          ref="closeButton"
          type="button"
          class="dialog-close"
          aria-label="Fechar"
          @click="emit('close')"
        >
          <X :size="21" />
        </button>
      </div>
      <p class="weekday-dialog-hint">
        Escolha os itens e ajuste a ordem para este dia da semana. As alterações entram no cadastro
        da meta quando você salvá-la.
      </p>
      <ol class="weekday-editor-list">
        <li v-for="(option, index) in draft" :key="option.id">
          <span>{{ option.label }}</span>
          <div class="meal-order-actions">
            <button
              type="button"
              :disabled="index === 0"
              :aria-label="`Subir ${option.label}`"
              @click="move(option.id, -1)"
            >
              <ArrowUp :size="18" /></button
            ><button
              type="button"
              :disabled="index === draft.length - 1"
              :aria-label="`Descer ${option.label}`"
              @click="move(option.id, 1)"
            >
              <ArrowDown :size="18" />
            </button>
          </div>
          <button
            type="button"
            class="meal-remove"
            :disabled="draft.length <= minimum"
            :aria-label="`Remover ${option.label}`"
            @click="remove(option.id)"
          >
            <X :size="18" />
          </button>
        </li>
      </ol>
      <div class="meal-add">
        <input
          v-model="newItem"
          type="text"
          maxlength="40"
          :placeholder="category === 'alimentacao' ? 'Ex.: Ceia' : 'Ex.: Alongar'"
          aria-label="Novo item neste dia da semana"
          @keydown.enter.prevent="add"
        /><button type="button" class="small-button" @click="add">
          <Plus :size="18" /> Adicionar
        </button>
      </div>
      <p v-if="error" class="notice" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button type="button" class="text-button" @click="emit('close')">Cancelar</button
        ><button type="button" class="primary-button" @click="emit('apply', draft)">
          Aplicar opções
        </button>
      </div>
    </section>
  </div>
</template>
