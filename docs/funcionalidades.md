# Funcionalidades

Como cada parte do Semana em Jogo funciona. Instalação e publicação estão no [README](../README.md).

## Metas

- **Categorias:** Treino, Alimentação e Outro.
- **Dias fixos:** a meta aparece nos dias da semana selecionados.
- **Frequência semanal (Treino e Outro):** de 1 a 7 idas por semana, em dias livres. Marque os dias em que fez a atividade; o painel soma as presenças até o limite escolhido e conclui a meta ao atingir a frequência. No mês, cada semana é atribuída ao mês em que cai a sua segunda-feira.
- **Período:** opcionalmente, uma data inicial e uma duração de 1 a 365 dias. Para um checklist diário de 14 dias, selecione todos os dias da semana. Em metas de frequência, semanas parciais usam no máximo os dias disponíveis. Sem período, a data de criação impede que a meta apareça antes de existir.
- **Editar** fica ao lado de cada meta; **Pausar/Retomar** e **Excluir** ficam no menu **⋯**, longe de um toque acidental.
- **Pausar e retomar:** a meta pausada deixa de aparecer nos próximos dias e preserva os registros.
- **Excluir:** apaga a meta, suas conclusões e versões anteriores, como avisa a confirmação.

### Histórico de versões

Ao editar ou pausar uma meta, o plano anterior continua valendo até o dia anterior à alteração, inclusive em semanas passadas. Várias mudanças no mesmo dia afetam só o dia atual em diante. A edição grava a versão anterior e a nova configuração na mesma transação (`010_atomic_writes.sql`). Versões editadas antes da migração `002` não puderam ser reconstruídas.

### Editor de metas

A criação e a edição abrem em um modal, com cabeçalho e ações visíveis durante a rolagem. **Cancelar** descarta o rascunho. Editar uma meta existente pede confirmação, porque a nova configuração vale a partir de hoje.

- **Alimentação:** café da manhã, almoço, lanche da tarde e jantar aparecem por padrão e podem ser removidos, acrescentados ou reordenados (até 12, com nomes de até 40 caracteres).
- **Treino e Outro:** checklist opcional, sem itens predefinidos. Sem itens, a meta usa um check simples. Com itens, todos precisam ser marcados para concluir o dia.
- **Por dia da semana:** em metas de dias fixos, cada dia pode ter sua própria lista. A personalização abre em um modal; **Aplicar opções** leva a lista para o rascunho, que só é gravado ao salvar a meta. **Usar padrão** volta à lista geral.

## Registro do dia

Clique em uma data na semana ou no calendário para abrir o registro. Todas as metas da data são salvas juntas: ou tudo é gravado, ou nada (`save_day` em `010_atomic_writes.sql`).

- **Refeições:** um toque em **No plano**, **Livre** ou **Fora do plano** registra a refeição e a classificação; tocar de novo na opção escolhida desmarca. Registros antigos marcados sem classificação aparecem como "Registrada sem classificação". A descrição é opcional e o campo cresce enquanto você escreve.
- **Checklists:** cada item tem check e descrição opcional. Metas sem itens têm um check simples ("Meta concluída" ou "Fiz esta atividade hoje").
- **Itens só daquela data:** em **Editar itens** é possível adicionar, remover e reordenar itens; a ordem ajustada vale só para a data. Fora desse modo, os controles ficam ocultos.
- **Como funciona?:** as explicações de cada meta ficam recolhidas nesse link.
- **Observação do dia:** texto livre de até 500 caracteres.

Registros antigos com três refeições mantêm essa lista. Conclusões antigas sem detalhes continuam concluídas até que o dia seja detalhado.

### Refeições livres

Cada meta de alimentação permite de 0 a 84 refeições livres por semana (segunda a domingo). O limite é opcional: seguir o plano sem usar nenhuma também conclui a meta.

- A meta alimentar fica concluída quando todas as refeições do dia estão registradas e seguem o plano ou são livres dentro do limite.
- As livres são contadas por data e, no mesmo dia, pelo identificador estável da refeição; reordenar não muda quais excedem o limite. O excesso aparece no registro e não conta para a conclusão.
- O contador inclui as alterações ainda não salvas do dia aberto.
- Dias anteriores mantêm a regra da época. Para corrigir um dia passado, expanda **Corrigir limite deste dia**, use **Usar limite atual** ou informe outro valor e salve. A correção vale só para aquela data; **Restaurar limite histórico** a remove.
- Registros antigos mantêm a conclusão original, mas a aderência aparece como não informada até serem editados.

## Semana

- **Resumos:** Hoje, Semana e Mês, nessa ordem. **Hoje** mostra refeições contabilizadas, atividades do dia e idas restantes das metas semanais, com atalho para registrar a data atual.
- **Percentual:** o destaque considera só o que estava previsto até o dia exibido; o total da semana completa fica abaixo.
- **Cards dos dias:** cada meta mostra estado e contagem (refeições válidas, itens ou idas). Hoje tem destaque de fundo e borda.
- **Marcar direto:** em metas simples (treino ou Outro, sem checklist), o check do card marca e desmarca o dia na hora, sem abrir o registro. Metas com refeições ou itens abrem o registro do dia ao tocar no nome.
- **Refeições livres da semana:** resumo de uso por meta, antes dos cards.
- **Celular:** uma faixa com os sete dias escolhe qual card exibir; a semana atual abre no dia de hoje.

### Análise

Abaixo do plano, a análise alterna entre a semana exibida e seu mês.

- **Progresso por meta** preserva as unidades (refeições, dias ou idas), o histórico de versões e a atribuição das frequências ao mês da segunda-feira, sem contar datas futuras.
- **Resumo de padrões** usa só alimentação e separa válidas, fora do plano/excedentes, pendentes e sem classificação. O destaque de concentração usa contagens, informa empates e abre os registros e o dia original.

## Mês

O calendário mostra o progresso até hoje e o total planejado no mês. Círculos indicam o estado de cada dia: check para concluído, preenchimento proporcional para parcial e contorno para pendente, com legenda acessível. No desktop, cada data também mostra contagem, percentual e até duas metas. Selecionar uma data abre o resumo; **Editar dia** abre o registro sem empilhar modais.

## Como o progresso é calculado

- Refeições contam individualmente: quatro dentro do plano e uma fora resultam em 80%. Livres dentro do limite contam como certas; excedentes, fora do plano e pendentes não somam acertos.
- O denominador inclui as refeições previstas ou a lista salva para a data, inclusive as adicionadas no dia. Dias com quantidades diferentes são ponderados pela quantidade de refeições.
- Nas demais categorias, cada atividade e cada ida de meta semanal contam como uma unidade.
- "Até hoje" não inclui dias futuros; o plano completo inclui a semana ou o mês inteiro.

## Relatórios e backup

Em **Minhas metas → Relatórios e backups**, escolha tudo, um mês ou um intervalo de datas.

- **CSV:** uma linha por refeição ou item, com descrição, classificação e observação do dia. Usa `;` e UTF-8 para abrir em planilhas em português, e a data é gravada como texto para não virar `####` no Excel. A última coluna contém os dados técnicos para restauração. Textos que começam com `=`, `+`, `-` ou `@` são protegidos para não virar fórmulas.
- **PDF:** abre uma versão para impressão A4; escolha **Salvar como PDF** na janela de impressão. Usa o mesmo período e os mesmos registros do CSV, mas não serve como backup.
- **Restaurar:** em **Selecionar arquivo CSV**, escolha um CSV exportado pelo app, confira as metas reconhecidas e clique em **Importar registros**. O arquivo inteiro é validado antes; só metas e registros ausentes são adicionados, sem sobrescrever dados atuais, e uma segunda importação não cria duplicatas. Ao restaurar o backup em outra conta cujas metas ainda existem, cada meta recebe um ID novo e estável derivado do original.
- Quando o intervalo começa no meio da semana, a coluna técnica inclui também os registros alimentares desde a segunda-feira anterior, para preservar o uso do limite de refeições livres na restauração.
- CSVs antigos sem a coluna técnica continuam legíveis como relatório, mas não podem ser restaurados. A importação aceita tanto o formato antigo de 14 colunas (com pontos) quanto o atual de 12.

## Dados e sincronização

- **Leitura paginada:** o app busca todas as linhas de cada tabela, mesmo acima do limite por resposta do Supabase (1000 por padrão).
- **Gravações atômicas:** edição de meta e registro do dia usam as funções de `010_atomic_writes.sql`. Elas rodam com as permissões de quem chama, então o RLS continua valendo. Se o app for publicado antes da migração, ele volta a gravar etapa por etapa.
- **Voltar ao app:** ao voltar para a aba ou janela, os dados são recarregados em segundo plano (no máximo a cada 30 segundos e nunca com um modal de edição aberto), para que um dispositivo não sobrescreva o que outro salvou.
- **Virada do dia:** com o app aberto à meia-noite, "hoje", os resumos e a semana ou o mês exibidos avançam sozinhos, se você estava vendo o período atual.
- **Sessão:** a leitura inicial repete apenas a rejeição temporária "JWT issued at future", com esperas de 0,5 s, 1 s, 2 s e 4 s. Outras falhas e as gravações não são repetidas.
- **Modo local:** se os dados do navegador estiverem ilegíveis, uma cópia é guardada em `semana-em-jogo-v1-corrompido-<data>` antes de o app gravar novos dados, para recuperação manual.

## Interface e acessibilidade

- Tema claro e escuro, seguindo o sistema até você escolher um. A paleta em verde floresta (superfícies `#203128`, destaque sálvia `#b9dca4`, texto `#14201b` nos botões principais) está em `src/assets/identity.scss`.
- Modais com foco inicial, foco preso dentro do diálogo, fechamento por Escape e retorno ao controle de origem. Confirmações iniciam em **Cancelar**.
- Áreas de toque de pelo menos 44 px e checks de 22 px. Tarefas concluídas mostram check e "Concluída", também no nome acessível.
- No celular, a navegação fica fixa na base respeitando a área segura, os modais abrem como painéis a partir da base e cada troca de menu começa no topo. Em telas muito estreitas, o calendário rola internamente para preservar os alvos de toque.
- Mensagens de sucesso e erro podem ser fechadas e seguem o tema. Erros dentro de formulários aparecem em uma caixa com borda vermelha e ícone de alerta.
- Textos atendem ao contraste mínimo WCAG AA (4,5:1) nos dois temas. No tema claro, o texto secundário usa `--ui-muted` e o verde de destaque usa `--ui-accent-text`.
