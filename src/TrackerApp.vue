<script setup lang="ts">
// App shell: owns the loaded records, the session, navigation and the write actions.
// Screens (views/) and dialogs (components/) receive data as props and emit intents.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Session } from '@supabase/supabase-js'
import {
  CalendarDays,
  ClipboardList,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Target,
  Users,
} from '@lucide/vue'
import {
  authRedirect,
  cloudEnabled,
  createGoal,
  deleteGoal,
  importGoalBackup,
  acceptCareInvite,
  loadCare,
  loadData,
  previewCareInvite,
  type CareState,
  saveDay,
  setCompleted,
  supabase,
  updateGoal,
  type DayEntry,
} from './lib/data'
import { localKey, mondayOf } from './lib/dates'
import { authErrorMessage } from './lib/auth-messages'
import type { ConfirmOptions } from './lib/confirm'
import { goalToInput } from './lib/goals'
import type { BackupRecord } from './lib/report'
import { currentDate, startTodayClock, syncToday, todayKey } from './lib/today'
import { useTheme } from './composables/useTheme'
import AuthView from './views/AuthView.vue'
import NewPasswordView from './views/NewPasswordView.vue'
import WeekView from './views/WeekView.vue'
import MonthView from './views/MonthView.vue'
import GoalsView from './views/GoalsView.vue'
import PatientsView from './views/PatientsView.vue'
import AppNotice from './components/AppNotice.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DayDialog from './components/DayDialog.vue'
import GoalEditorDialog from './components/GoalEditorDialog.vue'
import type { Completion, Goal, GoalDayDetail, GoalHistory, GoalInput } from './types'

const goals = ref<Goal[]>([]),
  completions = ref<Completion[]>([]),
  history = ref<GoalHistory[]>([]),
  dayDetails = ref<GoalDayDetail[]>([])
const session = ref<Session | null>(null)
// Opened from a password recovery email: ask for the new password before the app.
const recovering = ref(authRedirect.recovery)
// Removes the tokens or error that Supabase put in the address after an email link.
function clearAuthRedirect() {
  if (window.location.hash || window.location.search.includes('error'))
    window.history.replaceState(null, '', window.location.pathname)
}
function finishRecovery(changed: boolean) {
  recovering.value = false
  clearAuthRedirect()
  if (changed) message.value = 'Senha alterada. Você já está conectado.'
}
const tab = ref<'week' | 'month' | 'goals' | 'patients'>('week')
const loading = ref(true),
  busy = ref(false)
const { darkMode, toggleTheme } = useTheme()

// Feedback messages. Any new text resets the error flag; errorMessage sets it again.
const message = ref('')
const messageIsError = ref(false)
watch(
  message,
  () => {
    messageIsError.value = false
  },
  { flush: 'sync' },
)
const errorMessage = (error: unknown) => {
  message.value = error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.'
  messageIsError.value = true
}

// Promise-based confirmation dialog.
type Confirmation = ConfirmOptions
const confirmation = ref<Confirmation | null>(null)
let resolveConfirmation: ((confirmed: boolean) => void) | null = null
function askConfirmation(options: Confirmation): Promise<boolean> {
  confirmation.value = options
  return new Promise((resolve) => {
    resolveConfirmation = resolve
  })
}
function finishConfirmation(confirmed: boolean) {
  confirmation.value = null
  resolveConfirmation?.(confirmed)
  resolveConfirmation = null
}

// Week navigation lives here because the day dialog and the midnight rollover move it too.
const monday = ref(mondayOf(currentDate()))
const selectedWeekDay = ref(localKey(currentDate()))
watch(
  monday,
  () => {
    const today = localKey(currentDate())
    selectedWeekDay.value =
      localKey(mondayOf(currentDate())) === localKey(monday.value) ? today : localKey(monday.value)
  },
  { flush: 'sync' },
)
// Moves the week view to the new day when the app stays open past midnight,
// unless the user was browsing another week or another day.
watch(todayKey, (next, previous) => {
  const previousMonday = localKey(mondayOf(new Date(`${previous}T12:00:00`)))
  if (localKey(monday.value) !== previousMonday) return
  const followToday = selectedWeekDay.value === previous
  if (localKey(mondayOf(new Date(`${next}T12:00:00`))) !== previousMonday)
    monday.value = mondayOf(currentDate())
  if (followToday) selectedWeekDay.value = next
})
function goToCurrentWeek() {
  monday.value = mondayOf(currentDate())
  selectedWeekDay.value = localKey(currentDate())
  tab.value = 'week'
}
function openWeekOf(date: Date) {
  monday.value = mondayOf(date)
  selectedWeekDay.value = localKey(date)
  selectedDay.value = null
  tab.value = 'week'
}
watch(tab, async () => {
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'instant' })
})
const mobileWeek = ref(false)
const mobileQuery = window.matchMedia('(max-width: 720px)')
const syncMobileWeek = () => {
  mobileWeek.value = mobileQuery.matches
}

// Dialogs.
const selectedDay = ref<Date | null>(null)
const goalEditorOpen = ref(false)
const editingGoal = ref<Goal | null>(null)
const detailOverlay = ref(false)
const hasOverlay = computed(
  () =>
    detailOverlay.value ||
    goalEditorOpen.value ||
    selectedDay.value !== null ||
    confirmation.value !== null,
)

const profileName = computed(() => {
  const name = session.value?.user.user_metadata?.full_name
  return typeof name === 'string' && name.trim()
    ? name.trim()
    : session.value?.user.email?.split('@')[0] || 'Você'
})
const profileInitials = computed(() =>
  profileName.value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(''),
)

let refreshVersion = 0
let authRefreshTimer: ReturnType<typeof setTimeout> | undefined
let unsubscribeAuth: (() => void) | undefined
let disposed = false
// The first load decides the starting tab only once.
let openedOnce = false
// Quick checks still being written (see toggleCompletion).
let pendingToggles = 0
function clearData() {
  refreshVersion++
  openedOnce = false
  care.value = null
  goals.value = []
  completions.value = []
  history.value = []
  dayDetails.value = []
}
// `silent` reloads in the background (returning to the tab) without replacing the
// screen with the loading state or reporting transient network errors.
async function refresh({ silent = false } = {}) {
  const version = ++refreshVersion
  if (!silent) loading.value = true
  try {
    const [result, sharing] = await Promise.all([loadData(), loadCareSafely()])
    if (version !== refreshVersion || disposed) return
    goals.value = result.goals
    completions.value = result.completions
    history.value = result.history
    dayDetails.value = result.dayDetails
    care.value = sharing
    // Someone who only follows other people (no goals of their own) starts on Pacientes.
    if (!silent && !openedOnce && !result.goals.length && sharing?.following.length)
      tab.value = 'patients'
    openedOnce = true
    void handlePendingInvite()
  } catch (error) {
    if (version === refreshVersion && !disposed && !silent) errorMessage(error)
  } finally {
    if (version === refreshVersion && !disposed && !silent) loading.value = false
  }
}
// ===== Read-only sharing with a professional (migration 012) =====
// null: local mode, signed out, or the migration is not applied yet (feature hidden).
const care = ref<CareState | null>(null)
async function loadCareSafely(): Promise<CareState | null> {
  if (!cloudEnabled || !session.value) return null
  try {
    return await loadCare()
  } catch {
    // Sharing is secondary: a failure here must not block the person's own records.
    return care.value
  }
}
async function refreshCare() {
  care.value = await loadCareSafely()
}
// An invite link (?convite=...) survives the sign-in or sign-up in between.
const INVITE_KEY = 'semana-em-jogo-convite'
function readInvite(): string | null {
  const token = new URLSearchParams(window.location.search).get('convite')
  try {
    if (token) {
      sessionStorage.setItem(INVITE_KEY, token)
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
    return sessionStorage.getItem(INVITE_KEY)
  } catch {
    return token
  }
}
const pendingInvite = ref(readInvite())
function dropInvite() {
  pendingInvite.value = null
  try {
    sessionStorage.removeItem(INVITE_KEY)
  } catch {
    // Nothing stored.
  }
}
let handlingInvite = false
async function handlePendingInvite() {
  const token = pendingInvite.value
  if (!token || !session.value || !cloudEnabled || handlingInvite) return
  handlingInvite = true
  try {
    const preview = await previewCareInvite(token)
    const accepted = await askConfirmation({
      title: 'Aceitar convite de acompanhamento?',
      description: `${preview.owner_name || 'Uma pessoa'} quer compartilhar com você: ${preview.goal_titles.join(', ') || 'metas'}. Você poderá ver os registros dessas metas, sem alterar nada.`,
      confirmLabel: 'Aceitar convite',
    })
    dropInvite()
    if (!accepted) return
    await acceptCareInvite(token)
    await refreshCare()
    tab.value = 'patients'
    message.value = `Agora você acompanha ${preview.owner_name || 'esta pessoa'}.`
  } catch (error) {
    dropInvite()
    errorMessage(error)
  } finally {
    handlingInvite = false
  }
}
const showPatients = computed(
  () => Boolean(care.value?.following.length) || tab.value === 'patients',
)
// Someone who only follows other people and has no goals of their own sees just the
// Pacientes area. "Quero registrar minhas próprias metas" brings the rest back; the
// choice is a per-browser convenience, and creating a goal brings it back anyway.
const OWN_GOALS_KEY = 'semana-em-jogo-metas-proprias'
const ownGoalsWanted = ref(
  (() => {
    try {
      return localStorage.getItem(OWN_GOALS_KEY) === '1'
    } catch {
      return false
    }
  })(),
)
const professionalOnly = computed(
  () =>
    !loading.value &&
    Boolean(care.value?.following.length) &&
    !goals.value.length &&
    !ownGoalsWanted.value,
)
watch(professionalOnly, (only) => {
  if (only) tab.value = 'patients'
})
function useOwnGoals() {
  ownGoalsWanted.value = true
  try {
    localStorage.setItem(OWN_GOALS_KEY, '1')
  } catch {
    // Still applies for this visit.
  }
  tab.value = 'week'
}

// Another device or tab may have saved records while this one was in the background.
// Reload them when the page is shown again so a later save does not overwrite them
// with stale data. Skipped while a write is running or the first load is pending.
const RESUME_REFRESH_MS = 30_000
let lastResumeRefresh = 0
function onPageVisible() {
  if (document.visibilityState !== 'visible') return
  syncToday()
  if (busy.value || loading.value || pendingToggles || (cloudEnabled && !session.value)) return
  // An open editor keeps its draft; reload after it closes.
  if (selectedDay.value || goalEditorOpen.value) return
  if (Date.now() - lastResumeRefresh < RESUME_REFRESH_MS) return
  lastResumeRefresh = Date.now()
  void refresh({ silent: true })
}

// Runs one write with the shared busy state, reloads the data and reports the outcome.
async function write(action: () => Promise<unknown>, success: string): Promise<boolean> {
  busy.value = true
  message.value = ''
  try {
    await action()
    await refresh()
    message.value = success
    return true
  } catch (error) {
    errorMessage(error)
    return false
  } finally {
    busy.value = false
  }
}

function openDay(date: Date) {
  message.value = ''
  selectedDay.value = date
}
async function saveDayRecords(localDate: string, entries: DayEntry[]) {
  await write(async () => {
    await saveDay(localDate, entries)
    selectedDay.value = null
  }, 'Registro do dia salvo.')
}

// Quick check from the week cards. The card changes at once; the write runs in the
// background and is undone if it fails. Data is reloaded after the last pending toggle.
async function toggleCompletion(goal: Goal, date: Date) {
  const day = localKey(date)
  const matches = (entry: Completion) => entry.goal_id === goal.id && entry.local_date === day
  const done = completions.value.some(matches)
  const optimistic: Completion = {
    id: `pending-${goal.id}-${day}`,
    user_id: goal.user_id,
    goal_id: goal.id,
    local_date: day,
    completed_at: new Date().toISOString(),
  }
  completions.value = done
    ? completions.value.filter((entry) => !matches(entry))
    : [...completions.value, optimistic]
  message.value = ''
  pendingToggles++
  try {
    await setCompleted(goal.id, day, !done)
  } catch (error) {
    completions.value = done
      ? [...completions.value, optimistic]
      : completions.value.filter((entry) => !matches(entry))
    errorMessage(error)
  } finally {
    if (--pendingToggles === 0 && !disposed) void refresh({ silent: true })
  }
}

function newGoal() {
  message.value = ''
  editingGoal.value = null
  goalEditorOpen.value = true
}
function editGoal(goal: Goal) {
  message.value = ''
  editingGoal.value = goal
  goalEditorOpen.value = true
}
function closeGoalEditor() {
  if (busy.value) return
  goalEditorOpen.value = false
  editingGoal.value = null
}
async function saveGoal(input: GoalInput) {
  message.value = ''
  const goal = editingGoal.value
  if (
    goal &&
    !(await askConfirmation({
      title: 'Salvar alterações da meta?',
      description:
        'A nova configuração será usada a partir de hoje. Os registros e as configurações anteriores serão preservados.',
      confirmLabel: 'Salvar alterações',
    }))
  )
    return
  const saved = await write(
    () => (goal ? updateGoal(goal.id, input) : createGoal(input)),
    'Meta salva.',
  )
  if (saved) {
    goalEditorOpen.value = false
    editingGoal.value = null
  }
}
async function removeGoal(goal: Goal) {
  const confirmed = await askConfirmation({
    title: 'Excluir meta?',
    description: `“${goal.title}” e todos os seus registros serão excluídos. Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir meta',
    danger: true,
  })
  if (confirmed) await write(() => deleteGoal(goal.id), 'Meta excluída.')
}
async function pauseGoal(goal: Goal) {
  const confirmed = await askConfirmation({
    title: goal.active ? 'Pausar meta?' : 'Retomar meta?',
    description: goal.active
      ? `“${goal.title}” deixará de aparecer nos próximos dias. Os registros anteriores serão preservados.`
      : `“${goal.title}” voltará a aparecer conforme a frequência configurada.`,
    confirmLabel: goal.active ? 'Pausar meta' : 'Retomar meta',
  })
  if (!confirmed) return
  await write(
    () => updateGoal(goal.id, { ...goalToInput(goal, 1), active: !goal.active }),
    goal.active ? 'Meta pausada.' : 'Meta retomada.',
  )
}
// Used by the reports panel, which shows the result next to the import controls.
async function restoreBackup(records: BackupRecord[]): Promise<string> {
  busy.value = true
  try {
    const result = await importGoalBackup(records)
    await refresh()
    return `Importação concluída: ${result.goals} metas, ${result.dayDetails} dias, ${result.completions} conclusões e ${result.history} versões adicionadas.`
  } finally {
    busy.value = false
  }
}

let stopTodayClock: (() => void) | undefined
onMounted(async () => {
  stopTodayClock = startTodayClock()
  document.addEventListener('visibilitychange', onPageVisible)
  window.addEventListener('focus', onPageVisible)
  syncMobileWeek()
  mobileQuery.addEventListener('change', syncMobileWeek)
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    if (disposed) return
    if (error) errorMessage(error)
    session.value = data.session
    // An expired or already used email link comes back with an error in the address.
    if (authRedirect.error && !data.session) {
      message.value = authErrorMessage(authRedirect.error)
      clearAuthRedirect()
    }
    const subscription = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') recovering.value = true
      if (!next) recovering.value = false
      if (session.value?.user.id !== next?.user.id) clearData()
      session.value = next
      clearTimeout(authRefreshTimer)
      if (next) {
        // getSession already covers startup. Defer later reads until the auth callback returns.
        if (event !== 'INITIAL_SESSION') {
          refreshVersion++
          authRefreshTimer = setTimeout(() => {
            if (!disposed && session.value?.access_token === next.access_token) void refresh()
          }, 0)
        }
      } else {
        clearData()
        loading.value = false
      }
    })
    unsubscribeAuth = () => subscription.data.subscription.unsubscribe()
  }
  if (!cloudEnabled || session.value) await refresh()
  else loading.value = false
})
onUnmounted(() => {
  disposed = true
  stopTodayClock?.()
  document.removeEventListener('visibilitychange', onPageVisible)
  window.removeEventListener('focus', onPageVisible)
  refreshVersion++
  clearTimeout(authRefreshTimer)
  unsubscribeAuth?.()
  finishConfirmation(false)
  mobileQuery.removeEventListener('change', syncMobileWeek)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar" :inert="hasOverlay">
      <div class="brand">
        <span class="brand-mark"><Sparkles :size="19" aria-hidden="true" /></span> semana<span
          >emjogo</span
        >
      </div>
      <div class="top-actions">
        <button
          type="button"
          class="theme-button"
          :aria-label="darkMode ? 'Ativar tema claro' : 'Ativar tema escuro'"
          :title="darkMode ? 'Tema claro' : 'Tema escuro'"
          :aria-pressed="darkMode"
          @click="toggleTheme"
        >
          <Sun v-if="darkMode" :size="19" aria-hidden="true" />
          <Moon v-else :size="19" aria-hidden="true" />
        </button>
        <div v-if="(!cloudEnabled || session) && !recovering" class="profile-corner">
          <div class="profile-avatar" aria-hidden="true">{{ session ? profileInitials : 'V' }}</div>
          <div class="profile-copy">
            <strong>{{ profileName }}</strong
            ><small>{{ session?.user.email || 'Modo local' }}</small>
          </div>
          <button
            v-if="session"
            type="button"
            class="profile-exit"
            aria-label="Sair da conta"
            title="Sair da conta"
            @click="supabase?.auth.signOut()"
          >
            <LogOut :size="18" />
          </button>
        </div>
      </div>
    </header>
    <nav
      v-if="(!cloudEnabled || session) && !recovering && !professionalOnly"
      class="mobile-nav"
      :inert="hasOverlay"
      aria-label="Navegação principal"
    >
      <template v-if="!professionalOnly">
        <button
          type="button"
          :class="{ selected: tab === 'week' }"
          :aria-current="tab === 'week' ? 'page' : undefined"
          @click="tab = 'week'"
        >
          <ClipboardList :size="20" aria-hidden="true" /> <span>Semana</span></button
        ><button
          type="button"
          :class="{ selected: tab === 'month' }"
          :aria-current="tab === 'month' ? 'page' : undefined"
          @click="tab = 'month'"
        >
          <CalendarDays :size="19" /> <span>Mês</span></button
        ><button
          type="button"
          :class="{ selected: tab === 'goals' }"
          :aria-current="tab === 'goals' ? 'page' : undefined"
          @click="tab = 'goals'"
        >
          <Target :size="19" /> <span>Metas</span>
        </button>
      </template>
      <button
        v-if="showPatients"
        type="button"
        :class="{ selected: tab === 'patients' }"
        :aria-current="tab === 'patients' ? 'page' : undefined"
        @click="tab = 'patients'"
      >
        <Users :size="19" /> <span>Pacientes</span>
      </button>
    </nav>
    <AuthView
      v-if="cloudEnabled && !session"
      v-model:message="message"
      :hint="
        pendingInvite ? 'Entre ou crie sua conta para aceitar o convite de acompanhamento.' : ''
      "
    />
    <NewPasswordView
      v-else-if="recovering"
      @done="finishRecovery(true)"
      @skip="finishRecovery(false)"
    />
    <div v-else class="dashboard" :inert="hasOverlay">
      <aside class="sidebar">
        <span class="eyebrow">MEU ESPAÇO</span>
        <template v-if="!professionalOnly"
          ><button :class="['nav-button', { selected: tab === 'week' }]" @click="tab = 'week'">
            <ClipboardList :size="20" aria-hidden="true" /> Minha semana</button
          ><button :class="['nav-button', { selected: tab === 'month' }]" @click="tab = 'month'">
            <CalendarDays :size="18" aria-hidden="true" /> Calendário</button
          ><button :class="['nav-button', { selected: tab === 'goals' }]" @click="tab = 'goals'">
            <Target :size="18" aria-hidden="true" /> Minhas metas
          </button></template
        ><button
          v-if="showPatients"
          :class="['nav-button', { selected: tab === 'patients' }]"
          @click="tab = 'patients'"
        >
          <Users :size="18" aria-hidden="true" /> Pacientes
        </button>
      </aside>
      <main :class="['content', { 'week-layout': tab === 'week' }]">
        <div v-if="loading" role="status" class="loading">Carregando sua semana...</div>
        <WeekView
          v-else-if="tab === 'week'"
          v-model:monday="monday"
          v-model:selected-week-day="selectedWeekDay"
          :goals="goals"
          :completions="completions"
          :history="history"
          :day-details="dayDetails"
          :mobile-week="mobileWeek"
          @open-day="openDay"
          @toggle="toggleCompletion"
          @new-goal="newGoal"
          @show-goals="tab = 'goals'"
          @current-week="goToCurrentWeek"
          @overlay-change="detailOverlay = $event"
        />
        <MonthView
          v-else-if="tab === 'month'"
          :goals="goals"
          :completions="completions"
          :history="history"
          :day-details="dayDetails"
          @open-day="openDay"
          @overlay-change="detailOverlay = $event"
          @current-week="goToCurrentWeek"
        />
        <PatientsView
          v-else-if="tab === 'patients'"
          :following="care?.following || []"
          :mobile-week="mobileWeek"
          :confirm="askConfirmation"
          @changed="refreshCare"
          @overlay-change="detailOverlay = $event"
        />
        <button
          v-if="tab === 'patients' && professionalOnly"
          type="button"
          class="text-button own-goals-link"
          @click="useOwnGoals"
        >
          Quero registrar minhas próprias metas
        </button>
        <GoalsView
          v-else
          :care="care"
          :confirm="askConfirmation"
          :goals="goals"
          :completions="completions"
          :history="history"
          :day-details="dayDetails"
          :busy="busy"
          :restore="restoreBackup"
          @new-goal="newGoal"
          @edit="editGoal"
          @pause="pauseGoal"
          @remove="removeGoal"
          @care-changed="refreshCare"
        />
        <AppNotice
          v-if="message && !selectedDay && !goalEditorOpen"
          :message="message"
          :error="messageIsError"
          @dismiss="message = ''"
        />
        <footer v-if="!mobileWeek">Feito para celebrar a constância, no seu tempo. ✦</footer>
      </main>
    </div>
    <GoalEditorDialog
      v-if="goalEditorOpen"
      :goal="editingGoal"
      :busy="busy"
      :message="message"
      :confirming="confirmation !== null"
      @close="closeGoalEditor"
      @save="saveGoal"
    />
    <ConfirmDialog
      v-if="confirmation"
      v-bind="confirmation"
      @confirm="finishConfirmation(true)"
      @cancel="finishConfirmation(false)"
    />
    <DayDialog
      v-if="selectedDay"
      :key="localKey(selectedDay)"
      :date="selectedDay"
      :goals="goals"
      :completions="completions"
      :history="history"
      :day-details="dayDetails"
      :busy="busy"
      :message="message"
      @close="selectedDay = null"
      @save="saveDayRecords"
      @open-week="openWeekOf"
    />
  </div>
</template>
