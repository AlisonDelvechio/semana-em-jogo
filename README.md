# Semana em Jogo

Checklist semanal para metas de treino, alimentação e outros hábitos, com registro diário, calendário mensal, análise de progresso, relatórios (CSV e PDF) e backup. Feito com Vue 3, TypeScript, Vite e SCSS, com sincronização opcional pelo Supabase.

O funcionamento detalhado de cada recurso está em [`docs/funcionalidades.md`](docs/funcionalidades.md).

## Rodar localmente

Requer Node.js 22.18+ ou 24.12+ e npm.

```bash
npm install
npm run dev
```

Sem variáveis de ambiente, o app funciona em **modo local**: os dados ficam apenas neste navegador. Isso basta para experimentar. Para usar em vários dispositivos, configure o Supabase antes, porque os dados locais não são migrados para a conta.

## Ativar sincronização (Supabase)

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No **SQL Editor**, cole e execute o conteúdo de cada arquivo de `supabase/migrations/`, em ordem numérica (`001` a `011`). Digitar o nome do arquivo no editor não executa a migração. Em um projeto existente, execute só as que faltam, **antes** de publicar a versão do app que depende delas.
3. Em **Authentication**, ative o provedor Email. Se a confirmação por email estiver ativa, confirme a conta pelo link recebido.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública (publishable/anon) do projeto. **Nunca** use a chave secret/service role no navegador.
5. Reinicie `npm run dev`, crie uma conta e entre.

| Migração                            | O que faz                                                                |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `001_initial.sql`                   | Metas e conclusões, com RLS por usuário                                  |
| `002_goal_history.sql`              | Versões anteriores das metas                                             |
| `003_goal_day_details.sql`          | Registro detalhado de cada dia                                           |
| `004_custom_meal_options.sql`       | Refeições personalizadas, inclusive por dia da semana                    |
| `005_generic_checklists.sql`        | Checklist para metas de treino e Outro                                   |
| `006_weekly_frequency.sql`          | Frequência semanal com dias livres                                       |
| `007_goal_period_and_adherence.sql` | Período da meta e aderência das refeições                                |
| `008_free_meals.sql`                | Limite semanal de refeições livres                                       |
| `009_day_free_meal_limit.sql`       | Correção do limite em um dia específico                                  |
| `010_atomic_writes.sql`             | Funções que gravam a edição da meta e o registro do dia em uma transação |
| `011_day_conflicts.sql`             | Impede que um dispositivo sobrescreva um dia salvo por outro             |

Todas as migrações só acrescentam colunas, tabelas, funções ou gatilhos; nenhuma apaga ou reclassifica dados existentes.

## Publicar na Netlify

1. Em **Add new project → Import an existing project → GitHub**, selecione `AlisonDelvechio/semana-em-jogo` com `main` como branch de produção. O `netlify.toml` já define o build (`npm run build`, pasta `dist`) e `public/_redirects` cobre as rotas da SPA.
2. Em **Environment variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores públicos do `.env.local`. Elas entram no JavaScript durante o build: sem elas, o site abre em modo local.
3. Depois do primeiro deploy, configure a URL `https://<seu-site>.netlify.app` em **Supabase → Authentication → URL Configuration** como Site URL. Mantenha o endereço local como Redirect URL se usa confirmação por email no desenvolvimento.

Novos commits em `main` geram novos deploys sem afetar as tabelas do Supabase.

O `netlify.toml` também envia cabeçalhos de segurança, incluindo uma Content-Security-Policy que só permite scripts do próprio site e conexões com `*.supabase.co` e o Google Fonts. Se o projeto Supabase usar um **domínio personalizado**, acrescente-o a `connect-src`. Não coloque scripts inline no `index.html`: use um arquivo em `public/`, como `public/theme-init.js`.

## Verificações

```bash
npm run type-check
```

```bash
npm run test:unit -- --run
```

```bash
npm run lint
```

```bash
npm run build
```

Os testes também executam todas as migrações num Postgres real em memória (PGlite), sem precisar de conta no Supabase.

O workflow `.github/workflows/ci.yml` executa lint, testes, type-check e build em cada pull request e em cada push na `main`.

## Estrutura

```
src/
  TrackerApp.vue      Casca do app: dados carregados, sessão, navegação e gravações
  views/              Telas: AuthView, WeekView, MonthView, GoalsView
  components/         Diálogos (DayDialog, GoalEditorDialog, WeekdayOptionsDialog,
                      ConfirmDialog, FormDialog) e blocos (TodayCard, InsightsPanel,
                      ReportsPanel, ProgressCard, AppNotice, NumberStepper)
  composables/        useTheme (tema claro/escuro)
  lib/                Regras sem interface, cobertas por testes:
    data.ts           Leitura e gravação (Supabase ou localStorage)
    dates.ts          Agenda, versões das metas, conclusão e progresso
    goals.ts          Validação e cópia de metas do editor
    month.ts, insights.ts, meals.ts, report.ts, backup.ts, print-report.ts
    today.ts          Data atual reativa (vira à meia-noite)
  assets/             main.scss (base), identity.scss (paleta e componentes),
                      insights.scss (análise)
supabase/migrations/  Esquema do banco, em ordem de aplicação
public/               Arquivos servidos como estão (_redirects, ícone, theme-init.js)
```

Os campos `points` das metas são legados: continuam no banco e no backup por compatibilidade, mas não aparecem na interface nem entram nos cálculos.
