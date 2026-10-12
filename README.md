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
2. No SQL Editor, execute o conteúdo dos arquivos `supabase/migrations/001_initial.sql` até `007_goal_period_and_adherence.sql`, na ordem numérica. Se as seis primeiras já foram executadas, execute **apenas `007_goal_period_and_adherence.sql` antes de publicar esta versão do app**. Digitar o nome do arquivo no editor não executa a migração.
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

As metas são recorrentes nos dias selecionados. Ao editar ou pausar uma meta, o plano anterior continua valendo até o dia anterior à alteração, inclusive para semanas passadas. Mudanças feitas várias vezes no mesmo dia só afetam o dia atual em diante. Excluir uma meta ainda apaga suas conclusões e versões anteriores, como avisa a confirmação. A primeira migração de dados existentes não consegue recuperar versões de metas editadas antes desta atualização. Sem período explícito, a data de criação impede que uma nova meta apareça antes de ser criada. Pontos são um incentivo visual e não representam gasto calórico ou orientação de treino.

O percentual em destaque considera apenas metas previstas até o dia exibido; o total da semana completa fica logo abaixo. Na criação de uma meta de alimentação, café da manhã, almoço, lanche da tarde e jantar aparecem por padrão e podem ser removidos ou ampliados. Você também pode personalizar as opções para cada dia da semana selecionado. Abra um dia no calendário para registrar a refeição, classificá-la e adicionar uma descrição opcional. Registros anteriores com três refeições mantêm essa lista própria, e conclusões antigas sem detalhes permanecem concluídas até que você detalhe o dia. A tabela `goal_day_details` guarda esses detalhes por usuário, meta e data, com políticas RLS. A migração não altera nem apaga conclusões anteriores.

Use **Semana** para acompanhar o checklist e **Mês** para ver o calendário completo, o progresso até hoje e o total planejado no mês. Clique em uma data em qualquer uma das duas visões para abrir o modal de edição. O usuário atual aparece em um cartão compacto no canto superior direito.

As refeições podem ser reordenadas com os botões de subir e descer. Em **Minhas metas**, a personalização de cada dia da semana abre em um modal: aplique as opções nele e depois salve a meta. No registro de uma data, a ordem ajustada é salva apenas para aquela data. A ordem e os identificadores das opções são mantidos sem uma nova migração do banco.

Em **Minhas metas → Exportar relatório CSV**, baixe um relatório de todas as ocorrências desde a criação das metas até o fim da semana atual, incluindo registros futuros já salvos. Cada refeição aparece em uma linha, com a descrição e a observação do dia; metas sem refeições também aparecem. O arquivo usa `;` e UTF-8 para abrir em planilhas em português. O relatório é gerado no navegador com os dados da conta carregados no momento e não altera o Supabase. Os campos de descrição das refeições crescem enquanto você escreve e ao reabrir o dia.

Metas de treino e da categoria Outro podem ter um checklist genérico, sem itens predefinidos. Cadastre os itens na meta, personalize por dia da semana ou adicione itens só no registro de uma data. Cada item pode receber um check e uma descrição opcional; todos devem estar marcados para concluir a meta naquele dia. Se não houver itens, permanece o check simples da meta. `005_generic_checklists.sql` adiciona campos vazios às tabelas existentes e preserva registros e conclusões anteriores. O CSV inclui esses itens e apresenta a data como texto no Excel para evitar `####` quando a coluna está estreita.

Treino e Outro também aceitam frequência semanal com dias livres (1 a 7 idas). Marque os dias em que realizou a atividade: o painel soma as presenças até o limite escolhido e credita os pontos uma única vez ao atingir a meta. Metas antigas permanecem em dias fixos. No mês, cada meta semanal é atribuída ao mês em que a segunda-feira da semana ocorre. `006_weekly_frequency.sql` adiciona os campos com valores padrão para manter os registros anteriores; execute antes de publicar o código.

Metas podem ter duração definida: escolha a data inicial e de 1 a 365 dias. Para um checklist diário de 14 dias, selecione todos os dias da semana. O período limita a exibição no calendário e no cálculo; em metas de frequência, semanas parciais usam no máximo a quantidade de dias disponíveis. Versões anteriores da meta preservam seu intervalo original. A migração `007_goal_period_and_adherence.sql` acrescenta apenas colunas, sem apagar dados.

Nas refeições, marcar que comeu registra o item. Um campo separado indica se a refeição seguiu o plano, ficou fora do plano ou ainda não foi classificada. A meta alimentar só ganha pontos com todas as refeições registradas e classificadas como dentro do plano. Registros antigos continuam com a conclusão histórica anterior, mas a aderência deles aparece como não informada até que sejam editados.

Em **Minhas metas**, escolha exportar tudo, um mês ou um intervalo de datas. O CSV legível inclui uma última coluna técnica com os IDs, versões e registros necessários para restauração. Para importar, selecione um CSV exportado pela versão atual, confira a quantidade de metas reconhecidas e clique em **Importar registros**. O app valida o arquivo inteiro e adiciona somente metas e registros ausentes, sem sobrescrever dados atuais; uma segunda importação não cria duplicatas. Arquivos antigos, sem a coluna técnica, continuam servindo como relatório, mas não podem ser restaurados com segurança.

No celular, a navegação entre Semana, Mês e Metas fica visível logo abaixo do cabeçalho enquanto você rola. O progresso da semana aparece em um cartão compacto antes do checklist; na semana atual, o dia de hoje vem primeiro. Pontos e quantidade de metas aparecem abaixo dos dias. Os modais de edição abrem como painéis a partir da base da tela. Os campos e controles usam tamanhos adequados para toque. Ao trocar de menu, a nova tela começa no topo.
