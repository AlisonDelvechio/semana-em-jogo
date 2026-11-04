<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, Download, Paperclip } from '@lucide/vue'
import { parseGoalBackup } from '../lib/backup'
import { localKey } from '../lib/dates'
import { createPrintableReport } from '../lib/print-report'
import { createGoalReport, type BackupRecord, type ReportRange } from '../lib/report'
import { currentDate } from '../lib/today'
import type { Completion, Goal, GoalDayDetail, GoalHistory } from '../types'
import InlineAlert from './InlineAlert.vue'

const props = defineProps<{
  goals: Goal[]
  completions: Completion[]
  history: GoalHistory[]
  dayDetails: GoalDayDetail[]
  busy: boolean
  // Imports the records and reloads the app data; resolves with the summary to show.
  restore: (records: BackupRecord[]) => Promise<string>
}>()

const reportMode = ref<'all' | 'month' | 'range'>('all')
const reportMonth = ref(localKey(currentDate()).slice(0, 7))
const reportFrom = ref(localKey(currentDate()))
const reportTo = ref(localKey(currentDate()))
const pendingBackup = ref<BackupRecord[] | null>(null)
const pendingBackupName = ref('')
const reportMessage = ref('')
// Success messages use the informational style; everything else is an error.
const reportIsInfo = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function selectedRange(): ReportRange | null {
  if (reportMode.value === 'month') {
    if (!/^\d{4}-\d{2}$/.test(reportMonth.value)) {
      reportMessage.value = 'Escolha um mês válido.'
      reportIsInfo.value = false
      return null
    }
    const [year, month] = reportMonth.value.split('-').map(Number)
    return { from: `${reportMonth.value}-01`, to: localKey(new Date(year!, month!, 0)) }
  }
  if (reportMode.value === 'range') {
    if (!reportFrom.value || !reportTo.value || reportFrom.value > reportTo.value) {
      reportMessage.value = 'Escolha um intervalo de datas válido.'
      reportIsInfo.value = false
      return null
    }
    return { from: reportFrom.value, to: reportTo.value }
  }
  return {}
}

function downloadReport(format: 'csv' | 'pdf') {
  const range = selectedRange()
  if (!range) return
  reportMessage.value = ''
  const csv = createGoalReport(
    props.goals,
    props.completions,
    props.history,
    props.dayDetails,
    currentDate(),
    range,
  )
  if (format === 'pdf') {
    const popup = window.open('', '_blank')
    if (!popup) {
      reportMessage.value = 'Permita abrir a janela do relatório para salvar o PDF.'
      reportIsInfo.value = false
      return
    }
    popup.opener = null
    popup.document.open()
    popup.document.write(createPrintableReport(csv, currentDate(), range))
    popup.onload = () => {
      popup.focus()
      popup.print()
    }
    popup.document.close()
    // The popup inherits this page's Content-Security-Policy, which blocks inline handlers,
    // so the print button is wired from here instead of an onclick attribute.
    popup.document.querySelector('[data-print]')?.addEventListener('click', () => popup.print())
    return
  }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `semana-em-jogo-relatorio-${localKey(currentDate())}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function selectBackup(event: Event) {
  pendingBackup.value = null
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 20_000_000) throw new Error('Arquivo muito grande (máximo de 20 MB).')
    pendingBackup.value = parseGoalBackup(await file.text())
    pendingBackupName.value = file.name
    reportMessage.value = ''
  } catch (error) {
    reportMessage.value = error instanceof Error ? error.message : 'Não foi possível ler o CSV.'
    reportIsInfo.value = false
  }
  input.value = ''
}

async function restoreBackup() {
  if (!pendingBackup.value) return
  try {
    reportMessage.value = await props.restore(pendingBackup.value)
    reportIsInfo.value = true
    pendingBackup.value = null
  } catch (error) {
    reportMessage.value =
      error instanceof Error ? error.message : 'Não foi possível importar o CSV.'
    reportIsInfo.value = false
  }
}
</script>

<template>
  <section class="report-tools panel" aria-labelledby="report-tools-title">
    <h2 id="report-tools-title">Relatórios e backups</h2>
    <section class="report-panel" aria-label="Exportar e importar registros">
      <div>
        <h3>Exportar relatório</h3>
        <p class="report-description">Escolha o período e o formato.</p>
        <label
          >Período
          <span class="select-control"
            ><select v-model="reportMode">
              <option value="all">Tudo desde o início</option>
              <option value="month">Um mês</option>
              <option value="range">Intervalo de datas</option></select
            ><ChevronDown :size="20" class="select-chevron" aria-hidden="true"
          /></span>
        </label>
        <label v-if="reportMode === 'month'">Mês<input v-model="reportMonth" type="month" /></label>
        <div v-if="reportMode === 'range'" class="report-dates">
          <label>De<input v-model="reportFrom" type="date" /></label>
          <label>Até<input v-model="reportTo" type="date" /></label>
        </div>
        <div class="report-export-actions">
          <button
            type="button"
            class="small-button report-button"
            :disabled="!goals.length"
            @click="downloadReport('csv')"
          >
            <Download :size="18" aria-hidden="true" /> Exportar CSV</button
          ><button
            type="button"
            class="primary-button report-button"
            :disabled="!goals.length"
            @click="downloadReport('pdf')"
          >
            <Download :size="18" aria-hidden="true" /> Salvar PDF
          </button>
        </div>
        <p class="report-format-help">
          PDF abre uma versão para impressão: escolha “Salvar como PDF”. O CSV inclui os dados para
          restauração.
        </p>
      </div>
      <div>
        <h3>Restaurar backup</h3>
        <p class="report-description">Importe os registros de um CSV exportado pelo app.</p>
        <!-- The native file input shows browser-language text ("Choose File"), so it is
             hidden and opened by a styled button instead. -->
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="visually-hidden"
          tabindex="-1"
          aria-hidden="true"
          @change="selectBackup"
        />
        <button type="button" class="file-picker" @click="fileInput?.click()">
          <Paperclip :size="18" aria-hidden="true" />
          <span>{{ pendingBackup ? pendingBackupName : 'Selecionar arquivo CSV' }}</span>
        </button>
        <p v-if="pendingBackup">
          {{ pendingBackupName }} · {{ pendingBackup.length }} metas reconhecidas. A importação
          adiciona apenas registros ausentes.
        </p>
        <button
          v-if="pendingBackup"
          type="button"
          class="small-button"
          :disabled="busy"
          @click="restoreBackup"
        >
          {{ busy ? 'Importando...' : 'Importar registros' }}
        </button>
        <p v-else>
          Arquivos antigos sem a coluna de restauração continuam legíveis, mas não podem ser
          importados com segurança.
        </p>
      </div>
      <InlineAlert
        v-if="reportMessage"
        class="report-notice"
        :message="reportMessage"
        :tone="reportIsInfo ? 'info' : 'error'"
      />
    </section>
  </section>
</template>
