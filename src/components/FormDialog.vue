<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { X } from '@lucide/vue'
const props = withDefaults(
  defineProps<{ title: string; busy?: boolean; titleId?: string; closeLabel?: string }>(),
  { titleId: 'goal-editor-title', closeLabel: 'Fechar edição da meta' },
)
const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)
const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
let previousOverflow = ''
function close() {
  if (!props.busy) emit('close')
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
  if (event.key !== 'Tab') return
  const controls = [
    ...(root.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary',
    ) || []),
  ]
  const first = controls[0],
    last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
onMounted(async () => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  root.value?.querySelector<HTMLElement>('input, button')?.focus()
})
onUnmounted(() => {
  document.body.style.overflow = previousOverflow
  if (trigger?.isConnected) trigger.focus()
})
</script>
<template>
  <div class="dialog-backdrop goal-editor-backdrop" @click.self="close">
    <section
      ref="root"
      class="goal-editor-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @keydown="onKey"
    >
      <header class="goal-editor-header">
        <div>
          <span class="eyebrow">SEU PLANO</span>
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <button
          type="button"
          class="dialog-close"
          :disabled="busy"
          :aria-label="closeLabel"
          @click="close"
        >
          <X :size="22" />
        </button>
      </header>
      <slot />
    </section>
  </div>
</template>
