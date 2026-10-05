# Análise: subsetores, materiais e permissões

## Status e escopo

Este documento consolida a análise do cadastro de categorias/materiais, subtipos, localizações e da proposta de subsetores operacionais. É uma proposta para revisão; **nenhuma alteração de código, estrutura do banco ou dados foi aplicada**.

A análise inicial foi feita por leitura do código e das migrações. Na Etapa 1, também foi feita uma consulta agregada em transação PostgreSQL somente leitura, sem extrair nomes de usuários nem efetuar gravações. Os resultados abaixo correspondem à base de referência acessível nesta sessão; devem ser confirmados pelo responsável do ambiente antes de qualquer migração.

## Resumo da proposta

Um subsetor deve representar uma área operacional dentro de um setor já existente. Exemplo: `APOIO → SERIGRAFIA`. Materiais, itens de estoque, localizações e movimentações podem ser associados ao subsetor. O subsetor também delimita o acesso dos usuários.

Subsetor não é categoria de material. `SERIGRAFIA` é a área; uma peça serigrafada, tela ou tinta é um material/item dentro dela. Categorias continuam sendo classificações de material. Essa separação evita que “categoria”, “subtipo” e “área de trabalho” disputem o mesmo campo.

O setor continua sendo o enum existente (`APOIO`, `PRE_FABRICADO`, `DISTRIBUICAO` etc.). Os nomes dos subsetores ficam em registros configuráveis, permitindo criar um novo subsetor sem adicionar um valor ao enum. Isso não cria, por si só, um novo formulário ou comportamento de estoque: um fluxo operacional estruturalmente novo ainda pode exigir desenvolvimento.

## Diagnóstico da estrutura atual

### Dados e conceitos

- `CategoryConfig` representa a classificação configurável de material, com nome, setores de uso, perfil interno, unidade e vínculos com estoque/localizações. Não há uma tabela separada de “Material” em Configurações.
- `StockItem` representa o item cadastrado no estoque. Mantém um `categoryId` opcional, um `componentType` e o texto legado `type`.
- `ComponentSubtypeConfig` é apresentado como subtipo, mas também guarda a classificação estrutural interna (`componentType`) que direciona fluxos especializados.
- `Location` representa uma prateleira/local. Há o campo legado singular `categoryId` e a relação muitos-para-muitos `LocationCategory`.
- `StockMovement` guarda o setor, o item e snapshots históricos, mas não tem uma dimensão de subsetor.
- `UserRoleBinding` guarda papel e `assignedSector`; não possui subsetor atribuído.

Referências: [`CategoryConfig`, `ComponentSubtypeConfig` e `Location`](backend/prisma/schema.prisma#L83), [`StockItem` e `StockMovement`](backend/prisma/schema.prisma#L284), [`UserRoleBinding`](backend/prisma/schema.prisma#L170).

### Por que o cadastro atual é confuso

Na tela atual, a pessoa informa nome, setor(es), subtipo, unidade e bloqueio de unidade; depois pode precisar ir à aba de localizações para vincular a categoria a uma prateleira. Há também um gerenciamento separado de subtipos. Isso faz o usuário decidir vários conceitos técnicos antes de conseguir usar o material. A tela explicita um fluxo em duas etapas e oferece opções distintas para salvar a categoria ou seguir para o vínculo com localização.

Referências: [início e formulário de categorias](frontend/src/pages/Settings.vue#L29), [subtipo e unidade](frontend/src/pages/Settings.vue#L121), [gerenciamento de subtipos](frontend/src/pages/Settings.vue#L172), [formulário de localização](frontend/src/pages/Settings.vue#L350).

Além disso, permitir cadastrar um nome novo não garante suporte em todas as operações. Setores e `ComponentType` são enums fixos e partes de estoque, requisições e importações ainda possuem opções ou inferências fixas por nome. Os subtipos criados pelo formulário recebem nome e setores, mas não um novo comportamento operacional.

Referências: [enum de setor e componente](backend/prisma/schema.prisma#L12), [criação de subtipo](backend/src/controllers/SettingsController.ts#L155), [opções fixas do estoque](frontend/src/pages/InventoryHub.vue#L80), [opções fixas em requisições](frontend/src/pages/Requisitions.vue#L1420).

### Classificações fixas a preservar

| Setor | Classificação existente | Perfil esperado |
|---|---|---|
| Pré-fabricado | EVA — sola não processada | Solado |
| Pré-fabricado | Borracha | Solado |
| Distribuição | Cabedal | Cabedal |
| Distribuição | Sola Processada | Solado |
| Peças Cortadas (`APOIO`) | Molde / Peça, conforme catálogo padrão | Peça cortada |
| Montagem | Pé Pronto, conforme catálogo padrão | Pé pronto |

EVA e Sola Processada representam etapas diferentes e não devem ser mescladas. Cabedal pode ser compartilhado entre Apoio e Distribuição se mantiver o mesmo significado e perfil operacional. O catálogo de novas fábricas já contém as classificações fixas e as unidades padrão; as migrações também backfillaram vínculos de categorias e itens em versões anteriores.

Referências: [catálogo padrão](backend/src/provisioning/factoryCatalog.ts#L28), [provisionamento e perfis](backend/src/provisioning/factoryProvisioning.ts#L12), [migração de categorias e estoque](backend/prisma/migrations/20261001120000_category_sector_scope_and_stock_category/migration.sql#L1), [migração de subtipos](backend/prisma/migrations/20261002130000_editable_component_subtypes/migration.sql#L1).

### Duplicatas e manutenção

A categoria é única por unidade fabril e nome literal. A API coloca o nome em caixa alta e remove espaços das extremidades, mas diferenças como espaço interno repetido, acentuação ou separadores podem deixar passar nomes equivalentes, por exemplo `SOLA PROCESSADA` e `SOLA_PROCESSADA`. Uma comparação textual ou aproximada não deve fundir automaticamente itens de etapas distintas.

A edição de nome de categoria pode atualizar o campo legado `StockItem.type`; a exclusão pode retirar referências à configuração usada. Recomenda-se arquivar categorias em uso e separar a mudança de rótulo da identidade histórica do item.

Referências: [unicidade atual](backend/prisma/schema.prisma#L228), [criação da categoria](backend/src/controllers/SettingsController.ts#L304), [edição da categoria](backend/src/controllers/SettingsController.ts#L395), [exclusão da categoria](backend/src/controllers/SettingsController.ts#L545).

## Modelo de dados sugerido

### Entidades principais

```mermaid
erDiagram
    FACTORY_UNIT ||--o{ SUBSECTOR_CONFIG : possui
    USER_ROLE_BINDING ||--o{ USER_SUBSECTOR_ACCESS : autoriza
    SUBSECTOR_CONFIG ||--o{ USER_SUBSECTOR_ACCESS : concede
    SUBSECTOR_CONFIG ||--o{ STOCK_ITEM : organiza
    SUBSECTOR_CONFIG ||--o{ LOCATION : delimita
    SUBSECTOR_CONFIG ||--o{ STOCK_MOVEMENT : registra
    SUBSECTOR_CONFIG ||--o{ SUBSECTOR_CATEGORY : restringe
    CATEGORY_CONFIG ||--o{ SUBSECTOR_CATEGORY : permite
    CATEGORY_CONFIG ||--o{ STOCK_ITEM : classifica
    STOCK_ITEM ||--o{ STOCK_MOVEMENT : movimenta
```

O diagrama mostra relações conceituais; os campos e relações exatos dependeriam da revisão do schema antes da implementação.

#### `SubsectorConfig`

Nova tabela de subsetores configuráveis:

```text
id
factoryUnitId
sector                 // enum existente, por exemplo APOIO
name                   // por exemplo SERIGRAFIA
normalizedName         // chave normalizada para impedir duplicatas
active                 // permite arquivar sem excluir referências
categoryMode           // ALL (padrão) ou SELECTED
```

Restrição recomendada: unicidade de `(factoryUnitId, sector, normalizedName)`. Assim, uma fábrica não cadastra duas vezes “Serigrafia” dentro de Apoio, mas pode usar o mesmo nome em outro setor se isso fizer sentido.

#### Acesso dos usuários

Usar a vinculação local por fábrica que já existe:

```text
UserSubsectorAccess
- factoryUnitId
- bindingId            // FK para UserRoleBinding
- subsectorId           // FK para SubsectorConfig
```

O vínculo permite que uma pessoa tenha acesso a vários subsetores dentro do setor atribuído. Regras de acesso amplo aprovadas: Admin Master acessa todos os subsetores globalmente; Admin de Setor acessa todos os subsetores do setor atribuído; Líder, Movimentador e Leitor acessam somente os subsetores atribuídos. A ausência de subsetores atribuídos não significa acesso irrestrito para esses papéis.

As relações devem preservar o padrão multi-tenant existente: vínculos compostos com `factoryUnitId` para impedir referências entre unidades fabris.

#### Categorias permitidas por subsetor

Como a restrição por subsetor foi aprovada, acrescentar uma relação opcional:

```text
SubsectorCategory
- factoryUnitId
- subsectorId
- categoryConfigId
```

`categoryMode` começa como `ALL`, que herda todas as categorias configuradas para o setor pai. No modo `SELECTED`, o subsetor aceita somente as categorias escolhidas nessa relação, sempre usando os registros `CategoryConfig` existentes — não cria cópias. A seleção deve conter ao menos uma categoria; a API valida que ela pertence à mesma unidade fabril e ao setor pai do subsetor.

#### Estoque, localizações e movimentações

- **`StockItem.subsectorId`**: associa o item ao subsetor operacional quando informado. O campo deve ser opcional para dados antigos e novos: um setor pode ter subsetores sem obrigar que todo item pertença a um deles. O backend valida que o setor do item corresponde ao setor do subsetor.
- **`Location.subsectorId`**: permite associar uma localização a um subsetor. Novas localizações associadas só atendem itens do mesmo subsetor; novas localizações sem subsetor atendem itens sem subsetor. Localizações antigas sem subsetor preservam o fluxo atual dos registros legados, mas não serão tratadas como compartilhadas por novos itens de subsetor sem associação explícita. Não haverá localização comum entre subsetores.
- **`StockMovement`**: mantém a referência ao subsetor do item quando houver; para item sem subsetor, preserva o fluxo atual. Não haverá transferência entre subsetores. Movimentos históricos não recebem associações inferidas.
- **`SubsectorCategory`**: associa um subsetor às categorias permitidas quando `categoryMode` for `SELECTED`. No modo padrão `ALL`, todas as categorias do setor pai são válidas. A restrição controla novos cadastros de itens e mudanças de categoria; registros existentes permanecem visíveis e não são reclassificados automaticamente.

## Acesso e papéis

Atualmente, o sistema combina papel e setor. O middleware valida se o setor da operação corresponde ao `assignedSector`, sem verificar uma área menor. Portanto, um subsetor criado só como categoria, filtro ou nome de tela não restringiria acesso.

Com subsetores, a regra de autorização deve ser:

> **Ações permitidas pelo papel + setor atribuído + subsetores autorizados.**

O papel diferencia consulta, cadastro, movimentação, gerenciamento e aprovação conforme as regras já existentes para setores. O subsetor delimita os registros sobre os quais essas ações podem ser exercidas; não cria nem amplia permissões operacionais. Leitor tem somente consulta. Admin Master acessa todos os subsetores; Admin de Setor acessa todos os subsetores do setor atribuído; Líder, Movimentador e Leitor ficam limitados aos subsetores atribuídos. A administração da configuração de subsetores continua obedecendo às permissões existentes de Configurações.

Essa validação precisa ocorrer no backend em leituras e escritas: listagens, filtros, cadastro, entrada, saída, transferência, relatórios, exportações, importação CSV e fluxos de requisição. Filtrar somente o frontend não garante autorização.

Referências: [verificação de setor](backend/src/auth/stockAccess.ts#L5), [middleware de setor](backend/src/middlewares/roleMiddleware.ts#L140), [matriz de ações no frontend](frontend/src/stores/auth.js#L278), [atribuição de setor ao usuário](frontend/src/pages/Users.vue#L338).

## Experiência proposta em Configurações

Não criar subsetores dentro do formulário de Categorias. Recomenda-se uma área própria **Configurações → Subsetores**, mantendo conceitos separados:

1. **Subsetores:** criar `Serigrafia` e escolher o setor pai `Apoio`.
2. **Usuários e acessos:** atribuir os subsetores permitidos para cada usuário e papel.
3. **Categorias de materiais:** continuar cadastrando classificações no setor. Em cada subsetor, escolher entre usar todas as categorias do setor (padrão) ou selecionar as categorias permitidas. A seleção referencia categorias existentes e não cria duplicatas.
4. **Localizações:** associar prateleiras a um subsetor quando o armazenamento for separado; não permitir compartilhamento entre subsetores.
5. **Nova entrada/movimentação:** depois de escolher Apoio, apresentar somente subsetores autorizados ao usuário.

Para reduzir confusão, os nomes “subtipo” e `componentType` devem ficar fora do cadastro comum. O perfil estrutural interno deve ser derivado pelo sistema nos casos claros; em setores com mais de um fluxo, solicitar uma escolha simples entre comportamentos já suportados.

## Compatibilidade e migração

1. **Pré-inventário somente leitura:** por unidade fabril, contar itens com/sem `categoryId`, nomes de categorias normalizados, componentes/perfis, vínculos diretos e em `LocationCategory`, movimentos históricos e usuários por papel/setor.
2. **Não inferir subsetor pelo setor atual:** itens e usuários de Apoio não podem ser atribuídos automaticamente à Serigrafia sem confirmação. A mesma regra vale para subsetores criados em qualquer outro setor.
3. **Manter legados distinguíveis e operacionais:** itens, localizações, usuários e movimentos antigos sem subsetor continuam com o comportamento atual. Não atribuir nem renomear registros antigos automaticamente.
4. **Atribuir usuários explicitamente:** o setor `APOIO` não revela em qual subsetor cada pessoa deve operar. A implantação precisa de revisão dos acessos existentes, sem tornar obrigatório um subsetor para cada usuário.
5. **Migração aditiva:** adicionar relacionamentos opcionais e preservar os fluxos legados. Novos itens também podem permanecer no escopo do setor sem subsetor; quando o usuário informar um subsetor, validar setor, unidade fabril e autorização. Restrições de categoria não reclassificam nem ocultam itens já cadastrados; a regra vale para novos itens e alterações de categoria.
6. **Preservar histórico:** não alterar quantidades, códigos, alocações, snapshots de movimento ou IDs de categorias existentes. Mapeamentos de duplicatas devem ser revisados; correspondências ambíguas não são mescladas automaticamente.
7. **Arquivar em vez de excluir:** subsetores e classificações com registros associados devem ser desativados, mantendo as FKs e a rastreabilidade.
8. **Manter classificações fixas como classificações:** EVA, Borracha, Cabedal e Sola Processada continuam sendo classificações/perfis de material vinculados aos seus setores atuais; não são convertidas em subsetores. Ao criar subsetores, não clonar nem renomear esses registros. Reaproveitar IDs e vínculos existentes; tratar nomes equivalentes com normalização/alias revisado, sem mesclar registros ambíguos automaticamente.
9. **Restrições sem duplicar categorias:** subsetores no modo `ALL` herdam as categorias existentes do setor. No modo `SELECTED`, relacionar os IDs de `CategoryConfig` já existentes. Antes de ativar uma restrição, apresentar as categorias e os itens existentes que ficariam fora da seleção; preservar esses itens e seus movimentos históricos.

Decisões aprovadas para a Etapa 0: hierarquia inicial `Setor → Subsetor`; usuários podem pertencer a vários subsetores dentro do setor atribuído; subsetores são opcionais e poderão ser criados em qualquer setor; Leitor é somente leitura; as ações disponíveis seguem a matriz já existente para setores, sem ampliação pelo subsetor; Admin Master tem acesso global, Admin de Setor acessa todos os subsetores do setor atribuído e os demais papéis dependem de atribuição; itens antigos mantêm comportamento atual; não haverá localizações compartilhadas nem transferências entre subsetores; subsetores podem restringir categorias.

## Alterações previstas se aprovadas

### Frontend

- Criar seção própria de subsetores em Configurações, fora de Categorias.
- Permitir escolher setor pai, nome e status ativo/inativo; configurar categorias como “todas do setor” (padrão) ou selecionar uma lista existente.
- Ampliar gestão de usuários para atribuir um ou vários subsetores e exibir concessões amplas explicitamente.
- Acrescentar seleção de subsetor nas entradas/movimentações e restringir opções ao escopo do usuário.
- Vincular localizações a subsetores e impedir o compartilhamento entre subsetores; preservar localizações antigas sem subsetor no fluxo atual.
- Adaptar listagens, relatórios, filtros e exportações para exibir e filtrar subsetor.
- Separar a configuração visível ao usuário das regras estruturais internas de estoque.

### Backend e banco

- Criar `SubsectorConfig`, `UserSubsectorAccess` e `SubsectorCategory`; acrescentar relações opcionais de subsetor a estoque, localizações e movimentos. Categorias selecionadas devem ser da mesma unidade fabril e do setor pai.
- Manter integridade de unidade fabril e validar consistência entre subsetor e setor em toda gravação.
- Aplicar escopo de subsetor em todas as consultas e operações, sem confiar nos filtros do cliente.
- Resolver o subsetor no servidor a partir do registro do item para registrar movimentos; rejeitar IDs incompatíveis ou não autorizados.
- Normalizar nomes e impedir duplicatas no backend e no banco; usar aliases revisados para grafias legadas.
- Preservar IDs atuais e tornar exclusões de registros usados em arquivamento.
- Auditar requisições, importação e demais fluxos que consultam itens por setor para também respeitar subsetor.

## Critérios de aceite

- É possível criar um subsetor em um setor existente sem adicionar um novo valor ao enum, por exemplo `APOIO → SERIGRAFIA`.
- Dois subsetores não podem ter nomes duplicados após normalização dentro do mesmo setor e unidade fabril.
- Criar subsetor não concede acesso automaticamente a todos os usuários do setor.
- Admin Master acessa todos os subsetores; Admin de Setor acessa os subsetores do setor atribuído; Líder, Movimentador e Leitor ficam limitados às atribuições explícitas. Leitor nunca altera dados.
- O subsetor restringe o escopo dos registros, sem conceder ações além das já permitidas ao papel nos setores; o backend rejeita chamadas fora desse escopo.
- Um item pode ser cadastrado sem subsetor mesmo quando seu setor possui subsetores; se houver subsetor, ele deve pertencer à mesma unidade fabril e ao setor do item.
- No modo `ALL`, o subsetor aceita todas as categorias do setor; no modo `SELECTED`, aceita somente categorias existentes selecionadas para ele, sem duplicar `CategoryConfig`.
- Uma categoria selecionada para o subsetor precisa pertencer ao mesmo setor e unidade fabril; não é possível salvar o modo `SELECTED` sem pelo menos uma categoria.
- Entrada e saída de item associado mantêm o subsetor correspondente; item legado ou sem subsetor continua usando o fluxo atual. Não é possível transferir estoque entre subsetores.
- Localizações novas associadas aceitam somente itens do mesmo subsetor; novas localizações sem subsetor atendem somente itens sem subsetor. Localizações antigas preservam o fluxo dos registros legados e não são consideradas compartilhadas por novos itens de subsetor.
- Relatórios, exportações, filtros, importações e requisições respeitam o escopo do subsetor.
- Itens, usuários, localizações e movimentos antigos permanecem no fluxo atual; nenhuma associação presumida os move para um subsetor.
- EVA, Borracha, Cabedal e Sola Processada mantêm IDs, setores e perfis; EVA e Sola Processada continuam distintas. Restringir categorias não clona nem move esses cadastros.
- Arquivar uma classificação ou subsetor não apaga vínculos nem altera snapshots históricos.
- Classificações novas podem usar comportamentos já suportados; um comportamento operacional inteiramente novo é identificado como demanda de desenvolvimento, sem classificação silenciosa incorreta.

## Resultado da Etapa 1 — inventário somente leitura

**Status: validada pelo solicitante em 05/10/2026.** A consulta usou `BEGIN READ ONLY` e foi encerrada com `ROLLBACK`. Nenhum dado foi alterado. Foram coletadas contagens agregadas por fábrica/setor e nomes de classificação necessários à análise; nomes de pessoas e credenciais não foram consultados nem registrados.

### Unidades e usuários

Há seis unidades fabris ativas na base consultada: `ITB`, `ITP`, `IVT`, `SAJ`, `SEST` e `VDC`.

| Unidade | Vínculos locais por papel/setor |
|---|---|
| SAJ | 2 leitores sem setor atribuído |
| SEST | 3 admins sem setor; 10 leitores sem setor; 1 líder em MONTAGEM; 4 líderes sem setor |
| ITB, ITP, IVT, VDC | Nenhum vínculo local retornado |

Não foram encontradas identidades de origem sem vínculo local na unidade de origem. Os quatro líderes de SEST sem setor precisam de revisão: perfis operacionais sem setor são incompatíveis com a exigência atual do backend. Não atribuir setor ou subsetor por inferência.

### Categorias e candidatos a subsetor

Foram encontrados 111 registros de categoria: 21 em CORTE em ITB, ITP, IVT e VDC; 4 em CORTE em SAJ; 22 em CORTE e 1 em APOIO em SEST. Não apareceu grupo duplicado após normalização preliminar (maiúsculas, remoção de acentos, espaços consecutivos e normalização de `_`, `/` e `-`). Essa checagem detecta colisões textuais normalizadas; não prova ausência de duplicidade semântica.

O caso mais relevante para esta iniciativa:

- Em `SEST`, há uma `CategoryConfig` chamada **SERIGRAFIA**, no setor `APOIO` (ID `232` na base consultada).
- Ela não tem subtipo nem `componentType` e não possui item de estoque ligado por `categoryId`.
- Ela está referenciada por uma localização tanto pelo campo legado `Location.categoryId` como por uma linha `LocationCategory`.
- Portanto, é uma classificação existente com vínculo físico, **não** um subsetor no schema atual. Deve ser revisada antes de decidir se será associada, renomeada ou substituída por um registro de subsetor. Não criar outra “Serigrafia” nem remover o vínculo sem essa revisão.

Também foi encontrado um caso em CORTE/SEST sem `componentType` (a categoria `FILME TPU`). Isso reforça que não se deve assumir que todo nome cadastrado possui perfil operacional válido.

Na base consultada, as categorias EVA retornadas estão em `CORTE`, com perfil `MATERIA_PRIMA`. Não foram encontrados registros de categoria chamados `BORRACHA`, `CABEDAL` ou `SOLA_PROCESSADA`, nem categorias nos setores Pré-fabricado, Distribuição ou Montagem. O catálogo de provisionamento no código contém esses defaults, mas eles não aparecem neste snapshot. Confirmar se isso é esperado para este ambiente antes de tratar como ausência a corrigir.

### Itens de estoque

| Unidade | Setor | Itens | Sem `categoryId` | Tipos observados |
|---|---|---:|---:|---|
| SEST | APOIO | 3 | 3 | `type` nulo nos 3 |
| SEST | DISTRIBUICAO | 2 | 2 | `CABEDAL` nos 2; não há categoria correspondente no setor |
| SEST | MONTAGEM | 2 | 2 | `type` nulo nos 2 |
| Demais unidades/setores | — | 0 retornados | — | — |

Os dois itens de Distribuição com `type = CABEDAL` são candidatos a vínculo somente após confirmação da classificação e do perfil pretendido. Não há correspondência inequívoca na configuração atual. Nenhum item existente foi reclassificado.

### Localizações e vínculos

| Unidade | Localizações encontradas | Resumo dos vínculos |
|---|---:|---|
| ITB, ITP, VDC | 17 em cada | `sector` nulo; 8 por unidade têm restrições de categoria, totalizando 20 vínculos por unidade |
| SAJ | 1 | `sector` nulo; a localização tem 3 vínculos de categoria |
| SEST | 23 | CORTE 1, APOIO 3, DISTRIBUIÇÃO 1, MONTAGEM 1 e 17 com `sector` nulo; entre as 17 gerais, 8 têm 20 vínculos |
| IVT | 0 retornadas | — |

Não foi encontrada localização cujo `categoryId` legado estivesse sem o vínculo equivalente em `LocationCategory`. A categoria SERIGRAFIA de SEST está ligada a uma localização. Locais com setor ou vínculos vazios devem continuar seguindo as regras atuais de localização geral/livre; não devem se tornar compartilhados entre subsetores implicitamente.

### Histórico de movimentações

Foram encontrados 7 movimentos de entrada ligados a itens em SEST: 3 em APOIO, 2 em DISTRIBUIÇÃO e 2 em MONTAGEM. Também há 10 movimentos de configuração em `CONFIGURACOES`, sem `stockItemId`: 1 exclusão, 2 edições e 7 criações de configuração, compatíveis com auditoria cadastral. Não foram retornados movimentos em outras unidades/setores.

As tabelas `StockItem`, `Location`, `StockMovement` e `UserRoleBinding` não possuem colunas de subsetor. Os movimentos antigos devem permanecer sem subsetor, sem associação presumida.

### Rotas e telas que consultam ou alteram estoque

Telas e componentes identificados:

- **Cadastro/Nova Entrada:** `SectorFormInput.vue`; busca combinações, categorias, unidades, localizações e origens e envia itens em lote.
- **Estoque e movimentação:** `InventoryHub.vue` e `stockStore.ts`; consultam itens, iniciam movimentações e permitem exclusão conforme o papel.
- **Histórico:** `StockMovementHistory.vue`.
- **Pares de Montagem:** busca e execução de casamento integradas ao estoque.
- **Requisições:** `Requisitions.vue`; disponibilidade, busca, criação, atendimento e cancelamento.
- **Relatórios e dashboard:** `Reports.vue` e `Dashboard.vue`.
- **Configurações e importação:** `Settings.vue`; categorias, subtipos, localizações, origens e CSV.

Principais rotas backend a considerar na futura implementação:

- Estoque: `/inventory/batch`, `/inventory/search`, `/inventory/search-suggestions`, `/inventory/combinations`, `/inventory/stock-items/:id`.
- Movimentação e montagem: `/inventory/movements`, `/inventory/movements/history`, `/inventory/mounting/matching-pairs`, `/inventory/mounting/execute-match`.
- Requisições: `/requisitions`, `/requisitions/check-availability`, `/requisitions/search-suggestions`, `/requisitions/pending-count`, `/requisitions/:id/fulfill` e `/requisitions/:id/cancel`.
- Consultas analíticas: `/dashboard/summary`, `/reports/inventory`, `/reports/movements`, `/reports/requisitions` e respectivas rotas de exportação.
- Configuração/importação: `/settings/categories`, `/settings/component-subtypes`, `/settings/locations`, `/settings/origins`, `/settings/requisition-stock-compatibilities`, `/settings/requisition-stock-compatible-items`, `/import/csv/preview` e `/import/csv`.

O isolamento por subsetor deverá cobrir consultas e gravações dessas rotas, incluindo exportações e importações, não somente os formulários visíveis.

## Referências principais do código

- [Schema Prisma](backend/prisma/schema.prisma)
- [Tela de Configurações](frontend/src/pages/Settings.vue)
- [Controlador de Configurações](backend/src/controllers/SettingsController.ts)
- [Catálogo padrão de fábrica](backend/src/provisioning/factoryCatalog.ts)
- [Provisionamento de fábrica](backend/src/provisioning/factoryProvisioning.ts)
- [Regras de acesso ao estoque](backend/src/auth/stockAccess.ts)
- [Middleware de papéis e setor](backend/src/middlewares/roleMiddleware.ts)
- [Gestão de usuários](frontend/src/pages/Users.vue)
- [Migração de categoria e vínculo com estoque](backend/prisma/migrations/20261001120000_category_sector_scope_and_stock_category/migration.sql)
- [Migração de subtipos](backend/prisma/migrations/20261002130000_editable_component_subtypes/migration.sql)

## Plano de execução em etapas

As etapas abaixo organizam uma implementação futura. **Este plano não é autorização para iniciar mudanças no sistema**; a implementação começa somente após o OK explícito do solicitante. A ordem considera que o isolamento por subsetor precisa funcionar no backend antes de depender dos filtros de tela.

### Etapa 0 — Fechar as regras de negócio

**Status: validada pelo solicitante em 05/10/2026.** Regras aprovadas:

- A hierarquia inicial terá somente `Setor → Subsetor`.
- Um usuário poderá pertencer a vários subsetores dentro do setor atribuído.
- Admin Master acessa todos os subsetores; Admin de Setor acessa todos os subsetores do setor atribuído; Líder, Movimentador e Leitor precisam estar vinculados aos subsetores que acessam.
- Leitor terá somente acesso de consulta. Para os demais papéis, valem as ações já autorizadas pelas regras de setor; subsetor restringe os registros e não amplia permissões.
- Subsetor será opcional para novos itens, mesmo quando houver subsetores no setor; a configuração poderá ser usada em qualquer setor.
- Itens antigos sem subsetor continuam com o comportamento atual e não serão associados por inferência.
- Não haverá localizações compartilhadas entre subsetores nem transferências entre subsetores.
- Cada subsetor poderá usar todas as categorias do setor ou uma lista restrita de categorias existentes. Por padrão, herda todas as categorias do setor pai.

**Entregável concluído:** regras de acesso, comportamento de legado, opcionalidade de subsetor e restrições de categoria estão definidas. A Etapa 0 não autoriza por si só iniciar implementação; cada etapa posterior segue o fluxo de aprovação combinado.

### Etapa 1 — Fazer inventário somente leitura

**Status: validada pelo solicitante.** Resultado detalhado em [Resultado da Etapa 1 — inventário somente leitura](#resultado-da-etapa-1--inventário-somente-leitura).

Levantar por unidade fabril os usuários por papel/setor, itens com e sem categoria, nomes de categorias após normalização, localizações e seus vínculos, movimentos históricos e casos sem classificação inequívoca. Identificar também rotas e telas que consultam ou alteram estoque.

**Entregável:** relatório de contagens, ambiguidades e proposta de mapeamento. Nenhuma linha de produção é alterada nesta etapa.

### Etapa 2 — Preparar o banco de forma aditiva

Criar `SubsectorConfig`, `UserSubsectorAccess` e `SubsectorCategory`; acrescentar relações opcionais de subsetor a itens, localizações e movimentos. Incluir chaves compostas por unidade fabril, índices e unicidade normalizada. Definir arquivamento em vez de exclusão e o modo de categoria `ALL`/`SELECTED`.

Os campos de subsetor permanecem opcionais para não quebrar registros históricos. Esta etapa não atribui itens nem usuários existentes a um subsetor por suposição.

**Entregável:** migração aditiva revisada e schema compatível com os registros atuais.

### Etapa 3 — Implementar regras e API no backend

Criar operações para listar, criar, editar e arquivar subsetores. Implementar associação de usuários e autorização por papel, setor e subsetor, sem ampliar as permissões atuais dos papéis. Aplicar os filtros nas consultas e validar as gravações no servidor, incluindo consistência entre setor, subsetor, item, localização e categorias permitidas.

Rejeitar IDs de subsetor inexistentes, de outra unidade fabril ou incompatíveis com o setor. Definir explicitamente quais rotas tratam registros legados sem subsetor.

**Entregável:** API que aplica o escopo mesmo quando chamada sem a interface; o acesso amplo segue a matriz aprovada e os demais papéis dependem de vínculos explícitos.

### Etapa 4 — Criar a gestão de subsetores e acessos

Adicionar uma área própria **Configurações → Subsetores**, separada de Categorias. Permitir escolher setor pai, nome e status. Em **Usuários e acessos**, permitir atribuir um ou mais subsetores e mostrar claramente concessões amplas. Na configuração de cada subsetor, oferecer “Todas as categorias do setor” (padrão) ou “Selecionar categorias”, usando os registros de categoria já existentes.

**Entregável:** administrador consegue configurar a estrutura e os acessos sem editar categorias ou dados históricos.

### Etapa 5 — Adaptar os fluxos de estoque

Adicionar a seleção opcional de subsetor às entradas e movimentações. Mostrar somente subsetores autorizados ao usuário. Validar vínculos de item e localização no mesmo subsetor. Bloquear compartilhamento de localizações novas e transferências entre subsetores; manter o fluxo atual para itens e localizações legados sem subsetor.

**Entregável:** um usuário sem acesso à Serigrafia não consegue consultar ou movimentar seus itens alterando parâmetros da requisição.

### Etapa 6 — Integrar os demais consumidores

Revisar e adaptar relatórios, filtros, exportações, importações CSV, requisições, dashboard e fluxos de estoque que usam apenas `sector`, `type` ou nomes fixos. Aplicar as categorias permitidas nos novos cadastros e alterações de categoria. Garantir que as classificações fixas continuem reconhecidas e que classificações customizadas apareçam nos fluxos compatíveis.

**Entregável:** nenhuma rota de leitura ou escrita conhecida ignora o escopo do subsetor.

### Etapa 7 — Preservar o legado e validar os novos vínculos

Usar o inventário da Etapa 1 para atribuir subsetores somente após confirmação explícita. Manter os demais registros no fluxo atual; não mover automaticamente itens de Apoio para Serigrafia nem classificações fixas para novos subsetores. Revisar os acessos dos usuários atuais. Não exigir subsetor para novos itens; validar apenas os vínculos quando um subsetor for informado.

**Entregável:** registros antigos preservados e novos vínculos opcionais respeitando unidade fabril, setor e autorização do usuário.

### Etapa 8 — Validar, liberar e acompanhar

Validar os critérios de aceite deste documento para cada papel e subsetor, verificar os caminhos de entrada, movimentação, consulta, exportação e legado, e preparar procedimento de reversão da ativação caso apareça bloqueio operacional indevido.

**Entregável:** evidência de validação e liberação gradual aprovada. Esta etapa pertence à futura execução; nenhuma validação de implementação foi realizada nesta análise.

### Marcos de liberação

1. **Marco A:** regras de negócio e inventário aprovados (Etapas 0–1).
2. **Marco B:** banco e backend prontos, ainda sem exigir subsetor dos registros existentes (Etapas 2–3).
3. **Marco C:** gestão de subsetores, acessos e fluxos operacionais integrados (Etapas 4–6).
4. **Marco D:** legado revisado, novos cadastros sob regra e liberação validada (Etapas 7–8).
