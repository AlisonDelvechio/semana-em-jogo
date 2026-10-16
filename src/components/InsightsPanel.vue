<script setup lang="ts">
import { computed, ref } from 'vue'
import { Target, ScanSearch, Dumbbell, Utensils, ClipboardList } from '@lucide/vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import { addDays, localKey } from '../lib/dates'
import { periodInsights } from '../lib/insights'
const props = defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
  monday: Date
  month: Date
}>()
const emit = defineEmits<{ openDay: [date: Date] }>()
const period = ref<'week' | 'month'>('week')
const range = computed(() =>
  period.value === 'week'
    ? { start: props.monday, end: addDays(props.monday, 6) }
    : {
        start: new Date(props.month.getFullYear(), props.month.getMonth(), 1),
        end: new Date(props.month.getFullYear(), props.month.getMonth() + 1, 0),
      },
)
const analysis = computed(() =>
  periodInsights(
    props.goals,
    props.completions,
    props.history,
    props.dayDetails,
    range.value.start,
    range.value.end,
    new Date(),
  ),
)
const rangeLabel = computed(() => {
  const format = (date: Date) =>
    date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
  const today = new Date()
  if (localKey(range.value.start) > localKey(today))
    return 'Período futuro · ainda sem progresso a analisar'
  return `${format(range.value.start)} a ${format(localKey(range.value.end) < localKey(today) ? range.value.end : today)}`
})
const totals = computed(() =>
  analysis.value.patterns.reduce(
    (sum, row) => ({
      valid: sum.valid + row.valid,
      off: sum.off + row.off,
      pending: sum.pending + row.pending,
      unknown: sum.unknown + row.unknown,
      total: sum.total + row.total,
    }),
    { valid: 0, off: 0, pending: 0, unknown: 0, total: 0 },
  ),
)
const highest = computed(() => {
  const max = Math.max(0, ...analysis.value.patterns.map((row) => row.off))
  return max ? analysis.value.patterns.filter((row) => row.off === max) : []
})
const selectedPattern = ref<string | null>(null)
const selected = computed(() =>
  analysis.value.patterns.find((row) => row.id === selectedPattern.value),
)
const records = computed(
  () =>
    selected.value?.records
      .filter((row) => row.status !== 'valid')
      .slice()
      .reverse() || [],
)
function selectPeriod(value: 'week' | 'month') {
  period.value = value
  selectedPattern.value = null
}
function openRecord(day: string) {
  emit('openDay', new Date(`${day}T12:00:00`))
}
</script>
<template>
  <section class="insights-section" aria-label="Análise do progresso">
    <div class="insights-heading">
      <div>
        <h2>Entenda seu progresso</h2>
        <p>{{ rangeLabel }}</p>
      </div>
      <div class="insights-period" role="group" aria-label="Período da análise">
        <button type="button" :aria-pressed="period === 'week'" @click="selectPeriod('week')">
          Semana</button
        ><button type="button" :aria-pressed="period === 'month'" @click="selectPeriod('month')">
          Mês
        </button>
      </div>
    </div>
    <section class="panel goal-progress-panel" aria-labelledby="goal-progress-title">
      <div class="insight-title">
        <Target :size="22" aria-hidden="true" />
        <div>
          <h3 id="goal-progress-title">Progresso por meta</h3>
          <p>Cada meta com sua própria medida.</p>
        </div>
      </div>
      <p v-if="!analysis.progress.length" class="insights-empty">
        Sem metas previstas até a data de corte neste período.
      </p>
      <div v-else class="goal-progress-grid">
        <article v-for="goal in analysis.progress" :key="goal.id" class="goal-progress-item">
          <div class="goal-progress-name">
            <h4>{{ goal.title }}</h4>
            <Utensils
              v-if="goal.category === 'alimentacao'"
              :size="20"
              aria-hidden="true"
            /><Dumbbell
              v-else-if="goal.category === 'treino'"
              :size="20"
              aria-hidden="true"
            /><ClipboardList v-else :size="20" aria-hidden="true" />
          </div>
          <strong class="goal-progress-percent">{{ goal.percent }}%</strong>
          <p>
            {{ goal.completed }} de {{ goal.total }}
            {{
              goal.mode === 'meals'
                ? 'refeições contabilizadas'
                : goal.mode === 'visits'
                  ? 'idas realizadas'
                  : 'dias concluídos'
            }}
          </p>
          <div
            class="period-progress-bar"
            role="progressbar"
            :aria-label="`Progresso de ${goal.title}`"
            :aria-valuenow="goal.percent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span :style="{ width: `${goal.percent}%` }"></span>
          </div>
          <details>
            <summary>Como é calculado</summary>
            <p>
              {{
                goal.mode === 'meals'
                  ? 'Soma as refeições válidas, incluindo livres dentro do limite. Registros antigos preservam sua interpretação original.'
                  : goal.mode === 'visits'
                    ? 'Soma as idas até o limite de cada semana. A semana pertence ao mês de sua segunda-feira; dias sem treino não são falhas diárias.'
                    : 'Conta os dias programados e concluídos, respeitando o histórico da meta.'
              }}
              Dias futuros ficam fora.
            </p>
          </details>
        </article>
      </div>
    </section>
    <section class="panel meal-pattern-panel" aria-labelledby="meal-pattern-title">
      <div class="insight-title">
        <ScanSearch :size="22" aria-hidden="true" />
        <div>
          <h3 id="meal-pattern-title">Resumo de padrões</h3>
          <p>Alimentação · refeições previstas até a data de corte.</p>
        </div>
      </div>
      <p v-if="!analysis.patterns.length" class="insights-empty">
        Sem refeições previstas neste período. Os padrões aparecem conforme você registra sua
        alimentação.
      </p>
      <template v-else
        ><div class="pattern-legend">
          <span><i class="pattern-valid"></i>Válidas</span
          ><span><i class="pattern-off"></i>Fora / excedentes</span
          ><span><i class="pattern-pending"></i>Pendentes</span
          ><span v-if="totals.unknown"><i class="pattern-unknown"></i>Sem classificação</span>
        </div>
        <div class="patterns-layout">
          <div>
            <article v-for="row in analysis.patterns" :key="row.id" class="pattern-row">
              <div class="pattern-row-heading">
                <strong>{{ row.title }}</strong
                ><span>{{ row.valid }}/{{ row.total }} válidas</span>
              </div>
              <div
                class="pattern-stack"
                role="img"
                :aria-label="`${row.title}: ${row.valid} válidas, ${row.off} fora ou excedentes, ${row.pending} pendentes, ${row.unknown} sem classificação`"
              >
                <span
                  v-for="kind in ['valid', 'off', 'pending', 'unknown'] as const"
                  :key="kind"
                  :class="`pattern-${kind}`"
                  :style="{ width: `${(row[kind] / row.total) * 100}%` }"
                ></span>
              </div>
              <p>
                {{ row.off }} fora / excedentes · {{ row.pending }} pendentes<span
                  v-if="row.unknown"
                >
                  · {{ row.unknown }} sem classificação</span
                >
              </p>
              <button
                v-if="row.off + row.pending + row.unknown"
                type="button"
                class="text-button"
                :aria-expanded="selectedPattern === row.id"
                @click="selectedPattern = selectedPattern === row.id ? null : row.id"
              >
                {{ selectedPattern === row.id ? 'Ocultar registros' : 'Ver registros'
                }}<span class="insights-sr-only"> de {{ row.title }}</span>
              </button>
            </article>
          </div>
          <aside class="pattern-observations">
            <h4>
              {{
                highest.length
                  ? 'Onde se concentram os registros fora do plano'
                  : 'Sem registros fora do plano'
              }}
            </h4>
            <p v-if="highest.length">
              {{ highest.map((row) => row.title).join('; ') }}: {{ highest[0]!.off }}
              {{ highest[0]!.off === 1 ? 'registro' : 'registros'
              }}{{ highest.length > 1 ? ' em cada' : '' }}, de {{ totals.off }} fora ou excedentes
              no período. É uma contagem, não uma conclusão sobre a causa.
            </p>
            <p v-else>
              Confira as pendências e classificações antes de interpretar este resultado.
            </p>
            <h4>Registro pendente também conta</h4>
            <p>
              {{ totals.pending }} de {{ totals.total }} refeições estão pendentes<span
                v-if="totals.unknown"
              >
                e {{ totals.unknown }} estão sem classificação</span
              >. Esses casos ficam separados de refeições registradas fora do plano.
            </p>
          </aside>
        </div>
        <section v-if="selected" class="pattern-records" aria-live="polite">
          <h4>{{ selected.title }} · registros a conferir</h4>
          <div v-for="record in records" :key="record.date" class="pattern-record">
            <div>
              <strong
                >{{ new Date(`${record.date}T12:00:00`).toLocaleDateString('pt-BR') }} ·
                {{ record.reason }}</strong
              >
              <p v-if="record.note">{{ record.note }}</p>
            </div>
            <button type="button" class="small-button" @click="openRecord(record.date)">
              Abrir dia
            </button>
          </div>
        </section>
        <p class="pattern-footnote">
          Válidas incluem livres dentro do limite. Livres excedentes aparecem junto às refeições
          fora do plano. Registros sem classificação não permitem inferir aderência.
        </p></template
      >
    </section>
  </section>
</template>
