# Semana em Jogo

Um checklist semanal para metas de treino e alimentação, com acompanhamento do progresso. Feito com Vue 3, TypeScript, Vite e SCSS.

## Rodar agora

Requer Node.js 22.18+ ou 24.12+ e NPM.

```bash
npm install
npm run dev
```

Sem variáveis de ambiente, o app funciona em **modo local**. Os dados ficam apenas no navegador atual. Você pode experimentar as metas e o checklist imediatamente. Configure o Supabase antes de usar de verdade em vários dispositivos: os dados locais não são migrados automaticamente para a conta.

## Ativar sincronização

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No SQL Editor, execute o conteúdo dos arquivos `supabase/migrations/001_initial.sql` até `009_day_free_meal_limit.sql`, na ordem numérica. Se as oito primeiras já foram executadas, execute **apenas `009_day_free_meal_limit.sql` antes de publicar esta versão do app**. Digitar o nome do arquivo no editor não executa a migração.
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

Treino e Outro também aceitam frequência semanal com dias livres (1 a 7 idas). Marque os dias em que realizou a atividade: o painel soma as presenças até o limite escolhido e conclui a meta ao atingir a frequência. Metas antigas permanecem em dias fixos. No mês, cada meta semanal é atribuída ao mês em que a segunda-feira da semana ocorre. `006_weekly_frequency.sql` adiciona os campos com valores padrão para manter os registros anteriores; execute antes de publicar o código.

Metas podem ter duração definida: escolha a data inicial e de 1 a 365 dias. Para um checklist diário de 14 dias, selecione todos os dias da semana. O período limita a exibição no calendário e no cálculo; em metas de frequência, semanas parciais usam no máximo a quantidade de dias disponíveis. Versões anteriores da meta preservam seu intervalo original. A migração `007_goal_period_and_adherence.sql` acrescenta apenas colunas, sem apagar dados.

Nas refeições, marcar que comeu registra o item. Um campo separado indica se a refeição seguiu o plano, foi uma refeição livre, ficou fora do plano ou ainda não foi classificada. Cada meta de alimentação permite configurar de 0 a 84 refeições livres por semana (segunda a domingo). Essa quantidade é um limite opcional: seguir o plano sem usar nenhuma também conclui a meta. A meta alimentar fica concluída quando todas as refeições do dia estão registradas e seguem o plano ou são livres dentro do limite. As livres são contadas por data e, no mesmo dia, pelo identificador estável da refeição; reordenar opções não muda quais excedem o limite. O excesso aparece no registro e não conta para concluir a meta. O contador considera também os rascunhos do dia antes de salvar. O CSV diferencia livres permitidas, livres excedentes e refeições fora do plano; exportação/importação preservam o limite e a classificação. Quando um intervalo começa no meio da semana, a coluna técnica também inclui os registros alimentares desde a segunda-feira anterior para preservar o uso do limite na restauração; as linhas visíveis do relatório continuam restritas ao intervalo escolhido. `008_free_meals.sql` apenas adiciona o limite na meta e em seu histórico, com padrão zero para metas existentes. Configure o limite editando a meta; dias anteriores preservam sua regra histórica e não são reclassificados automaticamente. Registros antigos continuam com a conclusão histórica anterior, mas a aderência deles aparece como não informada até que sejam editados.

Em **Minhas metas**, escolha exportar tudo, um mês ou um intervalo de datas. O CSV legível inclui uma última coluna técnica com os IDs, versões e registros necessários para restauração. Para importar, selecione um CSV exportado pela versão atual, confira a quantidade de metas reconhecidas e clique em **Importar registros**. O app valida o arquivo inteiro e adiciona somente metas e registros ausentes, sem sobrescrever dados atuais; uma segunda importação não cria duplicatas. Arquivos antigos, sem a coluna técnica, continuam servindo como relatório, mas não podem ser restaurados com segurança.

No celular, a navegação entre Semana, Mês e Metas fica fixa na base, respeitando a área segura. Os resumos de progresso aparecem antes do checklist. Uma faixa com sete dias permite escolher qual card ver; a semana atual inicia no dia de hoje. O topo mostra o progresso da semana e do mês em cards separados. Os modais de edição abrem como painéis a partir da base da tela. Os campos e controles usam tamanhos adequados para toque. Ao trocar de menu, a nova tela começa no topo.

Para corrigir um limite antigo, abra o registro do dia passado e expanda **Corrigir limite deste dia**. Use o botão **Usar limite atual** ou informe outro valor e salve o registro. A correção fica em `goal_day_details.free_meals_limit_override` e vale somente para aquela data; o consumo continua somando as refeições livres da semana inteira. **Restaurar limite histórico** remove a correção ao salvar. Abrir ou cancelar o modal não muda dados; editar o cadastro da meta continua preservando o histórico. CSV e restauração preservam a correção. A migração `009_day_free_meal_limit.sql` apenas acrescenta uma coluna opcional, sem apagar ou reclassificar os registros existentes.

O percentual semanal e mensal agora soma as refeições individualmente: quatro refeições dentro do plano e uma fora resultam em 80%. Refeições livres dentro do limite contam como certas; excedentes, fora do plano e itens pendentes não somam acertos. O denominador inclui as refeições previstas (ou a lista salva para a data), inclusive as adicionadas no dia. Dias com quantidades diferentes são ponderados pela quantidade de refeições, sem média simples dos percentuais diários. No indicador geral, cada atividade de outra categoria e cada ida da meta semanal conta como uma unidade. O progresso até hoje não inclui dias futuros; o plano completo inclui a semana inteira. A conclusão da meta continua exigindo todos os itens válidos. Os registros antigos mantêm sua interpretação original até serem classificados explicitamente. Nenhuma nova categoria, coluna ou migração é necessária.

Exclusão, pausa/retomada e edição de metas usam confirmações no estilo do app, com suporte a teclado, Escape, foco inicial em Cancelar e retorno ao controle de origem. As mensagens de sucesso e erro podem ser fechadas e seguem o tema claro/escuro. Cancelar não grava alterações.


A criação e a edição de metas abrem em modal, com cabeçalho e ações visíveis durante a rolagem. Cancelar descarta o rascunho. A tela Minhas metas prioriza a lista; relatórios e backup ficam sempre visíveis em uma seção própria. No celular, o modal usa a altura disponível, respeita a área segura e mantém campos com tamanho adequado para toque.

O sistema de pontos foi removido da interface, dos cálculos e das colunas legíveis do CSV. Os campos legados no banco e na coluna técnica do backup são preservados, sem migração destrutiva. A importação aceita tanto o CSV antigo de 14 colunas quanto o novo de 12, encontrando a coluna de restauração pelo nome. A paleta escura original (#151d19) foi restaurada pela correção do escopo CSS das mensagens e confirmações; a cor de erro agora só afeta o componente correspondente.


Na edição de metas, nome e categoria compartilham a primeira linha no desktop e ficam empilhados no celular. Checks de 22px, áreas de toque de pelo menos 44px e ações com ícone e texto facilitam a interação. O botão Salvar usa um ícone de confirmação, sem seta de link externo. O fundo do editor usa uma sobreposição escura com desfoque para reduzir a distração.


A identidade dos componentes segue a referência aprovada em verde floresta, com superfícies #203128, destaque sálvia #b9dca4 e texto escuro #14201b nos botões principais. As regras estão em `src/assets/identity.scss`, com tokens para os temas claro e escuro. O fundo escuro anterior da página foi preservado. Inter e Plus Jakarta Sans usam fontes alternativas do sistema caso não carreguem.

A navegação mobile fica na base com espaço reservado no conteúdo e nas notificações. Tarefas concluídas mantêm o texto sem risco e indicam check + “Concluída”, incluindo o nome acessível. Selects continuam nativos, com setas decorativas alinhadas; reordenação e remoção usam controles de 44px. A frequência semanal tem um controle −/+ de 1 a 7, com entrada direta por teclado. Em telas muito estreitas, o calendário permite rolagem interna para preservar os alvos de 44px. Datas, percentuais e opções continuam vindos do código e dos registros reais, sem copiar os exemplos das imagens.


O calendário usa círculos com check para conclusão, preenchimento proporcional para progresso parcial e contorno para pendência, com legenda e descrição acessível. Selecionar uma data mostra o resumo abaixo; **Editar dia** abre o registro. No desktop, os cards da semana têm alturas iguais e os botões alinhados na base. No celular, o rodapé decorativo foi retirado e o card do dia selecionado concentra as tarefas.

No desktop, cada data do calendário também mostra contagem, percentual e até duas metas, com indicação de outras metas existentes. O formato compacto do calendário mobile foi preservado. Os cards semanais usam um marcador de estado e contagens junto ao título, com destaque de fundo e borda para hoje. Refeições livres voltaram para antes dos cards. Na edição, tipo e frequência ficam na mesma linha no desktop; período é uma opção compacta que revela início e duração quando ativada. Os controles continuam empilhados no celular.


O painel semanal inclui **Hoje**, com refeições contabilizadas, atividades fixas do dia e idas restantes nas metas semanais, além de atalho para registrar a data atual. A análise abaixo do plano permite alternar entre a semana exibida e seu mês de referência. **Progresso por meta** preserva as unidades (refeições, dias ou idas), o histórico e a atribuição das frequências ao mês da segunda-feira, excluindo datas futuras. **Resumo de padrões** usa somente alimentação e separa válidas, fora/excedentes, pendentes e sem classificação. Registros legados mantêm seu percentual original, mas a análise não infere aderência não informada. O destaque de concentração usa contagens, informa empates e permite conferir os registros e anotações, abrindo o dia original. Nada disso exige migração ou serviço externo.


A ordem dos resumos é Hoje, Semana e Mês. Ver registros e selecionar uma data no calendário abrem modais com fechamento por Escape, foco controlado e fundo inativo. Ao seguir para a edição do dia, o resumo fecha antes de abrir o editor, sem empilhar modais. Relatórios e backups têm áreas separadas: CSV para relatório/restauração e **Salvar PDF** para abrir uma versão de impressão A4 no navegador. Escolha **Salvar como PDF** na janela de impressão. O PDF usa o mesmo período e os mesmos registros do CSV, inclui anotações e classificações, omite os dados técnicos de restauração e não serve como backup.


A leitura inicial trata especificamente a rejeição temporária “JWT issued at future”, repetindo somente consultas com esperas de 0,5s, 1s, 2s e 4s. Outras falhas e gravações não são repetidas. Se persistir, a mensagem orienta tentar novamente e preserva a causa original. A validação de JWT e as regras do banco não foram alteradas. Eventos de autenticação agendam a leitura fora do callback, ignoram respostas antigas após troca de sessão/saída e cancelam a assinatura ao desmontar a tela. Os hovers dos controles usam pares de fundo/texto do tema e preservam os estados desabilitados.
