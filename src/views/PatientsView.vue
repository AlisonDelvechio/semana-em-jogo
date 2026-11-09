<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, UserRoundX } from '@lucide/vue'
import { loadData, removeCareLink, type CareLink } from '../lib/data'
import { localKey, mondayOf } from '../lib/dates'
import { careOverview, lastRecordLabel, type Records } from '../lib/overview'
import { currentDate } from '../lib/today'
import DayDialog from '../components/DayDialog.vue'
import InlineAlert from '../components/InlineAlert.vue'
import MonthView from './MonthView.vue'
import OverviewView from './OverviewView.vue'
import SummaryView from './SummaryView.vue'
import WeekView from './WeekView.vue'
import type { AskConfirmation } from '../lib/confirm'

// The professional's side of sharing, from the simplest view to the most detailed:
// 1. the list of people (skipped when there is only one),
// 2. an overview of one person (month by month and things to talk about),
// 3. details: the usual week and month screens read-only, and the full report.
const props = defineProps<{
  following: CareLink[]
  mobileWeek: boolean
  confirm: AskConfirmation
}>()
const emit = defineEmits<{ changed: []; overlayChange: [open: boolean] }>()

// Records of every person, loaded once per visit and kept per owner.
const records = reactive<Record<string, Records>>({})
const failed = reactive<Record<string, string>>({})
const loading = ref(false)
let version = 0
watch(
  () => props.following.map((link) => `${link.owner_id}:${link.goalIds.join()}`).join('|'),
  async () => {
    const current = ++version
    loading.value = true
    await Promise.all(
      props.following.map(async (link) => {
        try {
          const result = await loadData(link.owner_id)
          if (current === version) {
            records[link.owner_id] = result
            delete failed[link.owner_id]
          }
        } catch (caught) {
          if (current === version)
            failed[link.owner_id] =
              caught instanceof Error ? caught.message : 'Não foi possível carregar.'
        }
      }),
    )
    if (current === version) loading.value = false
  },
  { immediate: true },
)

// Level 1: people who need attention first, then lower adherence.
const rows = computed(() =>
  props.following
    .map((link) => {
      const data = records[link.owner_id]
      return { link, overview: data ? careOverview(data, 'months3', currentDate()) : null }
    })
    .sort(
      (a, b) =>
        (b.overview?.attention ?? 0) - (a.overview?.attention ?? 0) ||
        (a.overview?.percent ?? 101) - (b.overview?.percent ?? 101),
    ),
)
const lastDelta = (overview: ReturnType<typeof careOverview> | null) =>
  overview?.months.filter((month) => month.delta !== null).at(-1)?.delta ?? null

const selectedId = ref<string | null>(null)
const level = ref<'overview' | 'details'>('overview')
const patient = computed(() => props.following.find((link) => link.id === selectedId.value))
watch(
  () => props.following.map((link) => link.id).join(),
  () => {
    if (selectedId.value && !patient.value) selectedId.value = null
    // With a single person the list adds nothing: open the overview directly.
    if (!selectedId.value && props.following.length === 1) selectedId.value = props.following[0]!.id
  },
  { immediate: true },
)
function open(link: CareLink) {
  selectedId.value = link.id
  level.value = 'overview'
}
const patientRecords = computed(() => (patient.value ? records[patient.value.owner_id] : null))
const patientError = computed(() => (patient.value ? failed[patient.value.owner_id] : ''))

// Level 3: records (week or month) and the full report.
const detailsTab = ref<'records' | 'report'>('records')
const recordsView = ref<'week' | 'month'>('week')
const monday = ref(mondayOf(currentDate()))
const selectedWeekDay = ref(localKey(currentDate()))
watch(
  monday,
  () => {
    selectedWeekDay.value =
      localKey(mondayOf(currentDate())) === localKey(monday.value)
        ? localKey(currentDate())
        : localKey(monday.value)
  },
  { flush: 'sync' },
)
function goToCurrentWeek() {
  monday.value = mondayOf(currentDate())
  selectedWeekDay.value = localKey(currentDate())
  recordsView.value = 'week'
}

const selectedDay = ref<Date | null>(null)
const detailOverlay = ref(false)
watch([selectedDay, detailOverlay], ([day, detail]) => emit('overlayChange', !!day || detail))
onUnmounted(() => emit('overlayChange', false))
function openWeekOf(date: Date) {
  monday.value = mondayOf(date)
  selectedWeekDay.value = localKey(date)
  selectedDay.value = null
  detailsTab.value = 'records'
  recordsView.value = 'week'
}

const actionError = ref('')
async function stopFollowing(link: CareLink) {
  const confirmed = await props.confirm({
    title: 'Parar de acompanhar?',
    description: `Você deixará de ver as metas de ${link.owner_name || 'esta pessoa'}. Para voltar, será preciso um novo convite.`,
    confirmLabel: 'Parar de acompanhar',
    danger: true,
  })
  if (!confirmed) return
  try {
    await removeCareLink(link.id)
    selectedId.value = null
    emit('changed')
  } catch (caught) {
    actionError.value =
      caught instanceof Error ? caught.message : 'Algo deu errado. Tente novamente.'
  }
}
</script>

<template>
  <!-- Level 1: list -->
  <template v-if="!patient">
    <div class="page-heading">
      <div>
        <span class="eyebrow">ACOMPANHAMENTO</span>
        <h1>Pacientes <em>em dia.</em></h1>
        <p>Quem precisa de atenção aparece primeiro · últimos 3 meses</p>
      </div>
    </div>
    <p v-if="!following.length" class="sharing-empty">
      Ninguém compartilhou metas com você ainda. Peça para a pessoa gerar um convite em Minhas metas
      → Compartilhar com profissional.
    </p>
    <div v-else class="patient-rows">
      <button
        v-for="{ link, overview } in rows"
        :key="link.id"
        type="button"
        class="patient-row"
        @click="open(link)"
      >
        <span class="patient-row-main"
          ><strong>{{ link.owner_name || 'Paciente' }}</strong
          ><small v-if="overview"
            >{{ lastRecordLabel(overview.lastRecord, currentDate()) }}
            <template v-if="overview.attention">
              ·
              <em
                >{{ overview.attention }}
                {{
                  overview.attention === 1 ? 'ponto para conversar' : 'pontos para conversar'
                }}</em
              ></template
            ></small
          ><small v-else-if="failed[link.owner_id]">{{ failed[link.owner_id] }}</small
          ><small v-else>Carregando...</small></span
        >
        <span
          v-if="overview"
          class="patient-row-months"
          role="img"
          :aria-label="`Por mês: ${overview.months.map((month) => `${month.name} ${month.percent === null ? 'sem registros' : `${month.percent}%`}`).join(', ')}`"
          ><span v-for="month in overview.months" :key="month.key" class="patient-row-bar"
            ><span
              v-if="month.percent !== null"
              :style="{ height: `${Math.max(month.percent, 4)}%` }"
            ></span></span
        ></span>
        <strong v-if="overview" class="patient-row-percent">{{
          overview.percent === null ? '—' : `${overview.percent}%`
        }}</strong>
        <span
          v-if="lastDelta(overview) !== null && lastDelta(overview) !== 0"
          :class="['overview-delta', lastDelta(overview)! > 0 ? 'up' : 'down']"
          >{{ lastDelta(overview)! > 0 ? '↑' : '↓' }}
          {{ Math.abs(lastDelta(overview)!) }} pontos</span
        >
      </button>
    </div>
  </template>

  <template v-else>
    <button
      v-if="level === 'details' || following.length > 1"
      type="button"
      class="text-button patients-back"
      @click="level === 'details' ? (level = 'overview') : (selectedId = null)"
    >
      <ArrowLeft :size="18" aria-hidden="true" />
      {{ level === 'details' ? 'Visão geral' : 'Todos os pacientes' }}
    </button>
    <div v-if="loading && !patientRecords" role="status" class="loading">
      Carregando registros...
    </div>
    <InlineAlert v-else-if="patientError" :message="patientError" />

    <!-- Level 2: overview -->
    <template v-else-if="patientRecords && level === 'overview'">
      <OverviewView
        :patient-name="patient.owner_name || 'Paciente'"
        :records="patientRecords"
        @details="level = 'details'"
      />
      <button
        type="button"
        class="text-button sharing-revoke patients-stop"
        @click="stopFollowing(patient)"
      >
        <UserRoundX :size="18" aria-hidden="true" /> Parar de acompanhar
      </button>
    </template>

    <!-- Level 3: details -->
    <template v-else-if="patientRecords">
      <div class="details-heading">
        <h1>{{ patient.owner_name || 'Paciente' }} <em>· detalhes</em></h1>
        <div class="insights-period" role="group" aria-label="Seção">
          <button
            type="button"
            :aria-pressed="detailsTab === 'records'"
            @click="detailsTab = 'records'"
          >
            Registros</button
          ><button
            type="button"
            :aria-pressed="detailsTab === 'report'"
            @click="detailsTab = 'report'"
          >
            Relatório
          </button>
        </div>
      </div>
      <template v-if="detailsTab === 'records'">
        <div class="insights-period details-subtabs" role="group" aria-label="Visualização">
          <button
            type="button"
            :aria-pressed="recordsView === 'week'"
            @click="recordsView = 'week'"
          >
            Semana</button
          ><button
            type="button"
            :aria-pressed="recordsView === 'month'"
            @click="recordsView = 'month'"
          >
            Mês
          </button>
        </div>
        <WeekView
          v-if="recordsView === 'week'"
          v-model:monday="monday"
          v-model:selected-week-day="selectedWeekDay"
          :goals="patientRecords.goals"
          :completions="patientRecords.completions"
          :history="patientRecords.history"
          :day-details="patientRecords.dayDetails"
          :mobile-week="mobileWeek"
          readonly
          @open-day="selectedDay = $event"
          @current-week="goToCurrentWeek"
          @overlay-change="detailOverlay = $event"
        />
        <MonthView
          v-else
          readonly
          :goals="patientRecords.goals"
          :completions="patientRecords.completions"
          :history="patientRecords.history"
          :day-details="patientRecords.dayDetails"
          @open-day="selectedDay = $event"
          @overlay-change="detailOverlay = $event"
          @current-week="goToCurrentWeek"
        />
      </template>
      <SummaryView
        v-else
        :patient-name="patient.owner_name || 'Paciente'"
        :goals="patientRecords.goals"
        :completions="patientRecords.completions"
        :history="patientRecords.history"
        :day-details="patientRecords.dayDetails"
      />
    </template>
  </template>
  <InlineAlert v-if="actionError" :message="actionError" />

  <Teleport to="body">
    <DayDialog
      v-if="selectedDay && patientRecords"
      :key="localKey(selectedDay)"
      :date="selectedDay"
      :goals="patientRecords.goals"
      :completions="patientRecords.completions"
      :history="patientRecords.history"
      :day-details="patientRecords.dayDetails"
      :busy="false"
      message=""
      readonly
      @close="selectedDay = null"
      @open-week="openWeekOf"
    />
  </Teleport>
</template>
