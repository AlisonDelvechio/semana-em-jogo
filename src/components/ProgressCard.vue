<script setup lang="ts">
import { CalendarDays, ChartColumnIncreasing } from '@lucide/vue'
defineProps<{ title: string; period: string; percent: number; caption: string }>()
</script>
<template>
  <article class="period-progress-card" :aria-label="`${title}: ${period}`">
    <span class="period-progress-icon" aria-hidden="true"
      ><CalendarDays v-if="title === 'Semana'" :size="22" /><ChartColumnIncreasing
        v-else
        :size="22"
    /></span>
    <div class="period-progress-meta">
      <h2>{{ title }}</h2>
      <span class="period-progress-caption">{{ caption }}</span>
      <p class="period-progress-date">{{ period }}</p>
    </div>
    <div class="period-progress-result">
      <span>{{ caption }}</span
      ><strong class="period-progress-value">{{ percent }}<span>%</span></strong>
    </div>
    <div
      class="period-progress-bar"
      role="progressbar"
      :aria-label="`Progresso: ${title}`"
      :aria-valuenow="percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span :style="{ width: `${percent}%` }"></span>
    </div>
  </article>
</template>
