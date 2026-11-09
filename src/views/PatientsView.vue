<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, UserRound, UserRoundX } from '@lucide/vue'
import { loadData, removeCareLink, type CareLink } from '../lib/data'
import { localKey, mondayOf } from '../lib/dates'
import { currentDate } from '../lib/today'
import DayDialog from '../components/DayDialog.vue'
import InlineAlert from '../components/InlineAlert.vue'
import MonthView from './MonthView.vue'
import WeekView from './WeekView.vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import type { AskConfirmation } from '../lib/confirm'

// The professional's side of sharing (migration 012): the people who shared goals with
// this account and, for each one, the usual week and month screens in read-only mode.
const props = defineProps<{
  following: CareLink[]
  mobileWeek: boolean
  confirm: AskConfirmation
}>()
const emit = defineEmits<{ changed: []; overlayChange: [open: boolean] }>()

const selectedId = ref<string | null>(null)
const patient = computed(() => props.following.find((link) => link.id === selectedId.value))
// The list shows one person at a time; with a single patient, open it directly.
watch(
  () => props.following.map((link) => link.id).join(),
  () => {
    if (selectedId.value && !patient.value) selectedId.value = null
    if (!selectedId.value && props.following.length === 1) selectedId.value = props.following[0]!.id
  },
  { immediate: true },
)

type Records = {
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
}
const records = ref<Records | null>(null)
const loading = ref(false)
const error = ref('')
let version = 0
watch(
  () => patient.value && `${patient.value.owner_id}:${patient.value.goalIds.join()}`,
  async () => {
    const current = ++version
    records.value = null
    error.value = ''
    if (!patient.value) return
    loading.value = true
    try {
      const result = await loadData(patient.value.owner_id)
      if (current === version) records.value = result
    } catch (caught) {
      if (current === version)
        error.value = caught instanceof Error ? caught.message : 'Não foi possível carregar.'
    } finally {
      if (current === version) loading.value = false
    }
  },
  { immediate: true },
)

const view = ref<'week' | 'month'>('week')
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
  view.value = 'week'
}

const selectedDay = ref<Date | null>(null)
const detailOverlay = ref(false)
watch([selectedDay, detailOverlay], ([day, detail]) => emit('overlayChange', !!day || detail))
onUnmounted(() => emit('overlayChange', false))
function openWeekOf(date: Date) {
  monday.value = mondayOf(date)
  selectedWeekDay.value = localKey(date)
  selectedDay.value = null
  view.value = 'week'
}

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
    error.value = caught instanceof Error ? caught.message : 'Algo deu errado. Tente novamente.'
  }
}
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ACOMPANHAMENTO</span>
      <h1>Pacientes <em>em dia.</em></h1>
      <p>Somente leitura: você vê as metas que cada pessoa escolheu compartilhar.</p>
    </div>
  </div>

  <section v-if="!patient" class="panel patients-list" aria-labelledby="patients-title">
    <h2 id="patients-title">Quem compartilha com você</h2>
    <p v-if="!following.length" class="sharing-empty">
      Ninguém compartilhou metas com você ainda. Peça para a pessoa gerar um convite em Minhas metas
      → Compartilhar com profissional.
    </p>
    <button
      v-for="link in following"
      :key="link.id"
      type="button"
      class="patient-item"
      @click="selectedId = link.id"
    >
      <UserRound :size="22" aria-hidden="true" />
      <span
        ><strong>{{ link.owner_name || 'Paciente' }}</strong
        ><small
          >{{ link.goalIds.length }}
          {{ link.goalIds.length === 1 ? 'meta compartilhada' : 'metas compartilhadas' }} · desde
          {{ formatDate(link.created_at) }}</small
        ></span
      >
    </button>
  </section>

  <template v-else>
    <div class="patient-bar">
      <button
        v-if="following.length > 1"
        type="button"
        class="text-button"
        @click="selectedId = null"
      >
        <ArrowLeft :size="18" aria-hidden="true" /> Todos os pacientes
      </button>
      <span class="patient-name"
        ><UserRound :size="20" aria-hidden="true" /><strong>{{
          patient.owner_name || 'Paciente'
        }}</strong></span
      >
      <div class="insights-period" role="group" aria-label="Visualização">
        <button type="button" :aria-pressed="view === 'week'" @click="view = 'week'">Semana</button
        ><button type="button" :aria-pressed="view === 'month'" @click="view = 'month'">Mês</button>
      </div>
      <button type="button" class="text-button sharing-revoke" @click="stopFollowing(patient)">
        <UserRoundX :size="18" aria-hidden="true" /> Parar de acompanhar
      </button>
    </div>
    <div v-if="loading" role="status" class="loading">Carregando registros...</div>
    <InlineAlert v-else-if="error" :message="error" />
    <template v-else-if="records">
      <WeekView
        v-if="view === 'week'"
        v-model:monday="monday"
        v-model:selected-week-day="selectedWeekDay"
        :goals="records.goals"
        :completions="records.completions"
        :history="records.history"
        :day-details="records.dayDetails"
        :mobile-week="mobileWeek"
        readonly
        @open-day="selectedDay = $event"
        @current-week="goToCurrentWeek"
        @overlay-change="detailOverlay = $event"
      />
      <MonthView
        v-else
        readonly
        :goals="records.goals"
        :completions="records.completions"
        :history="records.history"
        :day-details="records.dayDetails"
        @open-day="selectedDay = $event"
        @overlay-change="detailOverlay = $event"
        @current-week="goToCurrentWeek"
      />
    </template>
  </template>
  <InlineAlert v-if="error && !patient" :message="error" />

  <Teleport to="body">
    <DayDialog
      v-if="selectedDay && records"
      :key="localKey(selectedDay)"
      :date="selectedDay"
      :goals="records.goals"
      :completions="records.completions"
      :history="records.history"
      :day-details="records.dayDetails"
      :busy="false"
      message=""
      readonly
      @close="selectedDay = null"
      @open-week="openWeekOf"
    />
  </Teleport>
</template>
