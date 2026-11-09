<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Sparkles } from '@lucide/vue'
import { authErrorMessage } from '../lib/auth-messages'
import { supabase } from '../lib/data'
import InlineAlert from '../components/InlineAlert.vue'

// Shared with the app so a session error found at startup is shown here too.
const message = defineModel<string>('message', { required: true })
const mode = ref<'signin' | 'signup' | 'reset'>('signin')
const email = ref(''),
  password = ref(''),
  busy = ref(false),
  // Confirmation hints are information, everything else is an error.
  info = ref(false)
const emailInput = ref<HTMLInputElement | null>(null)

const titles = {
  signin: 'Boas-vindas de volta',
  signup: 'Crie sua conta',
  reset: 'Recuperar senha',
}
const submitLabel = computed(() =>
  busy.value
    ? 'Aguarde...'
    : { signin: 'Entrar', signup: 'Criar conta', reset: 'Enviar link' }[mode.value],
)

async function submit() {
  if (!supabase) return
  busy.value = true
  message.value = ''
  info.value = false
  try {
    if (mode.value === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
        redirectTo: `${window.location.origin}/`,
      })
      if (error) throw error
      // Same answer whether or not the account exists, so emails cannot be probed.
      message.value =
        'Se houver uma conta com este email, enviamos um link para criar uma nova senha. Confira também a caixa de spam.'
      info.value = true
    } else if (mode.value === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      if (!data.session) {
        message.value = 'Confira seu email para confirmar a conta.'
        info.value = true
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
    }
  } catch (error) {
    message.value = authErrorMessage(error)
  } finally {
    busy.value = false
  }
}
async function setMode(next: typeof mode.value) {
  mode.value = next
  message.value = ''
  await nextTick()
  emailInput.value?.focus()
}
</script>

<template>
  <main class="auth-layout">
    <div class="auth-intro">
      <span class="eyebrow">SEU RITMO, SUA SEMANA</span>
      <h1>Pequenos passos.<br /><em>Grandes semanas.</em></h1>
      <p>
        Organize seus treinos e hábitos de alimentação em um checklist simples. Cada conquista
        merece ser vista.
      </p>
      <div class="decoration" aria-hidden="true"><Sparkles :size="96" :stroke-width="1" /></div>
    </div>
    <form class="auth-card" @submit.prevent="submit">
      <span class="eyebrow">COMECE POR AQUI</span>
      <h2>{{ titles[mode] }}</h2>
      <p v-if="mode === 'reset'">
        Informe o email da sua conta. Enviaremos um link para você criar uma nova senha.
      </p>
      <p v-else>Seu progresso acompanha você em qualquer dispositivo.</p>
      <label
        >Email<input
          ref="emailInput"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          placeholder="voce@exemplo.com"
      /></label>
      <label v-if="mode !== 'reset'"
        >Senha<input
          v-model="password"
          type="password"
          :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
          minlength="6"
          required
          placeholder="No mínimo 6 caracteres"
      /></label>
      <button
        v-if="mode === 'signin'"
        type="button"
        class="auth-switch auth-forgot"
        @click="setMode('reset')"
      >
        Esqueci minha senha
      </button>
      <button class="primary-button" :disabled="busy">{{ submitLabel }}</button>
      <button v-if="mode === 'reset'" type="button" class="auth-switch" @click="setMode('signin')">
        Voltar para entrar
      </button>
      <button
        v-else
        type="button"
        class="auth-switch"
        @click="setMode(mode === 'signup' ? 'signin' : 'signup')"
      >
        {{ mode === 'signup' ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta' }}
      </button>
      <InlineAlert v-if="message" :message="message" :tone="info ? 'info' : 'error'" />
    </form>
  </main>
</template>
