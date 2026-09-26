# Semana em Jogo

Um checklist semanal para metas de treino e alimentação, com pontos e acompanhamento do progresso. Feito com Vue 3, TypeScript, Vite e SCSS.

## Rodar agora

Requer Node.js 22.18+ ou 24.12+ e NPM.

```bash
npm install
npm run dev
```

Sem variáveis de ambiente, o app funciona em **modo local**. Os dados ficam apenas no navegador atual. Você pode experimentar as metas e o checklist imediatamente. Configure o Supabase antes de usar de verdade em vários dispositivos: os dados locais não são migrados automaticamente para a conta.

## Ativar sincronização

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. Execute `supabase/migrations/001_initial.sql` no SQL Editor do projeto.
3. Em Authentication, configure o provedor Email. Se a confirmação por email estiver ativa, confirme a conta pelo link enviado.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública (publishable/anon) do projeto. Nunca use a chave secret/service role no navegador.
5. Reinicie `npm run dev`, crie uma conta e entre.

## Publicar na Netlify

Conecte o repositório à Netlify, defina as mesmas variáveis de ambiente públicas e publique. `netlify.toml` define `npm run build` e `dist`; `public/_redirects` cobre rotas da SPA. Cadastre a URL final nas configurações de URL do Supabase Auth para os links de confirmação. A publicação precisa de suas contas e credenciais, por isso não foi feita automaticamente.

## Verificações

```bash
npm run type-check
npm run test:unit -- --run
npm run lint
npm run build
```

As metas são recorrentes nos dias selecionados. O progresso semanal é calculado a partir do plano **atual**: editar, pausar ou excluir uma meta pode alterar os percentuais de semanas antigas; excluir também apaga suas conclusões. A data de criação impede que uma nova meta apareça em dias anteriores à sua criação. Pontos são um incentivo visual e não representam gasto calórico ou orientação de treino.
