<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import { CirclePause, CirclePlay, Ellipsis, Trash2 } from '@lucide/vue'
import type { Goal } from '../types'

// "More actions" menu for a goal: pause/resume and delete, kept away from the
// primary Edit button so the destructive action is not one stray tap away.
defineProps<{ goal: Goal; busy: boolean }>()
const emit = defineEmits<{ pause: []; remove: [] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLButtonElement | null>(null)
const items = () => [...(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])]

function onOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close(false)
}
async function show() {
  open.value = true
  document.addEventListener('pointerdown', onOutside)
  await nextTick()
  items()[0]?.focus()
}
function close(returnFocus = true) {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside)
  if (returnFocus) toggleButton.value?.focus()
}
function onKey(event: KeyboardEvent) {
  const list = items()
  const index = list.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    list[(index + step + list.length) % list.length]?.focus()
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    ;(event.key === 'Home' ? list[0] : list.at(-1))?.focus()
  } else if (event.key === 'Tab') close(false)
}
// Focus goes back to the menu button first, so the confirmation dialog returns there.
function select(action: 'pause' | 'remove') {
  close()
  if (action === 'pause') emit('pause')
  else emit('remove')
}
onUnmounted(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="goal-menu" @keydown="onKey">
    <button
      ref="toggleButton"
      type="button"
      class="goal-menu-toggle"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`Mais ações para ${goal.title}`"
      @click="open ? close() : show()"
    >
      <Ellipsis :size="20" aria-hidden="true" />
    </button>
    <div v-if="open" class="goal-menu-list" role="menu" :aria-label="`Ações de ${goal.title}`">
      <button
        type="button"
        role="menuitem"
        :disabled="busy"
        :aria-label="goal.active ? `Pausar ${goal.title}` : `Ativar ${goal.title}`"
        @click="select('pause')"
      >
        <CirclePause v-if="goal.active" :size="18" aria-hidden="true" /><CirclePlay
          v-else
          :size="18"
          aria-hidden="true"
        />{{ goal.active ? 'Pausar' : 'Retomar' }}
      </button>
      <button
        type="button"
        role="menuitem"
        class="danger"
        :disabled="busy"
        :aria-label="`Excluir ${goal.title}`"
        @click="select('remove')"
      >
        <Trash2 :size="18" aria-hidden="true" />Excluir
      </button>
    </div>
  </div>
</template>
