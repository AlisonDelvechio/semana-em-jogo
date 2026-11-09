<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, ChevronDown } from '@lucide/vue'
import {
  careOverview,
  lastRecordLabel,
  overviewPeriodLabels,
  type OverviewPeriod,
  type Records,
} from '../lib/overview'
import { currentDate } from '../lib/today'

// Simplified view of one person for a professional: month by month and a few plain
// sentences to talk about. "Ver detalhes" leads to the full records and report.
const props = defineProps<{ patientName: string; records: Records }>()
const emit = defineEmits<{ details: [] }>()

const period = ref<OverviewPeriod>('months3')
const overview = computed(() => careOverview(props.records, period.value, currentDate()))
const short = (name: string) => name.slice(0, 3).toLowerCase()
const rangeLabel = computed(() => {
  const months = overview.value.months
  return months.length > 1
    ? `${short(months[0]!.name)} a ${short(months.at(-1)!.name)}`
    : (months[0]?.name.toLowerCase() ?? '')
})
const goalTitles = computed(() => props.records.goals.map((goal) => goal.title).join(', '))
</script>

<template>
  <div class="overview-heading">
    <div>
      <h1>{{ patientName }}</h1>
      <p>
        {{ lastRecordLabel(overview.lastRecord, currentDate())
        }}<template v-if="goalTitles"> · {{ goalTitles }}</template>
      </p>
    </div>
    <label class="overview-period"
      >Período
      <span class="select-control"
        ><select v-model="period">
          <option v-for="(label, key) in overviewPeriodLabels" :key="key" :value="key">
            {{ label }}
          </option></select
        ><ChevronDown :size="20" class="select-chevron" aria-hidden="true"
      /></span>
    </label>
  </div>

  <section class="overview-summary" aria-label="Resumo do período">
    <div class="overview-summary-figure">
      <span>Dentro do plano · {{ rangeLabel }}</span>
      <strong>{{ overview.percent === null ? '—' : `${overview.percent}%` }}</strong>
    </div>
    <p>{{ overview.headline }}</p>
  </section>

  <section class="overview-months-section" aria-labelledby="overview-months-title">
    <div class="overview-section-heading">
      <h2 id="overview-months-title">Mês a mês</h2>
      <span>As barras são as semanas de cada mês</span>
    </div>
    <div class="overview-months">
      <article v-for="month in overview.months" :key="month.key" class="overview-month">
        <div class="overview-month-head">
          <h3>{{ month.name }}</h3>
          <span v-if="month.early">início do mês</span>
          <span v-else-if="month.partial">até hoje</span>
        </div>
        <div class="overview-month-figure">
          <strong>{{ month.percent === null ? 'Sem registros' : `${month.percent}%` }}</strong>
          <span
            v-if="month.delta !== null && month.delta !== 0"
            :class="['overview-delta', month.delta > 0 ? 'up' : 'down']"
            >{{ month.delta > 0 ? '↑' : '↓' }} {{ Math.abs(month.delta) }}
            {{ Math.abs(month.delta) === 1 ? 'ponto' : 'pontos' }}</span
          >
        </div>
        <div
          v-if="month.weeks.length"
          class="overview-weeks"
          role="img"
          :aria-label="`Semanas de ${month.name}: ${month.weeks
            .map(
              (week) =>
                `${week.label}, ${week.percent === null ? 'sem registros' : `${week.percent}%`}`,
            )
            .join('; ')}`"
        >
          <span
            v-for="week in month.weeks"
            :key="week.label"
            class="overview-week"
            :title="`Semana de ${week.label}: ${week.percent === null ? 'sem registros' : `${week.percent}%`}`"
          >
            <span class="overview-week-plot"
              ><span
                v-if="week.percent !== null"
                class="overview-week-bar"
                :style="{ height: `${Math.max(week.percent, 2)}%` }"
              ></span
              ><span v-else class="overview-week-empty"></span
            ></span>
            <span class="overview-week-label">{{ week.label }}</span>
          </span>
        </div>
        <p class="overview-month-days">
          {{ month.recorded }} de {{ month.planned }}
          {{ month.planned === 1 ? 'dia registrado' : 'dias registrados' }}
        </p>
      </article>
    </div>
  </section>

  <section class="overview-talk" aria-labelledby="overview-talk-title">
    <h2 id="overview-talk-title">Para conversar na consulta</h2>
    <p v-if="!overview.talkingPoints.length" class="overview-talk-empty">
      Nada fora do comum no período.
    </p>
    <p v-for="point in overview.talkingPoints" :key="point.title" class="overview-talk-item">
      <strong>{{ point.title }}</strong> <span>{{ point.detail }}</span>
    </p>
  </section>

  <div class="overview-actions">
    <button type="button" class="primary-button" @click="emit('details')">
      Ver detalhes <ArrowRight :size="18" aria-hidden="true" />
    </button>
  </div>
</template>
