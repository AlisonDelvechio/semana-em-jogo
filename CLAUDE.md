# Semana em Jogo

App de metas semanais (alimentação, treinos, checklists) com acompanhamento por profissional (nutricionista), que só lê os dados.

Stack: Vue 3 (`<script setup>` + TS), Vite, SCSS, Vitest (jsdom), Supabase (Postgres + RLS + RPC), Netlify.

## Comandos

- Instalar: `npm ci`. Se for mudar dependências, use `npx npm@11 install ...`, porque o npm 10 quebra o lockfile.
- Verificação padrão, depois de qualquer mudança: `npm run lint && npm run type-check && npx vitest --run`
- Build: `npm run build`
- Um teste só: `npx vitest --run src/lib/overview.spec.ts`

## Mapa

- `src/TrackerApp.vue`: casca do app (abas, auth, estado global).
- `src/views/`: telas.
  - Semana, Mês e Metas.
  - Pacientes: lista → `OverviewView` → detalhes.
  - `SummaryView`: relatório da consulta.
- `src/components/`: diálogos e painéis.
- `src/lib/`: lógica pura com testes ao lado (`*.spec.ts`).
  - `data.ts`: Supabase.
  - `dates.ts`, `insights.ts`.
  - `summary.ts`: relatório.
  - `overview.ts`: visão geral, com as regras no objeto `RULES`.
- `src/assets/identity.scss`: tokens de cor e estilos novos. Os arquivos `identity.scss` e `main.scss` são grandes, então use `grep` para achar o trecho antes de ler.
- `supabase/migrations/NNN_*.sql`: schema. Os testes delas, com PGlite, ficam em `src/migrations.spec.ts`.
- `docs/funcionalidades.md`: descrição das funcionalidades. Atualize quando mudar um comportamento.

## Regras

- Interface, textos, commits e PRs em português.
- Migrations são aditivas e numeradas.
  - Nunca edite uma migration já aplicada: crie a próxima (`014_...`).
  - Toda migration nova ganha teste em `src/migrations.spec.ts` e uma linha na tabela do README.
  - Só aplique em produção no Supabase (projeto `xeteuvtbabyuvfoykffq`) com confirmação explícita.
- CSP rígida (`netlify.toml`, `script-src 'self'`): nada de script ou handler inline, nem no popup de impressão.
- Cores só via tokens de `identity.scss` (`--ui-*`, `--chart-*`), com contraste AA nos temas claro e escuro.
- Semanas pertencem ao mês da sua segunda-feira. Para a data de hoje, use `currentDate()` de `lib/today.ts`.
- O profissional é só leitura. Toda query filtra por `user_id`, e o RLS garante o resto.
- Sem force-push. PR só quando pedido.

## Verificação

- Padrão: lint, tipos e testes.
- Navegador (Playwright) e screenshots: só quando pedido ou em mudança grande de UI.
- Ao testar a UI, confira se não há rolagem horizontal entre 320 e 1280 px.
