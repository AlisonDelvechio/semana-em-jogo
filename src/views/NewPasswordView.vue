<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { KeyRound } from '@lucide/vue'
import { authErrorMessage } from '../lib/auth-messages'
import { supabase } from '../lib/data'
import InlineAlert from '../components/InlineAlert.vue'

// Shown after the person opens the recovery link from the email. Supabase has already
// signed them in with a short-lived session that allows changing the password.
const emit = defineEmits<{ done: []; skip: [] }>()
const password = ref(''),
  confirmation = ref(''),
  busy = ref(false),
  error = ref('')
const firstInput = ref<HTMLInputElement | null>(null)

async function submit() {
  if (!supabase) return
  error.value = ''
  if (password.value !== confirmation.value) {
    error.value = 'As senhas não coincidem.'
    return
  }
  busy.value = true
  try {
    const { error: updateError } = await supabase.auth.updateUser({ password: password.value })
    if (updateError) throw updateError
    emit('done')
  } catch (caught) {
    error.value = authErrorMessage(caught)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  await nextTick()
  firstInput.value?.focus()
})
</script>

<template>
  <main class="auth-layout">
    <div class="auth-intro">
      <span class="eyebrow">RECUPERAÇÃO DE ACESSO</span>
      <h1>Quase lá.<br /><em>Crie uma nova senha.</em></h1>
      <p>
        Depois de salvar, você continua conectado e pode usar a nova senha nos outros aparelhos.
      </p>
      <div class="decoration" aria-hidden="true"><KeyRound :size="96" :stroke-width="1" /></div>
    </div>
    <form class="auth-card" @submit.prevent="submit">
      <span class="eyebrow">NOVA SENHA</span>
      <h2>Criar nova senha</h2>
      <p>Use pelo menos 6 caracteres.</p>
      <label
        >Nova senha<input
          ref="firstInput"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="6"
          required
      /></label>
      <label
        >Repita a nova senha<input
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          minlength="6"
          required
      /></label>
      <button class="primary-button" :disabled="busy">
        {{ busy ? 'Salvando...' : 'Salvar nova senha' }}
      </button>
      <button type="button" class="auth-switch" :disabled="busy" @click="emit('skip')">
        Agora não
      </button>
      <InlineAlert v-if="error" :message="error" />
    </form>
  </main>
</template>
