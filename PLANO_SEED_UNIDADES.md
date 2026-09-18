# Plano: seed previsível e inicialização explícita das fábricas

Status: implementação concluída; nenhuma execução em banco de destino foi realizada.

## Diagnóstico confirmado no código

O seed atual (`backend/prisma/seed.ts`):

- Faz upsert das seis fábricas oficiais, redefinindo nome e `active: true` em registros existentes.
- Usa as categorias e origens atuais de SEST como fonte de configuração.
- Copia registros ausentes por nome para todas as outras fábricas, inclusive inativas.
- Preserva registros homônimos, mesmo com setor, unidade padrão ou bloqueio diferentes.
- Pode recriar configurações apagadas e distribuir configurações novas em execuções posteriores.
- Pode distribuir categorias e origens de desenvolvimento `TESTE-SEST-*`, criadas pelo fixture funcional.
- Não usa uma transação para a operação completa e não registra as criações no histórico de configuração.
- Não possui testes específicos de seu contrato.

A execução está configurada em `backend/prisma.config.ts` e também no campo
`prisma.seed` de `backend/package.json`. Não foi encontrada chamada ao seed no
servidor ou no comando de deploy versionado no repositório. Isso não comprova
como os procedimentos externos de operação o executam.

Migrations históricas também provisionaram configurações: a de padrões comuns
adicionou origens às fábricas existentes e a de Ivoti copiou configurações de SEST.
Alterar o seed não desfaz essas operações, nem permite identificar a origem de
cada configuração existente. As migrations aplicadas serão preservadas.

## Comportamento definido pelo usuário

O catálogo inicial não provisionará `CONSUMO` como setor. “Consumo” permanece permitido como nome de origem/motivo, conforme a definição específica do catálogo de origens.

Nova fábrica deve receber um conjunto fixo de configurações padrão, independente
de SEST ou de qualquer outra fábrica. Esses padrões serão versionados no backend.
Uma alteração das configurações de SEST não poderá influenciar o provisionamento.

O preenchimento ocorrerá na criação da fábrica, em uma única transação.
Fábricas existentes manterão nomes, flags, personalizações e exclusões. Alterar o
catálogo no código não atualizará retroativamente fábricas já cadastradas.
Não haverá sincronização automática ou ferramenta de cópia entre fábricas neste plano.

## Etapa 1: definir o catálogo fixo de configurações iniciais

1. Criar um arquivo de dados versionado no backend, contendo as categorias e
   origens iniciais e seus campos de negócio: nome, setor, unidade padrão e bloqueio.
2. Definir o conteúdo com revisão explícita antes de implementar a inicialização.
   Não extrair o catálogo automaticamente do banco ou das configurações de SEST.
3. Usar as origens aprovadas para o catálogo inicial: Consumo; Devolução;
   Dublagem; Erro de Enfesto; Ganho no Rolo; Outros; Retalho; Sobra de Requisição.
4. A lista de categorias e os setores de cada origem ainda precisam ser definidos.
   Não assumir que nomes das categorias representam necessariamente um setor.
5. Normalizar os nomes segundo os cadastros atuais, validar unicidade por nome,
   setores e códigos canônicos de unidade, e exigir unidade em categoria bloqueada.
   Categorias de setores de peças devem respeitar sua regra de quantidades inteiras.
6. Não incluir configurações do fixture funcional ou dados operacionais no catálogo.

Por padrão, o catálogo cobrirá categorias e origens. Prateleiras e vínculos físicos
continuarão sendo cadastrados por fábrica, pois dependem do layout local.
Estoque, movimentações operacionais, requisições, usuários e permissões não serão
pré-carregados. O módulo de requisições seguirá habilitado inicialmente, como no modelo atual.

Não introduzir tabela de templates, dependência nova ou número de versão no banco.
O histórico Git do arquivo de dados basta para versionar os padrões neste escopo.

## Etapa 2: separar criação de fábrica de manutenção de fábrica existente

1. Manter o ponto de entrada atual do Prisma e a lista de fábricas oficiais.
2. Remover toda leitura de configurações de SEST e todos os loops de replicação.
3. No seed, identificar fábricas oficiais ausentes e criar somente essas fábricas,
   já acompanhadas das categorias/origens do catálogo fixo.
4. Quando a fábrica já existir, não executar atualização ou preenchimento de
   configurações, mesmo se alguma estiver ausente. Preservar nome, estado ativo,
   módulo de requisições, categorias, origens e exclusões.
5. Preservar o bloqueio atual diante de STJ legado, antes de qualquer gravação.
6. Executar a criação das fábricas ausentes e suas configurações/auditorias em uma
   transação. Uma falha deve reverter todas as inserções daquela execução.
7. Usar a unicidade existente do código da fábrica para coordenar execuções
   concorrentes; tratar como repetição somente o conflito esperado desse código,
   sem esconder falhas de configuração ou erros de banco.
8. Registrar as criações de categorias/origens no histórico de configuração,
   identificando a inicialização pelo catálogo fixo. Usar o padrão atual de
   movimentos de configuração com quantidade zero.
9. Ajustar mensagens para distinguir fábricas criadas com padrões de fábricas
   existentes preservadas.
10. Registrar um único comando de seed na configuração vigente do Prisma e remover
    a declaração legada redundante de `backend/package.json`.

Para criar uma fábrica não oficial, fornecer um script administrativo com código
e nome explícitos, reutilizando a mesma lógica de criação com padrões utilizada
pelo seed. Recusar códigos existentes: criação não é atualização nem reparação.
Não criar uma nova tela ou API neste trabalho. Validar argumentos e catálogo antes
de escrever, e não imprimir credenciais. Execução em produção exige autorização específica.

Fábricas existentes vazias também serão preservadas. Se a auditoria identificar
uma unidade existente que precisa receber os padrões, a inicialização dela será
uma decisão explícita separada, sem ativar preenchimento automático no seed.

Não é necessária uma nova tabela ou migration para essas mudanças.

## Etapa 3: auditoria somente leitura dos dados existentes

Criar uma consulta/script independente do seed para listar, por fábrica:

- Quantidades de categorias, origens e prateleiras, estado ativo e módulo habilitado.
- Configurações com prefixos do fixture de desenvolvimento.
- Categorias/origens homônimas a SEST e diferenças de setor, unidade e bloqueio.
- Variações apenas de caixa/espaços que possam representar duplicidade lógica.

Semelhança com SEST é indício de configuração comum, não prova de cópia.
A auditoria não excluirá, normalizará ou reconciliará registros. Qualquer correção
posterior será uma tarefa separada, com decisão explícita por ocorrência.

## Validação e critérios de aceite

### Catálogo e seed

- Catálogo válido, sem nomes duplicados, setores/unidades inválidos ou configurações
  de teste. Categoria bloqueada sem unidade é recusada antes de escrever.
- Banco vazio recebe as seis fábricas oficiais e os mesmos padrões fixos em cada
  uma, com IDs locais e histórico de configuração. Nenhum dado operacional é criado.
- Alterações, exclusões ou dados de teste de SEST não afetam a criação de outra fábrica.
- Segunda execução não modifica nomes, flags, configurações ou histórico existentes.
- Fábrica oficial desativada permanece desativada; fábricas não oficiais ficam intactas.
- Configuração apagada não reaparece; alterações do catálogo só afetam futuras fábricas.
- Registros homônimos com regras diferentes em fábricas existentes são preservados.
- STJ legado bloqueia a execução sem qualquer alteração.
- Falha na criação de uma configuração ou auditoria reverte toda a operação.
- Execuções concorrentes não criam códigos/configurações duplicados ou estado parcial.

### Criação explícita de fábrica

- Código/nome explícitos criam exatamente uma fábrica com o catálogo fixo.
- Código existente é recusado sem alterar a fábrica, mesmo quando ela está vazia.
- Argumentos inválidos e catálogo inválido não geram gravações parciais.
- Origem dos padrões independe do banco; não existe argumento para copiar SEST.
- Fábricas não selecionadas permanecem intactas.

### Execução

1. Testes focados para o contrato do catálogo e do seed; testes PostgreSQL no clone
   para rollback, concorrência e criação com padrões.
2. Build do backend. Frontend permanece fora do escopo da mudança proposta.
3. Backup e clone isolado com schema compatível com a migration do catálogo fixo.
4. Auditoria antes/depois e comparação dos dados existentes no clone.
5. Atualizar documentação com comandos, limites e relação com migrations históricas.
6. Revisar o resultado do clone antes de solicitar qualquer aplicação em produção.

## Escopo e sequência

1. Revisar e fechar o conteúdo do catálogo inicial de categorias e origens.
2. Implementar a restrição do seed e a criação de novas fábricas com esses padrões.
3. Implementar a auditoria somente leitura e validar no clone.
4. Revisar separadamente qualquer necessidade de ajustar fábricas já existentes.

Não alterar registros existentes ou migrations aplicadas, nem executar scripts de
seed/provisionamento no banco de destino como parte da preparação deste plano.
A migration histórica de Ivoti continuará preservada; seus efeitos existentes não
serão tratados como prova de procedência nem removidos automaticamente.

Catálogo inicial definido para a implementação: `TECIDO` (CORTE/M²), `COURO`
(CORTE/M), `FORRO` (CORTE/M²), `SINTETICO` (CORTE/M²), `LINHA` (CORTE/KG),
`MOLDE / PEÇA` (APOIO/UN), `EVA` e `BORRACHA` (PRE_FABRICADO/UN), `CABEDAL`
e `SOLA_PROCESSADA` (DISTRIBUICAO/UN), e `PE PRONTO` (MONTAGEM/UN). Todas as
categorias começam bloqueadas. As origens `CONSUMO`, `DEVOLUÇÃO` e `OUTROS`
serão globais; `DUBLAGEM`, `ERRO DE ENFESTO`, `GANHO NO ROLO` e `RETALHO`
serão de CORTE; `SOBRA DE REQUISIÇÃO` será global. `CONSUMO` fica global porque
o schema atual não suporta uma origem única vinculada simultaneamente a dois
setores. Prateleiras locais ficam fora dos padrões iniciais propostos.
