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
2. No SQL Editor, execute o conteúdo dos arquivos `supabase/migrations/001_initial.sql`, `002_goal_history.sql`, `003_goal_day_details.sql`, `004_custom_meal_options.sql` e `005_generic_checklists.sql`, nessa ordem. Se as quatro primeiras já foram executadas, execute **apenas `005_generic_checklists.sql` antes de publicar esta versão do app**. Digitar o nome do arquivo no editor não executa a migração.
3. Em Authentication, configure o provedor Email. Se a confirmação por email estiver ativa, confirme a conta pelo link enviado.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública (publishable/anon) do projeto. Nunca use a chave secret/service role no navegador.
5. Reinicie `npm run dev`, crie uma conta e entre.

## Publicar na Netlify

Na Netlify, escolha **Add new project → Import an existing project → GitHub** e selecione `AlisonDelvechio/semana-em-jogo`, com `main` como branch de produção. O repositório já inclui `netlify.toml` com `npm run build` e publicação de `dist`; `public/_redirects` cobre as rotas da SPA.

Antes do deploy, em **Environment variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores públicos usados em `.env.local`. São variáveis incorporadas ao JavaScript durante o build: sem elas, o site abre em modo local e não compartilha dados com a conta. Não use a chave secret/service role. Depois de receber a URL `https://<seu-site>.netlify.app`, configure-a em **Supabase → Authentication → URL Configuration** como Site URL (e mantenha o endereço local como Redirect URL se usa confirmação por email no desenvolvimento). Novos commits em `main` iniciam novos deploys sem apagar as tabelas do Supabase.

## Verificações

```bash
npm run type-check
npm run test:unit -- --run
npm run lint
npm run build
```

As metas são recorrentes nos dias selecionados. Ao editar ou pausar uma meta, o plano anterior continua valendo até o dia anterior à alteração, inclusive para semanas passadas. Mudanças feitas várias vezes no mesmo dia só afetam o dia atual em diante. Excluir uma meta ainda apaga suas conclusões e versões anteriores, como avisa a confirmação. A primeira migração de dados existentes não consegue recuperar versões de metas editadas antes desta atualização. A data de criação impede que uma nova meta apareça em dias anteriores à sua criação. Pontos são um incentivo visual e não representam gasto calórico ou orientação de treino.

O percentual em destaque considera apenas metas previstas até o dia exibido; o total da semana completa fica logo abaixo. Na criação de uma meta de alimentação, café da manhã, almoço, lanche da tarde e jantar aparecem por padrão e podem ser removidos ou ampliados. Você também pode personalizar as opções para cada dia da semana selecionado. Abra um dia no calendário para alterar só as refeições daquela data, marcar cada uma e adicionar descrições opcionais. Todas as opções desse dia marcadas concluem a meta. Registros anteriores com três refeições mantêm essa lista própria, e conclusões antigas sem detalhes permanecem concluídas até que você detalhe o dia. A tabela `goal_day_details` guarda esses detalhes por usuário, meta e data, com políticas RLS. A migração não altera nem apaga conclusões anteriores.

Use **Semana** para acompanhar o checklist e **Mês** para ver o calendário completo, o progresso até hoje e o total planejado no mês. Clique em uma data em qualquer uma das duas visões para abrir o modal de edição. O usuário atual aparece em um cartão compacto no canto superior direito.

As refeições podem ser reordenadas com os botões de subir e descer. Em **Minhas metas**, a personalização de cada dia da semana abre em um modal: aplique as opções nele e depois salve a meta. No registro de uma data, a ordem ajustada é salva apenas para aquela data. A ordem e os identificadores das opções são mantidos sem uma nova migração do banco.

Em **Minhas metas → Exportar relatório CSV**, baixe um relatório de todas as ocorrências desde a criação das metas até o fim da semana atual, incluindo registros futuros já salvos. Cada refeição aparece em uma linha, com a descrição e a observação do dia; metas sem refeições também aparecem. O arquivo usa `;` e UTF-8 para abrir em planilhas em português. O relatório é gerado no navegador com os dados da conta carregados no momento e não altera o Supabase. Os campos de descrição das refeições crescem enquanto você escreve e ao reabrir o dia.

Metas de treino e da categoria Outro podem ter um checklist genérico, sem itens predefinidos. Cadastre os itens na meta, personalize por dia da semana ou adicione itens só no registro de uma data. Cada item pode receber um check e uma descrição opcional; todos devem estar marcados para concluir a meta naquele dia. Se não houver itens, permanece o check simples da meta. `005_generic_checklists.sql` adiciona campos vazios às tabelas existentes e preserva registros e conclusões anteriores. O CSV inclui esses itens e apresenta a data como texto no Excel para evitar `####` quando a coluna está estreita.

No celular, a navegação entre Semana, Mês e Metas fica visível logo abaixo do cabeçalho enquanto você rola. O progresso da semana aparece em um cartão compacto antes do checklist; na semana atual, o dia de hoje vem primeiro. Pontos e quantidade de metas aparecem abaixo dos dias. Os modais de edição abrem como painéis a partir da base da tela. Os campos e controles usam tamanhos adequados para toque. Ao trocar de menu, a nova tela começa no topo.
