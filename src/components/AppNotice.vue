<script setup lang="ts">
import { Check, AlertTriangle, X } from '@lucide/vue'
defineProps<{ message: string; error?: boolean }>()
defineEmits<{ dismiss: [] }>()
</script>
<template>
  <div class="app-notice" :class="{ 'is-error': error }" :role="error ? 'alert' : 'status'">
    <AlertTriangle v-if="error" :size="20" aria-hidden="true" /><Check
      v-else
      :size="20"
      aria-hidden="true"
    />
    <span>{{ message }}</span>
    <button type="button" aria-label="Fechar mensagem" @click="$emit('dismiss')">
      <X :size="18" />
    </button>
  </div>
</template>
<style scoped lang="scss">
.app-notice {
  position: fixed;
  z-index: 40;
  bottom: max(20px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(480px, calc(100% - 32px));
  padding: 12px 14px;
  border: 1px solid #bbd5b5;
  border-radius: 14px;
  background: #edf6e9;
  color: #284e2e;
  box-shadow: 0 8px 30px #172b2426;
  font-size: 0.88rem;
}
.app-notice > svg {
  flex-shrink: 0;
}
.app-notice span {
  flex: 1;
  overflow-wrap: anywhere;
}
button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: inherit;
  border-radius: 8px;
}
.is-error {
  background: #fff0ec;
  border-color: #e7b3a9;
  color: #8a3026;
}
:global(html[data-theme='dark'] .app-notice) {
  background: #253f2c;
  border-color: #628065;
  color: #e0f1db;
}
:global(html[data-theme='dark'] .is-error) {
  background: #4c2925;
  border-color: #b37a71;
  color: #ffe1db;
}
</style>
