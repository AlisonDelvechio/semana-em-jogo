<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'
const model = defineModel<number>({ required: true })
const props = defineProps<{ inputId: string; label: string; min: number; max: number }>()
function step(amount: number) {
  const value = Number.isFinite(model.value) ? model.value : props.min
  model.value = Math.max(props.min, Math.min(props.max, value + amount))
}
</script>
<template>
  <div class="number-stepper">
    <button
      type="button"
      :aria-label="`Diminuir ${label}`"
      :disabled="model <= min"
      @click="step(-1)"
    >
      <Minus :size="20" aria-hidden="true" />
    </button>
    <input
      :id="inputId"
      v-model.number="model"
      type="number"
      :min="min"
      :max="max"
      step="1"
      required
      inputmode="numeric"
    />
    <button
      type="button"
      :aria-label="`Aumentar ${label}`"
      :disabled="model >= max"
      @click="step(1)"
    >
      <Plus :size="20" aria-hidden="true" />
    </button>
  </div>
</template>
