<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, ChevronDown, Download, Minus } from '@lucide/vue'
import { createPrintableSummary } from '../lib/print-summary'
import { careSummary, periodLabels, periodRange, type SummaryPeriod } from '../lib/summary'
import { currentDate } from '../lib/today'
import InlineAlert from '../components/InlineAlert.vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'

// Consultation summary for one person who shares goals with this account.
const props = defineProps<{
  patientName: string
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}>()

const period = ref<SummaryPeriod>('weeks4')
const range = computed(() => periodRange(period.value, currentDate()))
const summary = computed(() =>
  careSummary(props, range.value.start, range.value.end, currentDate()),
)
const formatDay = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const rangeLabel = computed(
  () =>
    `${range.value.start.toLocaleDateString('pt-BR')} a ${new Date(
      `${summary.value.through}T12:00:00`,
    ).toLocaleDateString('pt-BR')}`,
)
const freeExcess = computed(
  () => summary.value.offPlan.filter((meal) => meal.kind === 'free-excess').length,
)
const offCount = computed(() => summary.value.offPlan.length - freeExcess.value)
// The chart's only direct label: the most recent week with data.
const lastWithData = computed(
  () => summary.value.weeks.filter((week) => week.percent !== null).at(-1)?.start,
)

const printMessage = ref('')
function savePdf() {
  const popup = window.open('', '_blank')
  if (!popup) {
    printMessage.value = 'Permita abrir a janela do resumo para salvar o PDF.'
    return
  }
  printMessage.value = ''
  popup.opener = null
  popup.document.open()
  popup.document.write(
    createPrintableSummary(summary.value, {
      patientName: props.patientName,
      periodLabel: `${periodLabels[period.value]} · ${rangeLabel.value}`,
      generatedAt: currentDate(),
    }),
  )
  popup.onload = () => {
    popup.focus()
    popup.print()
  }
  popup.document.close()
  // The popup inherits the page CSP, which blocks inline handlers.
  popup.document.querySelector('[data-print]')?.addEventListener('click', () => popup.print())
}
</script>

<template>
  <div class="summary-filters">
    <label
      >Período
      <span class="select-control"
        ><select v-model="period">
          <option v-for="(label, key) in periodLabels" :key="key" :value="key">
            {{ label }}
          </option></select
        ><ChevronDown :size="20" class="select-chevron" aria-hidden="true"
      /></span>
    </label>
    <span class="summary-range">{{ rangeLabel }}</span>
    <button type="button" class="small-button" @click="savePdf">
      <Download :size="18" aria-hidden="true" /> Salvar PDF
    </button>
  </div>
  <InlineAlert v-if="printMessage" :message="printMessage" />

  <section class="summary-stats" aria-label="Números do período">
    <article class="summary-stat">
      <span class="summary-stat-label">Aderência no período</span>
      <strong class="summary-stat-value">{{
        summary.percent === null ? '—' : `${summary.percent}%`
      }}</strong>
      <span
        v-if="summary.delta !== null"
        :class="['summary-delta', summary.delta > 0 ? 'up' : summary.delta < 0 ? 'down' : '']"
        ><ArrowUp v-if="summary.delta > 0" :size="16" aria-hidden="true" /><ArrowDown
          v-else-if="summary.delta < 0"
          :size="16"
          aria-hidden="true"
        /><Minus v-else :size="16" aria-hidden="true" />{{ summary.delta > 0 ? '+' : ''
        }}{{ summary.delta }} pontos vs período anterior ({{ summary.previous }}%)</span
      >
      <span v-else class="summary-delta">Sem registros no período anterior para comparar</span>
    </article>
    <article class="summary-stat">
      <span class="summary-stat-label">Refeições fora do plano</span>
      <strong class="summary-stat-value">{{ offCount }}</strong>
    </article>
    <article class="summary-stat">
      <span class="summary-stat-label">Livres além do limite</span>
      <strong class="summary-stat-value">{{ freeExcess }}</strong>
    </article>
    <article class="summary-stat">
      <span class="summary-stat-label">Dias sem registro</span>
      <strong class="summary-stat-value">{{ summary.missingDays.length }}</strong>
    </article>
  </section>

  <section class="panel summary-section" aria-labelledby="summary-weeks-title">
    <h3 id="summary-weeks-title">Aderência por semana</h3>
    <p class="summary-hint">
      Refeições dentro do plano (e livres dentro do limite), dias e idas cumpridos, até hoje.
    </p>
    <div class="week-chart" role="img" :aria-label="`Aderência por semana, ${rangeLabel}`">
      <div class="week-chart-grid" aria-hidden="true">
        <span v-for="tick in [100, 50, 0]" :key="tick" :style="{ bottom: `${tick}%` }"
          ><em>{{ tick }}%</em></span
        >
      </div>
      <div class="week-chart-bars">
        <div
          v-for="week in summary.weeks"
          :key="week.start"
          class="week-chart-column"
          tabindex="0"
          :aria-label="`Semana de ${formatDay(week.start)}: ${week.percent === null ? 'sem dados' : `${week.percent}%`}`"
        >
          <div class="week-chart-plot">
            <span
              v-if="week.percent !== null"
              class="week-chart-bar"
              :style="{ height: `${Math.max(week.percent, 1)}%` }"
            ></span>
            <span
              v-if="week.start === lastWithData"
              class="week-chart-label"
              :style="{ bottom: `${week.percent}%` }"
              >{{ week.percent }}%</span
            >
          </div>
          <span class="week-chart-x">{{ formatDay(week.start) }}</span>
          <span class="week-chart-tip" aria-hidden="true"
            >{{ formatDay(week.start) }} a {{ formatDay(week.end) }}<br /><strong>{{
              week.percent === null ? 'Sem dados' : `${week.percent}%`
            }}</strong></span
          >
        </div>
      </div>
    </div>
    <details class="summary-table-toggle">
      <summary>Ver tabela</summary>
      <table class="summary-table">
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Aderência</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="week in summary.weeks" :key="week.start">
            <td>{{ formatDay(week.start) }} a {{ formatDay(week.end) }}</td>
            <td>{{ week.percent === null ? '—' : `${week.percent}%` }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </section>

  <section class="panel summary-section" aria-labelledby="summary-meals-title">
    <h3 id="summary-meals-title">Refeições que mais escapam do plano</h3>
    <p v-if="!summary.meals.length" class="summary-hint">
      Nenhuma refeição classificada no período.
    </p>
    <ul v-else class="summary-meals">
      <li v-for="meal in summary.meals" :key="meal.title">
        <span class="summary-meal-title">{{ meal.title }}</span>
        <span class="summary-meter" aria-hidden="true"
          ><span :style="{ width: `${meal.offRate}%` }"></span
        ></span>
        <span class="summary-meal-value"
          ><strong>{{ meal.offRate }}%</strong> fora do plano ({{ meal.off }} de
          {{ meal.classified }})<template v-if="meal.pending">
            · {{ meal.pending }} sem registro ou classificação</template
          ></span
        >
      </li>
    </ul>
  </section>

  <section class="panel summary-section" aria-labelledby="summary-off-title">
    <h3 id="summary-off-title">Fora do plano e livres além do limite</h3>
    <p v-if="!summary.offPlan.length" class="summary-hint">Nenhuma no período.</p>
    <div v-else class="summary-table-scroll">
      <table class="summary-table">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Refeição</th>
            <th scope="col">Tipo</th>
            <th scope="col">O que comeu</th>
            <th scope="col">Observação do dia</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="meal in summary.offPlan" :key="`${meal.date}-${meal.goalTitle}-${meal.meal}`">
            <td data-label="Data">{{ formatDay(meal.date) }}</td>
            <td data-label="Refeição">{{ meal.meal }}</td>
            <td data-label="Tipo">
              {{ meal.kind === 'off' ? 'Fora do plano' : 'Livre além do limite' }}
            </td>
            <td data-label="O que comeu">{{ meal.description || '—' }}</td>
            <td data-label="Observação">{{ meal.note || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="summary-columns">
    <section class="panel summary-section" aria-labelledby="summary-free-title">
      <h3 id="summary-free-title">Refeições livres por semana</h3>
      <p v-if="!summary.freeMeals.length" class="summary-hint">Nenhuma refeição livre usada.</p>
      <table v-else class="summary-table">
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Usadas / permitidas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in summary.freeMeals" :key="`${entry.week}-${entry.goalTitle}`">
            <td>{{ formatDay(entry.week) }}</td>
            <td>
              {{ entry.used }} de {{ entry.limit
              }}<template v-if="entry.used > entry.limit">
                · {{ entry.used - entry.limit }} além do limite</template
              >
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section class="panel summary-section" aria-labelledby="summary-missing-title">
      <h3 id="summary-missing-title">Dias sem registro</h3>
      <p v-if="!summary.missingDays.length" class="summary-hint">Todos os dias têm registro.</p>
      <ul v-else class="summary-days">
        <li v-for="day in summary.missingDays" :key="day">
          {{
            new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
            })
          }}
        </li>
      </ul>
    </section>
  </div>
</template>
