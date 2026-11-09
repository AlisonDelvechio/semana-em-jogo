// Supabase Auth answers in English. Translate the messages people actually run into;
// anything else is shown as received so no information is lost.
const messages: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu email pelo link que enviamos antes de entrar.'],
  [/user already registered/i, 'Já existe uma conta com este email. Entre ou recupere a senha.'],
  [/should be different from the old password/i, 'A nova senha precisa ser diferente da anterior.'],
  [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [
    /(weak|pwned|leaked|compromised).*password|password.*(weak|pwned|leaked)/i,
    'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.',
  ],
  [
    /rate limit|only request this after|too many requests/i,
    'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  ],
  [
    /(link|token|otp).*(expired|invalid)|expired.*link/i,
    'O link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.',
  ],
  [/auth session missing/i, 'Sua sessão expirou. Peça um novo link em “Esqueci minha senha”.'],
]

export function authErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!text) return 'Algo deu errado. Tente novamente.'
  return messages.find(([pattern]) => pattern.test(text))?.[1] ?? text
}
