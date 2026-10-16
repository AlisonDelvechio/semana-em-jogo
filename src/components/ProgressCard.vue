<script setup lang="ts">
defineProps<{ title: string; period: string; percent: number; caption: string }>()
</script>
<template>
  <article class="period-progress-card">
    <div class="period-progress-heading">
      <h2>{{ title }}</h2>
      <span>{{ caption }}</span>
    </div>
    <p class="period-progress-date">{{ period }}</p>
    <strong class="period-progress-value">{{ percent }}<span>%</span></strong>
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
