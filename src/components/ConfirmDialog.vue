<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { AlertTriangle, X } from '@lucide/vue'

defineProps<{ title: string; description: string; confirmLabel: string; danger?: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const root = ref<HTMLElement | null>(null)
const cancel = ref<HTMLButtonElement | null>(null)
const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
let previousOverflow = ''
function trapFocus(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
  if (event.key !== 'Tab') return
  const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('button') || [])]
  const first = buttons[0],
    last = buttons.at(-1)
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
  cancel.value?.focus()
})
onUnmounted(() => {
  document.body.style.overflow = previousOverflow
  if (trigger?.isConnected) trigger.focus()
})
</script>

<template>
  <div class="dialog-backdrop confirmation-backdrop" @click.self="emit('cancel')">
    <section
      ref="root"
      class="confirmation-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      @keydown="trapFocus"
    >
      <button class="confirmation-close" aria-label="Fechar confirmação" @click="emit('cancel')">
        <X :size="20" />
      </button>
      <span class="confirmation-icon" :class="{ danger }"
        ><AlertTriangle :size="24" aria-hidden="true"
      /></span>
      <h2 id="confirmation-title">{{ title }}</h2>
      <p id="confirmation-description">{{ description }}</p>
      <div class="confirmation-actions">
        <button ref="cancel" class="small-button" @click="emit('cancel')">Cancelar</button>
        <button
          class="primary-button"
          :class="{ 'danger-button': danger }"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.confirmation-backdrop {
  z-index: 50;
}
.confirmation-dialog {
  position: relative;
  width: min(100%, 430px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 28px;
  border-radius: 20px;
  background: #fff;
  color: #25352b;
  box-shadow: 0 22px 65px #172b243b;
}
.confirmation-close {
  position: absolute;
  right: 12px;
  top: 12px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
}
.confirmation-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: #edf4e9;
  color: #4c7148;
}
.confirmation-icon.danger {
  background: #fff0ec;
  color: #ac362d;
}
h2 {
  margin: 18px 0 10px;
  font-size: 1.2rem;
  overflow-wrap: anywhere;
}
p {
  line-height: 1.6;
  color: #4e5e51;
  font-size: 0.9rem;
}
.confirmation-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}
.confirmation-actions button {
  min-height: 44px;
}
.danger-button {
  background: #b53b32;
  color: white;
}
:global(html[data-theme='dark'] .confirmation-dialog) {
  background: #202d24;
  color: #e5f0e2;
}
:global(html[data-theme='dark'] .confirmation-dialog p) {
  color: #d5e3d2;
}
:global(html[data-theme='dark'] .confirmation-dialog .danger-button) {
  background: #b53b32;
  color: #fff;
}
:global(html[data-theme='dark'] .confirmation-icon) {
  background: #334c37;
  color: #d2eac9;
}
:global(html[data-theme='dark'] .confirmation-icon.danger) {
  background: #5c302d;
  color: #ffd1c9;
}
@media (max-width: 720px) {
  .confirmation-dialog {
    padding: 24px 20px;
    border-radius: 20px 20px 0 0;
  }
  .confirmation-actions button {
    flex: 1;
  }
}
</style>
