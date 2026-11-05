<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles } from '@lucide/vue'
import { supabase } from '../lib/data'
import InlineAlert from '../components/InlineAlert.vue'

// Shared with the app so a session error found at startup is shown here too.
const message = defineModel<string>('message', { required: true })
const email = ref(''),
  password = ref(''),
  signUp = ref(false),
  busy = ref(false),
  // The only non-error message here is the email confirmation hint.
  info = ref(false)

async function submit() {
  if (!supabase) return
  busy.value = true
  message.value = ''
  info.value = false
  try {
    if (signUp.value) {
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
    message.value = error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.'
  } finally {
    busy.value = false
  }
}
function switchMode() {
  signUp.value = !signUp.value
  message.value = ''
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
        {{ busy ? 'Aguarde...' : signUp ? 'Criar conta' : 'Entrar' }}</button
      ><button type="button" class="auth-switch" @click="switchMode">
        {{ signUp ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta' }}
      </button>
      <InlineAlert v-if="message" :message="message" :tone="info ? 'info' : 'error'" />
    </form>
  </main>
</template>
