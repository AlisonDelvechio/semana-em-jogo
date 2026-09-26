<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import {
  cloudEnabled,
  createGoal,
  deleteGoal,
  loadData,
  setCompleted,
  supabase,
  updateGoal,
} from './lib/data'
import {
  addDays,
  fullWeekdays,
  localKey,
  mondayOf,
  goalForDate,
  scheduledFor,
  weekDays,
  weekdays,
  weekStats,
} from './lib/dates'
import type { Completion, Goal, GoalHistory, GoalInput } from './types'

const goals = ref<Goal[]>([]),
  completions = ref<Completion[]>([]),
  history = ref<GoalHistory[]>([])
const monday = ref(mondayOf(new Date())),
  tab = ref<'week' | 'goals'>('week')
const loading = ref(true),
  busy = ref(false),
  message = ref('')
const session = ref<Session | null>(null),
  email = ref(''),
  password = ref(''),
  signUp = ref(false)
const editing = ref<string | null>(null)
const fresh = (): GoalInput => ({
  title: '',
  category: 'treino',
  scheduled_weekdays: [],
  points: 10,
  active: true,
})
const form = ref<GoalInput>(fresh())
const days = computed(() => weekDays(monday.value))
const stats = computed(() => weekStats(goals.value, completions.value, monday.value, history.value))
const label = computed(
  () =>
    `${days.value[0]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${days.value[6]!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`,
)
const current = computed(() => localKey(monday.value) === localKey(mondayOf(new Date())))
const categoryName = (name: string) =>
  ({ treino: 'Treino', alimentacao: 'Alimentação', outro: 'Outro' })[
    name as 'treino' | 'alimentacao' | 'outro'
  ]
const errorMessage = (error: unknown) => {
  message.value = error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.'
}
const planned = (date: Date) =>
  goals.value.map((goal) => goalForDate(goal, history.value, date)).filter((goal) => scheduledFor(goal, date))
const activeThisWeek = computed(() => new Set(days.value.flatMap((date) => planned(date).map((goal) => goal.id))).size)
const isDone = (goal: Goal, date: Date) =>
  completions.value.some((item) => item.goal_id === goal.id && item.local_date === localKey(date))
async function refresh() {
  loading.value = true
  try {
    const result = await loadData()
    goals.value = result.goals
    completions.value = result.completions
    history.value = result.history
  } catch (error) {
    errorMessage(error)
  } finally {
    loading.value = false
  }
}
async function auth() {
  if (!supabase) return
  busy.value = true
  message.value = ''
  try {
    if (signUp.value) {
      const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      if (!data.session) message.value = 'Confira seu email para confirmar a conta.'
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
    }
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
function changeDay(day: number) {
  form.value.scheduled_weekdays = form.value.scheduled_weekdays.includes(day)
    ? form.value.scheduled_weekdays.filter((value) => value !== day)
    : [...form.value.scheduled_weekdays, day].sort()
}
function switchAuth() {
  signUp.value = !signUp.value
  message.value = ''
}
function cancelEdit() {
  editing.value = null
  form.value = fresh()
}
async function save() {
  message.value = ''
  const input = {
    ...form.value,
    title: form.value.title.trim(),
    scheduled_weekdays: [...form.value.scheduled_weekdays],
  }
  if (
    !input.title ||
    !input.scheduled_weekdays.length ||
    !Number.isInteger(input.points) ||
    input.points < 1
  ) {
    message.value = 'Informe nome, dias e pontos válidos.'
    return
  }
  busy.value = true
  try {
    if (editing.value) await updateGoal(editing.value, input)
    else await createGoal(input)
    await refresh()
    editing.value = null
    form.value = fresh()
    message.value = 'Meta salva.'
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
function edit(goal: Goal) {
  editing.value = goal.id
  form.value = {
    title: goal.title,
    category: goal.category,
    scheduled_weekdays: [...goal.scheduled_weekdays],
    points: goal.points,
    active: goal.active,
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function remove(goal: Goal) {
  if (!confirm(`Excluir “${goal.title}” e todo o histórico dessa meta?`)) return
  busy.value = true
  message.value = ''
  try {
    await deleteGoal(goal.id)
    await refresh()
    if (editing.value === goal.id) {
      editing.value = null
      form.value = fresh()
    }
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
async function pause(goal: Goal) {
  busy.value = true
  message.value = ''
  try {
    await updateGoal(goal.id, {
      title: goal.title,
      category: goal.category,
      scheduled_weekdays: goal.scheduled_weekdays,
      points: goal.points,
      active: !goal.active,
    })
    await refresh()
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
async function mark(goal: Goal, date: Date) {
  busy.value = true
  message.value = ''
  try {
    await setCompleted(goal.id, localKey(date), !isDone(goal, date))
    await refresh()
  } catch (error) {
    errorMessage(error)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    if (error) errorMessage(error)
    session.value = data.session
    supabase.auth.onAuthStateChange((_event, next) => {
      session.value = next
      if (next) void refresh()
      else {
        goals.value = []
        completions.value = []
        history.value = []
        loading.value = false
      }
    })
  }
  if (!cloudEnabled || session.value) await refresh()
  else loading.value = false
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">✦</span> semana<span>emjogo</span></div>
      <div class="top-actions">
        <span v-if="!cloudEnabled" class="local-badge">Modo local</span
        ><button v-if="session" class="text-button" @click="supabase?.auth.signOut()">Sair</button>
      </div>
    </header>
    <main v-if="cloudEnabled && !session" class="auth-layout">
      <div class="auth-intro">
        <span class="eyebrow">SEU RITMO, SUA SEMANA</span>
        <h1>Pequenos passos.<br /><em>Grandes semanas.</em></h1>
        <p>
          Organize seus treinos e hábitos de alimentação em um checklist simples. Cada conquista
          merece ser vista.
        </p>
        <div class="decoration" aria-hidden="true">✳</div>
      </div>
      <form class="auth-card" @submit.prevent="auth">
        <span class="eyebrow">COMECE POR AQUI</span>
        <h2>{{ signUp ? 'Crie sua conta' : 'Boas-vindas de volta' }}</h2>
        <p>Seu progresso acompanha você em qualquer dispositivo.</p>
        <label
          >Email<input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="voce@exemplo.com" /></label
        ><label
          >Senha<input
            v-model="password"
            type="password"
            :autocomplete="signUp ? 'new-password' : 'current-password'"
            minlength="6"
            required
            placeholder="No mínimo 6 caracteres" /></label
        ><button class="primary-button" :disabled="busy">
          {{ busy ? 'Aguarde...' : signUp ? 'Criar conta' : 'Entrar' }} ↗</button
        ><button type="button" class="auth-switch" @click="switchAuth">
          {{ signUp ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta' }}
        </button>
        <p v-if="message" role="status" class="notice">{{ message }}</p>
      </form>
    </main>
    <div v-else class="dashboard">
      <aside class="sidebar">
        <span class="eyebrow">MEU ESPAÇO</span
        ><button :class="['nav-button', { selected: tab === 'week' }]" @click="tab = 'week'">
          ▦ &nbsp; Minha semana</button
        ><button :class="['nav-button', { selected: tab === 'goals' }]" @click="tab = 'goals'">
          ◎ &nbsp; Minhas metas
        </button>
        <div class="sidebar-note">
          ✳
          <p>O progresso acontece um dia de cada vez.</p>
        </div>
      </aside>
      <main class="content">
        <div v-if="loading" role="status" class="loading">Carregando sua semana...</div>
        <template v-else-if="tab === 'week'"
          ><div class="page-heading">
            <div>
              <span class="eyebrow">SEU PAINEL SEMANAL</span>
              <h1>Uma semana de <em>cada vez.</em></h1>
              <p>O que importa é continuar no seu ritmo.</p>
            </div>
            <button class="small-button" @click="tab = 'goals'">+ Nova meta</button>
          </div>
          <div class="summary-grid">
            <div class="summary-card featured">
              <div class="card-top">PROGRESSO DA SEMANA <span>✺</span></div>
              <div class="progress-main">
                <strong>{{ stats.percent }}%</strong><span>do seu plano concluído</span>
              </div>
              <div class="progress-track"><div :style="{ width: `${stats.percent}%` }"></div></div>
              <small>{{ stats.completed }} de {{ stats.total }} atividades concluídas</small>
            </div>
            <div class="summary-card">
              <div class="card-top">PONTOS CONQUISTADOS <span>✦</span></div>
              <strong class="stat-number">{{ stats.points }} <small>pts</small></strong>
              <p>Cada passo conta.</p>
            </div>
            <div class="summary-card">
              <div class="card-top">METAS ATIVAS <span>◎</span></div>
              <strong class="stat-number">{{ activeThisWeek }}</strong>
              <p>Um plano feito por você.</p>
            </div>
          </div>
          <section class="week-section">
            <div class="section-heading">
              <div>
                <span class="eyebrow">CHECKLIST</span>
                <h2>Seu plano da semana</h2>
              </div>
              <div class="week-nav">
                <button aria-label="Semana anterior" @click="monday = addDays(monday, -7)">‹</button
                ><span>{{ label }}</span
                ><button aria-label="Próxima semana" @click="monday = addDays(monday, 7)">›</button>
              </div>
            </div>
            <button v-if="!current" class="today-link" @click="monday = mondayOf(new Date())">
              Voltar para esta semana ↗
            </button>
            <div v-if="!days.some((date) => planned(date).length)" class="empty-state">
              <span>✳</span>
              <h3>Nenhuma meta nesta semana</h3>
              <p>Crie uma meta para montar seu checklist semanal.</p>
              <button class="primary-button" @click="tab = 'goals'">Ver minhas metas</button>
            </div>
            <div v-else class="days-grid">
              <article
                v-for="date in days"
                :key="localKey(date)"
                :class="['day-card', { 'is-today': localKey(date) === localKey(new Date()) }]"
              >
                <div class="day-heading">
                  <div>
                    <span>{{ fullWeekdays[date.getDay()] }}</span
                    ><strong
                      >{{ date.getDate() }}
                      <small>{{
                        date.toLocaleDateString('pt-BR', { month: 'short' })
                      }}</small></strong
                    >
                  </div>
                  <span v-if="localKey(date) === localKey(new Date())" class="today-pill"
                    >HOJE</span
                  >
                </div>
                <div v-if="planned(date).length" class="tasks">
                  <label
                    v-for="goal in planned(date)"
                    :key="goal.id"
                    :class="['task', goal.category, { done: isDone(goal, date) }]"
                    ><input
                      type="checkbox"
                      :checked="isDone(goal, date)"
                      :disabled="busy"
                      :aria-label="`${goal.title} em ${date.toLocaleDateString('pt-BR')}`"
                      @change="mark(goal, date)"
                    /><span class="check-visual" aria-hidden="true">✓</span
                    ><span class="task-title"
                      >{{ goal.title
                      }}<small
                        >{{ categoryName(goal.category) }} · {{ goal.points }} pts</small
                      ></span
                    ></label
                  >
                </div>
                <p v-else class="rest-day">Dia livre para respirar ☀</p>
              </article>
            </div>
          </section></template
        ><template v-else
          ><div class="page-heading">
            <div>
              <span class="eyebrow">SEU PLANO</span>
              <h1>Metas que cabem <em>na vida.</em></h1>
              <p>Escolha ações simples que você gostaria de repetir.</p>
            </div>
          </div>
          <div class="goals-layout">
            <form class="goal-form panel" @submit.prevent="save">
              <span class="eyebrow">{{ editing ? 'AJUSTAR META' : 'NOVA META' }}</span>
              <h2>{{ editing ? 'Editar meta' : 'Crie uma meta' }}</h2>
              <label
                >O que você quer fazer?<input
                  v-model="form.title"
                  required
                  maxlength="100"
                  placeholder="Ex.: Fazer treino de força"
              /></label>
              <div class="form-row">
                <label
                  >Categoria<select v-model="form.category">
                    <option value="treino">Treino</option>
                    <option value="alimentacao">Alimentação</option>
                    <option value="outro">Outro</option>
                  </select></label
                ><label
                  >Pontos<input
                    v-model.number="form.points"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    required
                /></label>
              </div>
              <fieldset>
                <legend>Em quais dias?</legend>
                <div class="day-picker">
                  <button
                    v-for="day in [1, 2, 3, 4, 5, 6, 0]"
                    :key="day"
                    type="button"
                    :class="{ active: form.scheduled_weekdays.includes(day) }"
                    :aria-pressed="form.scheduled_weekdays.includes(day)"
                    :aria-label="fullWeekdays[day]"
                    @click="changeDay(day)"
                  >
                    {{ weekdays[day] }}
                  </button>
                </div>
              </fieldset>
              <label class="active-switch"
                ><input v-model="form.active" type="checkbox" /> Meta ativa</label
              >
              <div class="form-actions">
                <button class="primary-button" :disabled="busy">
                  {{ editing ? 'Salvar alterações' : 'Adicionar meta' }} ↗</button
                ><button v-if="editing" type="button" class="text-button" @click="cancelEdit">
                  Cancelar
                </button>
              </div>
            </form>
            <section class="goal-list panel">
              <span class="eyebrow">SEU REPERTÓRIO</span>
              <h2>
                Minhas metas <span>{{ goals.length }}</span>
              </h2>
              <div v-if="!goals.length" class="list-empty">
                Suas metas aparecerão aqui. Que tal começar com uma ação pequena?
              </div>
              <article
                v-for="goal in goals"
                :key="goal.id"
                :class="['goal-item', { inactive: !goal.active }]"
              >
                <div class="goal-icon" :class="goal.category">
                  {{
                    goal.category === 'treino' ? '↗' : goal.category === 'alimentacao' ? '◒' : '✦'
                  }}
                </div>
                <div class="goal-details">
                  <strong>{{ goal.title }}</strong
                  ><span
                    >{{ categoryName(goal.category) }} · {{ goal.points }} pts ·
                    {{ goal.scheduled_weekdays.map((day) => weekdays[day]).join(', ') }}</span
                  ><small v-if="!goal.active">Pausada</small>
                </div>
                <div class="goal-actions">
                  <button
                    :disabled="busy"
                    :aria-label="goal.active ? `Pausar ${goal.title}` : `Ativar ${goal.title}`"
                    @click="pause(goal)"
                  >
                    {{ goal.active ? 'Ⅱ' : '▷' }}</button
                  ><button :aria-label="`Editar ${goal.title}`" @click="edit(goal)">✎</button
                  ><button
                    :disabled="busy"
                    :aria-label="`Excluir ${goal.title}`"
                    @click="remove(goal)"
                  >
                    ×
                  </button>
                </div>
              </article>
            </section>
          </div></template
        >
        <p v-if="message" role="status" class="notice dashboard-notice">{{ message }}</p>
        <footer>Feito para celebrar a constância, no seu tempo. ✦</footer>
      </main>
    </div>
    <nav v-if="!cloudEnabled || session" class="mobile-nav" aria-label="Navegação principal">
      <button :class="{ selected: tab === 'week' }" @click="tab = 'week'">
        ▦ <span>Semana</span></button
      ><button :class="{ selected: tab === 'goals' }" @click="tab = 'goals'">
        ◎ <span>Metas</span>
      </button>
    </nav>
  </div>
</template>
