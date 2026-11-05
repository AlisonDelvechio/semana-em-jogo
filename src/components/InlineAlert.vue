<script setup lang="ts">
import { CircleAlert, CircleCheck } from '@lucide/vue'

// Message shown inside a form or panel. Errors are announced immediately (role="alert");
// information and success use a polite live region.
withDefaults(defineProps<{ message: string; tone?: 'error' | 'info' }>(), { tone: 'error' })
</script>

<template>
  <p :class="['inline-alert', tone]" :role="tone === 'error' ? 'alert' : 'status'">
    <CircleAlert v-if="tone === 'error'" :size="20" aria-hidden="true" />
    <CircleCheck v-else :size="20" aria-hidden="true" />
    <span>{{ message }}</span>
  </p>
</template>
