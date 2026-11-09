<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, Link, UserRoundX, X } from '@lucide/vue'
import {
  cancelCareInvite,
  createCareInvite,
  removeCareLink,
  setSharedGoal,
  type CareLink,
  type CareState,
} from '../lib/data'
import { categoryName } from '../lib/goals'
import type { Goal } from '../types'
import type { AskConfirmation } from '../lib/confirm'
import InlineAlert from './InlineAlert.vue'

// The patient's side of read-only sharing (migration 012): choose goals, create a
// single-use invite link, and change or revoke what each person can see.
const props = defineProps<{
  goals: Goal[]
  care: CareState
  confirm: AskConfirmation
}>()
const emit = defineEmits<{ changed: [] }>()

// Food goals are the usual choice for a nutritionist, so they start selected.
const selected = ref<string[]>([])
watch(
  () => props.goals.map((goal) => goal.id).join(),
  () => {
    selected.value = props.goals
      .filter((goal) => goal.category === 'alimentacao')
      .map((goal) => goal.id)
  },
  { immediate: true },
)
const inviteLink = ref('')
const copied = ref(false)
const busy = ref(false)
const message = ref('')
const messageIsInfo = ref(false)
const titleOf = computed(() => new Map(props.goals.map((goal) => [goal.id, goal.title] as const)))
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

async function run(action: () => Promise<unknown>, success = '') {
  busy.value = true
  message.value = ''
  try {
    await action()
    if (success) {
      message.value = success
      messageIsInfo.value = true
    }
    emit('changed')
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.'
    messageIsInfo.value = false
  } finally {
    busy.value = false
  }
}
function createInvite() {
  copied.value = false
  return run(async () => {
    const token = await createCareInvite(selected.value)
    inviteLink.value = `${window.location.origin}/?convite=${token}`
  })
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
  } catch {
    message.value = 'Não foi possível copiar. Selecione o link e copie manualmente.'
    messageIsInfo.value = false
  }
}
function toggleGoal(link: CareLink, goalId: string, event: Event) {
  const shared = (event.target as HTMLInputElement).checked
  return run(() => setSharedGoal(link, goalId, shared))
}
async function revoke(link: CareLink) {
  const confirmed = await props.confirm({
    title: 'Remover acesso?',
    description: `${link.viewer_name || 'Esta pessoa'} deixará de ver suas metas e registros. Para voltar a compartilhar, será preciso um novo convite.`,
    confirmLabel: 'Remover acesso',
    danger: true,
  })
  if (confirmed) await run(() => removeCareLink(link.id), 'Acesso removido.')
}
</script>

<template>
  <section class="sharing-panel panel" aria-labelledby="sharing-title">
    <h2 id="sharing-title">Compartilhar com profissional</h2>
    <p class="sharing-intro">
      Convide sua nutricionista ou outro profissional para acompanhar as metas que você escolher. A
      pessoa só visualiza, sem alterar nada, e você pode mudar ou remover o acesso quando quiser.
    </p>

    <div class="sharing-block">
      <h3>Novo convite</h3>
      <p v-if="!goals.length" class="sharing-empty">Crie uma meta antes de compartilhar.</p>
      <fieldset v-else class="share-goals">
        <legend>Metas que a pessoa poderá ver</legend>
        <label v-for="goal in goals" :key="goal.id" class="share-goal"
          ><input v-model="selected" type="checkbox" :value="goal.id" /><span
            >{{ goal.title }} <small>{{ categoryName(goal.category) }}</small></span
          ></label
        >
      </fieldset>
      <button
        v-if="goals.length"
        type="button"
        class="primary-button"
        :disabled="busy || !selected.length"
        @click="createInvite"
      >
        <Link :size="18" aria-hidden="true" /> Gerar link de convite
      </button>
      <div v-if="inviteLink" class="invite-link">
        <input
          :value="inviteLink"
          readonly
          aria-label="Link do convite"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button type="button" class="small-button" @click="copyLink">
          <Copy :size="18" aria-hidden="true" /> {{ copied ? 'Copiado' : 'Copiar' }}
        </button>
        <p>
          Envie este link para a pessoa. Ele vale por 7 dias, pode ser usado uma vez e não fica
          salvo aqui depois que você sair desta tela.
        </p>
      </div>
    </div>

    <div v-if="care.invites.length" class="sharing-block">
      <h3>Convites pendentes</h3>
      <ul class="sharing-list">
        <li v-for="invite in care.invites" :key="invite.id">
          <span
            >Criado em {{ formatDate(invite.created_at) }} · vale até
            {{ formatDate(invite.expires_at) }}
            <small>{{
              invite.goal_ids
                .map((id) => titleOf.get(id))
                .filter(Boolean)
                .join(' · ')
            }}</small></span
          >
          <button
            type="button"
            class="text-button"
            :disabled="busy"
            :aria-label="`Cancelar convite criado em ${formatDate(invite.created_at)}`"
            @click="run(() => cancelCareInvite(invite.id), 'Convite cancelado.')"
          >
            <X :size="18" aria-hidden="true" /> Cancelar
          </button>
        </li>
      </ul>
    </div>

    <div v-if="care.sharing.length" class="sharing-block">
      <h3>Quem acompanha você</h3>
      <article v-for="link in care.sharing" :key="link.id" class="sharing-person">
        <div class="sharing-person-head">
          <span
            ><strong>{{ link.viewer_name || 'Profissional' }}</strong
            ><small>desde {{ formatDate(link.created_at) }}</small></span
          >
          <button
            type="button"
            class="text-button sharing-revoke"
            :disabled="busy"
            :aria-label="`Remover acesso de ${link.viewer_name || 'profissional'}`"
            @click="revoke(link)"
          >
            <UserRoundX :size="18" aria-hidden="true" /> Remover acesso
          </button>
        </div>
        <fieldset class="share-goals" :disabled="busy">
          <legend>Metas visíveis</legend>
          <label v-for="goal in goals" :key="goal.id" class="share-goal"
            ><input
              type="checkbox"
              :checked="link.goalIds.includes(goal.id)"
              @change="toggleGoal(link, goal.id, $event)"
            /><span
              >{{ goal.title }} <small>{{ categoryName(goal.category) }}</small></span
            ></label
          >
        </fieldset>
      </article>
    </div>

    <InlineAlert v-if="message" :message="message" :tone="messageIsInfo ? 'info' : 'error'" />
  </section>
</template>
