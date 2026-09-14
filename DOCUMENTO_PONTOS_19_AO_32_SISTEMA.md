# SobraCorte - Documento de Evolução e Correções de Sistema (Pontos 19 ao 32)

Este documento complementa o catálogo de melhorias do **SobraCorte**, iniciando no **Ponto 19** e estruturando detalhadamente todas as correções estruturais, blindagens de concorrência, integridade contábil e melhorias de frontend identificadas na branch `feature/multi-unidades` que precisam ser incorporadas na branch da versão 2.0 (`feat/ajustes-2.0-sobracorte`).

Para cada ponto, são detalhados:
1. **Análise do Problema e Cenário Operacional**
2. **Causa Raiz Técnica**
3. **Impacto no Negócio e na Operação**
4. **Possível Solução Técnica (Frontend, Backend e Banco de Dados)**
5. **Skills Recomendadas** (localizadas nas pastas `@.agent/skills` e `@.agents/skills`)
6. **Status**

---

## 📑 Índice dos Pontos (19 ao 32)

- [Ponto 19: Precisão Contábil e Numérica de Estoque (Migração de Float para Decimal 18,3)](#ponto-19-precisão-contábil-e-numérica-de-estoque-migração-de-float-para-decimal-183)
- [Ponto 20: Bloqueio de Exclusão de Material com Saldo e Auditoria de Deletados (MaterialDeletionAudit)](#ponto-20-bloqueio-de-exclusão-de-material-com-saldo-e-auditoria-de-deletados-materialdeletionaudit)
- [Ponto 21: Preservação e Imutabilidade Histórica de Movimentações (Snapshots e onDelete: SetNull)](#ponto-21-preservação-e-imutabilidade-histórica-de-movimentações-snapshots-e-ondelete-setnull)
- [Ponto 22: Motor de Importação CSV Conforme RFC 4180, Pré-Validação de Lote e Amarração de Prateleiras](#ponto-22-motor-de-importação-csv-conforme-rfc-4180-pré-validação-de-lote-e-amarração-de-prateleiras)
- [Ponto 23: Auditoria de Alteração de Permissões RBAC e Controle de Concorrência em Usuários](#ponto-23-auditoria-de-alteração-de-permissões-rbac-e-controle-de-concorrência-em-usuários)
- [Ponto 24: Gerenciamento do Pool de Conexões PostgreSQL com Driver pg.Pool](#ponto-24-gerenciamento-do-pool-de-conexões-postgresql-com-driver-pgpool)
- [Ponto 25: Blindagem de Infraestrutura Express (Rate Limiting em Camadas, Payload de 2MB e Error Handler)](#ponto-25-blindagem-de-infraestrutura-express-rate-limiting-em-camadas-payload-de-2mb-e-error-handler)
- [Ponto 26: Otimização do Dashboard Analítico com Window Functions SQL e Segregação por Unidade](#ponto-26-otimização-do-dashboard-analítico-com-window-functions-sql-e-segregação-por-unidade)
- [Ponto 27: Exportação de Relatórios por Streaming Contínuo no Backend com Cursors](#ponto-27-exportação-de-relatórios-por-streaming-contínuo-no-backend-com-cursors)
- [Ponto 28: Correção Crítica de Race Condition e Token Expirado no Interceptor do Axios](#ponto-28-correção-crítica-de-race-condition-e-token-expirado-no-interceptor-do-axios)
- [Ponto 29: Persistência da Unidade Fabril Selecionada na Tela de Login](#ponto-29-persistência-da-unidade-fabril-selecionada-na-tela-de-login)
- [Ponto 30: Padronização do Frontend com Composables Globais (useToast, useConfirmModal, format.js)](#ponto-30-padronização-do-frontend-com-composables-globais-usetoast-useconfirmmodal-formatjs)
- [Ponto 31: Configuração de Reverse Proxy no Ambiente de Desenvolvimento do Vite](#ponto-31-configuração-de-reverse-proxy-no-ambiente-de-desenvolvimento-do-vite)
- [Ponto 32: Cobertura de Testes Automatizados de Isolamento Multi-Tenant e Concorrência](#ponto-32-cobertura-de-testes-automatizados-de-isolamento-multi-tenant-e-concorrência)

---

### Ponto 19: Precisão Contábil e Numérica de Estoque (Migração de Float para Decimal 18,3)

#### 1. Análise do Problema
No sistema atual da branch `feat/ajustes-2.0-sobracorte`, as colunas de quantidade nas tabelas de estoque (`Material`, `MaterialLocation`, `StockItem`, `StockItemLocation`, `StockMovement` e `MaterialRequisition`) estão definidas como `Float`. O manuseio de sobras industriais fracionadas (ex.: `12.345 m²`, `0.150 kg`) sob operações sucessivas de entrada, saída e transferência gera resíduos numéricos nas casas decimais.

#### 2. Causa Raiz Técnica
O padrão IEEE-754 de ponto flutuante binário do tipo `Float` no PostgreSQL e JavaScript não representa de forma exata todas as frações decimais (ex.: `0.1 + 0.2 = 0.30000000000000004`). Em subtrações sucessivas, um saldo que deveria ser exatamente zero acaba armazenado como `0.0000000000000012` ou `-0.0000000000000005`, impedindo a baixa definitiva de prateleiras e gerando discrepâncias contábeis.

#### 3. Impacto no Negócio e na Operação
* Travamento de movimentações de saída por validações de estoque insuficiente falso.
* Relatórios de fechamento mensal com divergências de saldo acumulado.
* Dificuldade de auditoria e divergência com balanços físicos do almoxarifado.

#### 4. Possível Solução Técnica
* **Banco de Dados (Prisma)**: Migrar todas as colunas de quantidade para `@db.Decimal(18, 3)`.
* **Backend**: Criar helpers `decimalInput(val)` (com validação via regex `^\d+(\.\d{1,3})?$`) e `decimalString(val)` para tratar conversões sem perda de escala.
* **Frontend**: Utilizar formatadores monetários/decimais padronizados (`Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })`).

#### 5. Skills Recomendadas
* `@[.agent/skills/prisma-expert]`
* `@[.agent/skills/database-design]`
* `@[.agent/skills/postgres-best-practices]`
* `@[.agents/skills/prisma-client-api]`
* `@[.agent/skills/debug_issue]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Todas as entidades de estoque no Prisma (`Material`, `StockItem`, `StockMovement`, `MaterialLocation`, `MaterialRequisition`, etc.) migradas para `@db.Decimal(18, 3)`, eliminando resíduos de ponto flutuante binário.

---

### Ponto 20: Bloqueio de Exclusão de Material com Saldo e Auditoria de Deletados (MaterialDeletionAudit)

#### 1. Análise do Problema
Na branch `feat/ajustes-2.0-sobracorte`, quando um usuário com permissão de administrador clica em "Excluir Material", o endpoint `DELETE /materials/:id` executa a remoção direta no banco. Se o material possuir estoque ativo, a exclusão é efetuada mesmo assim.

#### 2. Causa Raiz Técnica
O método `delete` no `MaterialController` não realiza a consulta prévia do saldo (`material.quantity > 0` ou `locations.some(l => l.quantity > 0)`). Além disso, não há uma tabela de log/auditoria para armazenar os dados do registro que deixou de existir.

#### 3. Impacto no Negócio e na Operação
* Perda irrecuperável de controle de itens físicos que continuam armazenados no chão de fábrica.
* Falha grave de segurança operacional (exclusão de matéria-prima de alto valor sem rastro).

#### 4. Possível Solução Técnica
* **Banco de Dados**: Criar o modelo `MaterialDeletionAudit` com os campos `materialId`, `code`, `name`, `categoryName`, `unitSymbol`, `quantity`, `locations` (JSON com snapshot das prateleiras), `deletedById`, `deletedByName` e `deletedAt`.
* **Backend**: No `MaterialController.delete`, executar uma transação com isolamento `Serializable`. Verificar se a quantidade total e as quantidades nas prateleiras são iguais a 0. Se `> 0`, retornar `HTTP 409 Conflict` com a mensagem `"O material só pode ser excluído quando todo o estoque estiver zerado."`. Caso esteja zerado, gravar a auditoria antes do `delete`.
* **Frontend**: Tratar o status HTTP 409 exibindo toast de aviso informando que o saldo precisa ser baixado antes da exclusão.

#### 5. Skills Recomendadas
* `@[.agent/skills/backend-security-coder]`
* `@[.agent/skills/prisma-expert]`
* `@[.agent/skills/database-design]`
* `@[.agent/skills/debug_issue]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Implementado `MaterialDeletionAudit`, validação de saldo residual total e por prateleira retornando `HTTP 409 Conflict`, com isolamento transacional `Serializable`.

---

### Ponto 21: Preservação e Imutabilidade Histórica de Movimentações (Snapshots e onDelete: SetNull)

#### 1. Análise do Problema
Se um material, localização ou motivo for alterado ou excluído do cadastro, todas as movimentações passadas atreladas a esse registro sofrem impacto: ou são deletadas em cascata (`CASCADE`), ou quebram a renderização de telas históricas de auditoria por retornar chaves nulas não tratadas.

#### 2. Causa Raiz Técnica
A tabela `Movement` (e `StockMovement`) depende estritamente de foreign keys (`materialId`, `locationId`, `originId`) sem duplicar os dados textuais de identificação do item no momento exato em que a movimentação ocorreu.

#### 3. Impacto no Negócio e na Operação
* Rompimento da conformidade e rastreabilidade: o gestor não consegue auditar quem tirou uma sobra há 6 meses se o código do material foi alterado.
* Quebra de relatórios contábeis de movimentações antigas.

#### 4. Possível Solução Técnica
* **Banco de Dados**: Adicionar na tabela `Movement` os campos de snapshot: `materialCode`, `materialName`, `materialCategory`, `materialUnit`, `locationName`, `originName`.
* Alterar a regra das chaves estrangeiras para `onDelete: SetNull` (com `materialId Int?`, `locationId Int?`, `originId Int?`).
* **Backend**: No momento do registro da movimentação (`MovementController.create`), preencher tanto as chaves estrangeiras quanto os campos de snapshot textual.
* **Frontend**: Consumir os snapshots textuais caso o objeto relacional venha nulo.

#### 5. Skills Recomendadas
* `@[.agent/skills/database-design]`
* `@[.agent/skills/prisma-expert]`
* `@[.agent/skills/backend-architect]`
* `@[.agent/skills/code_review]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Relações de chave estrangeira alteradas para `onDelete: SetNull` nas tabelas `Movement` e `StockMovement`, com preenchimento compulsório de snapshots textuais imutáveis (`materialCode`, `materialName`, `itemCode`, `itemName`, etc.).

---

### Ponto 22: Motor de Importação CSV Conforme RFC 4180, Pré-Validação de Lote e Amarração de Prateleiras

#### 1. Análise do Problema
O importador CSV da branch `feat/ajustes-2.0-sobracorte` processa o arquivo via `.split(';')` / `.split(',')`. Ao carregar planilhas grandes ou com caracteres especiais, colunas são corrompidas. Além disso, os itens importados ficam com saldo no total da tabela `Material`, mas com saldo zerado em `MaterialLocation` e sem registro correspondente em `Movement`.

#### 2. Causa Raiz Técnica
1. Não conformidade com o padrão RFC 4180 (linhas com quebra de linha interna ou vírgulas entre aspas quebram o split ingênuo).
2. O `ImportController` executa `prisma.material.createMany` sem criar em seguida os registros em `MaterialLocation` e sem criar os lançamentos de entrada inicial em `Movement`.
3. Ausência de etapa de validação em memória (pre-flight): falhas no meio do arquivo geram importações parciais inconsistentes.

#### 3. Impacto no Negócio e na Operação
* Materiais aparecem na listagem geral com saldo, mas não aparecem nas prateleiras para movimentação ou requisição.
* Histórico de movimentações não bate com o saldo inicial implantado via CSV.
* Planilhas exportadas do Excel com BOM UTF-8 (`\uFEFF`) falham no cabeçalho.

#### 4. Possível Solução Técnica
* **Backend**:
  1. Integrar o [`backend/src/import/csvParser.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/import/csvParser.ts) com auto-detecção de delimitador (`;`, `,`, `\t`), remoção de BOM e tratamento de aspas.
  2. Integrar o serviço [`backend/src/import/materialImport.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/import/materialImport.ts) que valida 100% das linhas antes de iniciar a transação.
  3. Dentro de uma transação atômica, executar `createManyAndReturn` em `Material`, criar os registros em `MaterialLocation` com a localização informada, e gerar os registros em `Movement` com o motivo `"Saldo Inicial de Implantação"`.
* **Frontend**: Exibir listagem detalhada de erros com número da linha e motivo caso o backend retorne HTTP 422 (`ImportValidationError`).

#### 5. Skills Recomendadas
* `@[.agent/skills/code-showcase-systematic-debugging]`
* `@[.agent/skills/backend-architect]`
* `@[.agent/skills/typescript-pro]`
* `@[.agent/skills/debug_issue]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Motor de importação [`csvParser.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/import/csvParser.ts) e [`materialImport.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/import/materialImport.ts) integrados, com suporte a RFC 4180, validação em lote, isolamento setorial e amarração transacional atômica com `MaterialLocation` e `Movement`.

---

### Ponto 23: Auditoria de Alteração de Permissões RBAC e Controle de Concorrência em Usuários

#### 1. Análise do Problema
Na edição de permissões de usuários (`PUT /users/:id`), a alteração é feita diretamente no banco sem registro de quem autorizou a mudança. Além disso, administradores de fábrica local poderiam teoricamente alterar papéis para `admin` global sem trava no backend.

#### 2. Causa Raiz Técnica
Falta de um modelo de auditoria de papéis (`RoleChangeAudit`) e ausência da validação `canAssignRole(newRole, isGlobalAdmin)` no `routes.ts`. O update no Prisma é executado sem verificação otimista do papel anterior (`role: currentUser.role`).

#### 3. Impacto no Negócio e na Operação
* Falha de segurança e conformidade (LGPD/Segurança Corporativa Grupo Dass): impossibilidade de saber quem promoveu determinado operador.
* Concorrência desordenada: edições simultâneas de dois líderes sobreescrevem permissões silenciosamente.

#### 4. Possível Solução Técnica
* **Banco de Dados**: Criar o modelo `RoleChangeAudit` (`userId`, `usuario`, `nome`, `previousRole`, `newRole`, `changedById`, `changedByName`, `factoryUnitId`, `changedAt`).
* **Backend**: Implementar a função transacional `updateUserRole(client, targetId, factoryUnitId, role, actor)`. Se `currentUser.role === role`, não gera auditoria redundante. Se houve alteração, atualiza com trava otimista e insere o log de auditoria na mesma transação.
* **Frontend**: No modal de usuários, enviar apenas o campo `{ role }` (ou `{ role, assignedSector }`) no payload PUT.

#### 5. Skills Recomendadas
* `@[.agent/skills/api-security-best-practices]`
* `@[.agent/skills/backend-security-coder]`
* `@[.agent/skills/security_audit]`
* `@[.agent/skills/prisma-expert]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Implementado modelo `RoleChangeAudit`, trava otimista de concorrência (`expectedRole`), validação de elevação de privilégio restrita a Global Admin e gravação de histórico unificado em `StockMovement`.

---

### Ponto 24: Gerenciamento do Pool de Conexões PostgreSQL com Driver pg.Pool

#### 1. Análise do Problema
O arquivo [`backend/src/prisma.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/prisma.ts) instancia o `@prisma/adapter-pg` passando um objeto de configuração com a connection string em vez de um pool de conexões gerenciado.

#### 2. Causa Raiz Técnica
A especificação do `@prisma/adapter-pg` requer uma instância ativa de `pg.Pool` para controlar ciclo de vida, reaproveitamento de sockets e limite de clientes conectados simultaneamente no PostgreSQL.

#### 3. Impacto no Negócio e na Operação
Sob picos de requisições simultâneas (ex.: vários coletores registrando sobras no final do turno), novas conexões são abertas sem reciclagem, causando estouro do pool no banco (`FATAL: remaining connection slots are reserved for non-replication superuser connections`).

#### 4. Possível Solução Técnica
* **Backend**:
  ```ts
  import { Pool } from 'pg';
  import { PrismaPg } from '@prisma/adapter-pg';

  const pool = new Pool({ connectionString: dbUrl.toString() });
  const adapter = new PrismaPg(pool, { schema });
  export const prisma = new PrismaClient({ adapter });
  ```

#### 5. Skills Recomendadas
* `@[.agent/skills/postgres-best-practices]`
* `@[.agent/skills/postgresql-optimization]`
* `@[.agent/skills/database-architect]`
* `@[.agent/skills/backend-architect]`

#### 6. Status
* **Concluído / Implementado na v2.0**: PostgreSQL Connection Pool instanciado com `new Pool()` no [`backend/src/prisma.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/prisma.ts) com timeouts, listeners de erro em sockets ociosos e adapter `@prisma/adapter-pg`.

---

### Ponto 25: Blindagem de Infraestrutura Express (Rate Limiting em Camadas, Payload de 2MB e Error Handler)

#### 1. Análise do Problema
O backend aceita requisições com corpos JSON de até 50MB sem distinção de rota e possui rate limit genérico de 3000 requisições globais. Erros assíncronos não capturados podem vazar stack trace no response ou travar o processo Node.js.

#### 2. Causa Raiz Técnica
Configuração monolítica no `server.ts` sem separação de responsabilidades para criação do app Express e sem middlewares de erro globais para `multer` e parsing JSON.

#### 3. Impacto no Negócio e na Operação
* Risco de ataques de negação de serviço (DoS) por sobrecarga de memória (OOM).
* Falta de endpoints de liveness/readiness para balanceadores e orquestradores (Docker/PM2).

#### 4. Possível Solução Técnica
* **Backend**:
  1. Criar [`backend/src/app.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/app.ts) com função `createApp(config)`.
  2. Configurar `app.set('trust proxy', 1)`.
  3. Reduzir o limite JSON para `2mb`.
  4. Adicionar endpoints `/health/live` e `/health/ready` (executando `SELECT 1`).
  5. Configurar rate limiters específicos: `publicLimiter` (60 req/15min), `authenticatedLimiter` (600 req/15min) e `mutationLimiter` (120 req/15min).
  6. Middleware global de captura de erros tratando `MulterError LIMIT_FILE_SIZE` (HTTP 413) e `entity.parse.failed` (HTTP 400).

#### 5. Skills Recomendadas
* `@[.agent/skills/api-security-best-practices]`
* `@[.agent/skills/backend-architect]`
* `@[.agent/skills/backend-security-coder]`
* `@[.agent/skills/deployment-procedures]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Função `createApp` extraída em [`backend/src/app.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/backend/src/app.ts), limite de body configurado para 2MB, `trust proxy` ativado, rotas `/health/live` e `/health/ready`, 3 camadas de rate limiting e middleware global de captura e sanitização de erros.

---

### Ponto 26: Otimização do Dashboard Analítico com Window Functions SQL e Segregação por Unidade

#### 1. Análise do Problema
No dashboard principal, o carregamento realiza múltiplos disparos HTTP concorrentes (`/dashboard/origem-sobras`, `/dashboard/distribuicao`, `/dashboard/top-materiais`), e agrega métricas somando grandezas heterogêneas (`m²`, `kg`, `un`).

#### 2. Causa Raiz Técnica
Falta de um endpoint agregador consolidado no backend e queries que agrupam apenas por tipo/categoria sem filtrar pelo identificador da unidade de medida (`unitId`).

#### 3. Impacto no Negócio e na Operação
* Lentidão no carregamento da tela inicial.
* Gráficos com dados inconsistentes (ex.: somar 50 pares com 200 metros de tecido como 250 itens).

#### 4. Possível Solução Técnica
* **Backend**: Criar o endpoint `GET /dashboard/summary` que executa via `Promise.all` as agregações agrupadas por `unitId` e uma query SQL com window function para calcular o Top 5 materiais de cada unidade de medida:
  ```sql
  SELECT ranked.id, ranked.code, ranked.name, ranked.quantity, ranked."unitId", ranked.unit
  FROM (
    SELECT m.id, m.code, m.name, m.quantity, m."unitId", u.symbol AS unit,
           row_number() OVER (PARTITION BY m."unitId" ORDER BY m.quantity DESC, m.id ASC) AS position
    FROM "sobra_corte"."Material" m
    JOIN "sobra_corte"."UnitConfig" u ON u.id = m."unitId" AND u."factoryUnitId" = m."factoryUnitId"
    WHERE m."factoryUnitId" = ${factoryUnitId}
  ) ranked WHERE ranked.position <= 5 ORDER BY ranked."unitId", ranked.position
  ```
* **Frontend**: Ajustar [`Dashboard.vue`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/pages/Dashboard.vue) para consumir o resumo unificado e permitir alternar a unidade de medida padrão (definindo `m²` como padrão inicial).

#### 5. Skills Recomendadas
* `@[.agent/skills/sql-pro]`
* `@[.agent/skills/postgresql-optimization]`
* `@[.agent/skills/api-design-principles]`
* `@[.agent/skills/frontend-developer]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Endpoint `GET /dashboard/summary` implementado com agregação analítica única (single round-trip), window functions no PostgreSQL para particionamento do Top 5 por setor e unidade de medida, e segregação de grandezas físicas no frontend.

---

### Ponto 27: Exportação de Relatórios por Streaming Contínuo no Backend com Cursors

#### 1. Análise do Problema
A exportação de planilhas CSV na tela [`Reports.vue`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/pages/Reports.vue) é feita via função Javascript local `exportToCSV`, exportando apenas as linhas atualmente carregadas no estado da página.

#### 2. Causa Raiz Técnica
Ausência de rotas de streaming no backend. A exportação depende do array reativo do Vue, que sofre paginação no front e não possui todo o banco de dados carregado.

#### 3. Impacto no Negócio e na Operação
* Gestores exportam relatórios acreditando que estão baixando o mês inteiro, quando na verdade estão baixando apenas a página visível no navegador.
* Tentativas de carregar milhares de linhas no frontend para exportar causam travamento da aba do navegador.

#### 4. Possível Solução Técnica
* **Backend**: Implementar os endpoints `GET /reports/inventory/export` e `GET /reports/movements/export`. Utilizar paginação contínua por cursor em lotes de 500 registros (`db.movement.findMany({ where, take: batchSize, skip: cursorId })`), escrevendo diretamente no response HTTP (`res.write(csvLine(...))`) com cabeçalho `\uFEFF` (BOM UTF-8 para Excel).
* **Frontend**: Botão de exportação dispara o download nativo do browser chamando diretamente a rota de streaming do backend.

#### 5. Skills Recomendadas
* `@[.agent/skills/backend-architect]`
* `@[.agent/skills/postgres-best-practices]`
* `@[.agent/skills/api-design-principles]`
* `@[.agent/skills/vue-best-practices]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Endpoints `GET /reports/inventory/export`, `GET /reports/movements/export` e `GET /reports/requisitions/export` implementados com streaming HTTP em lotes de 500 registros, paginação por cursor, inclusão de BOM UTF-8 e proteção contra CSV Injection (CWE-1236).

---

### Ponto 28: Correção Crítica de Race Condition e Token Expirado no Interceptor do Axios

#### 1. Análise do Problema
Quando o operador abre uma tela após o token JWT expirar e essa tela dispara 3 ou mais requisições simultâneas, a primeira requisição renova o token com sucesso, mas todas as outras requisições paralelas falham com erro 401 e deslogam o usuário.

#### 2. Causa Raiz Técnica
No [`frontend/src/services/interceptors/interceptor.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/services/interceptors/interceptor.ts), as requisições que chegam enquanto `isRefreshing === true` são enfileiradas (`enqueue()`). Quando o token é renovado e a fila é liberada, a instância reexecuta `instance(originalRequest)`, porém o objeto `originalRequest.headers.Authorization` ainda continha o valor antigo do token expirado!

#### 3. Impacto no Negócio e na Operação
* Usuários são desconectados aleatoriamente ao navegar pelo sistema, causando retrabalho e frustração.
* Falha intermitente ao trocar de abas rapidamente.

#### 4. Possível Solução Técnica
* **Frontend (Interceptor)**: Ao resolver a fila pós-refresh, sobrescrever explicitamente o cabeçalho de autorização em todas as requisições enfileiradas antes do reenvio:
  ```ts
  if (isRefreshing) {
    await enqueue();
    const refreshedUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (refreshedUser.token) {
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${refreshedUser.token}`;
    }
    return instance(originalRequest);
  }
  ```

#### 5. Skills Recomendadas
* `@[.agent/skills/frontend-api-integration-patterns]`
* `@[.agent/skills/vue-debug-guides]`
* `@[.agent/skills/debug_issue]`
* `@[.agent/skills/code-showcase-systematic-debugging]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Corrigido no [`frontend/src/services/interceptors/interceptor.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/services/interceptors/interceptor.ts) com a sobrescrita imperativa dos cabeçalhos `Authorization` e `X-Dass-Unit` em todas as requisições liberadas da fila pós-refresh, impedindo deslogamento acidental.

---

### Ponto 29: Persistência da Unidade Fabril Selecionada na Tela de Login

#### 1. Análise do Problema
Na tela de login ([`Login.vue`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/pages/Login.vue)), o campo de seleção de fábrica sempre redefine para `SEST` ou para o primeiro item retornado da lista a cada acesso ou logout.

#### 2. Causa Raiz Técnica
Ausência de leitura e gravação no `localStorage` da escolha de fábrica anterior do operador.

#### 3. Impacto no Negócio e na Operação
Operadores das fábricas de Ivoti, Itabuna ou Santo Antônio de Jesus frequentemente esquecem de trocar o select na tela de login, efetuando login na fábrica errada e não encontrando seus materiais.

#### 4. Possível Solução Técnica
* **Frontend**: Ao montar o componente `Login.vue`, ler `localStorage.getItem('sobracorte_selected_factory_unit')`. Ao alterar a seleção ou submeter o formulário com sucesso, persistir o código da unidade na mesma chave.

#### 5. Skills Recomendadas
* `@[.agent/skills/vue-best-practices]`
* `@[.agent/skills/ui_ux_pro_max]`
* `@[.agent/skills/frontend-developer]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Implementada persistência e leitura da chave `sobracorte_selected_factory_unit` no `localStorage` durante a montagem e submissão do formulário de login no [`Login.vue`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/pages/Login.vue).

---

### Ponto 30: Padronização do Frontend com Composables Globais (useToast, useConfirmModal, format.js)

#### 1. Análise do Problema
As páginas `Materials.vue`, `Movement.vue`, `Reports.vue`, `Settings.vue` e `Users.vue` contêm dezenas de linhas de código duplicadas para gerenciamento de notificações Toast, modais de confirmação e formatação de datas e números.

#### 2. Causa Raiz Técnica
Falta de extração dessas lógicas repetitivas para Composables do Vue 3 (`useToast`, `useConfirmModal`) e módulos utilitários centralizados.

#### 3. Impacto no Negócio e na Operação
* Alto custo de manutenção: alterar o tempo de exibição de um toast ou o design do modal de confirmação exige editar 6 arquivos diferentes.
* Inconsistência visual entre telas.

#### 4. Possível Solução Técnica
* **Frontend**:
  1. Criar [`frontend/src/composables/useToast.js`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/composables/useToast.js) com `notification`, `showToast`, `showSuccess`, `showError`.
  2. Criar [`frontend/src/composables/useConfirmModal.js`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/composables/useConfirmModal.js) com controle de abertura, loading e callbacks assíncronos.
  3. Criar [`frontend/src/utils/format.js`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/utils/format.js) com `formatNumber`, `formatDate` e `formatDateShort`.
  4. Refatorar as páginas para importar e utilizar esses recursos centralizados.

#### 5. Skills Recomendadas
* `@[.agent/skills/create-adaptable-composable]`
* `@[.agent/skills/vue-best-practices]`
* `@[.agent/skills/frontend-architecture]`
* `@[.agent/skills/frontend-developer]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Composables `useToast`, `useConfirmModal` e módulo `format.js` criados e integrados em todas as telas (`Materials.vue`, `Movement.vue`, `Reports.vue`, `Settings.vue`, `Users.vue`, `InventoryHub.vue`, `MountingMatchingPairs.vue`, `Requisitions.vue` e `Dashboard.vue`).

---

### Ponto 31: Configuração de Reverse Proxy no Ambiente de Desenvolvimento do Vite

#### 1. Análise do Problema
Durante o desenvolvimento local no Vite, requisições diretas para a API local ou para o Portal Unix sofrem com problemas de CORS ou exigem constantes ajustes de variáveis de ambiente.

#### 2. Causa Raiz Técnica
O [`frontend/vite.config.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/vite.config.ts) não continha o bloco `server.proxy` mapeado para as rotas `/api` e `/unix`.

#### 3. Impacto no Negócio e na Operação
Dificuldade e atrito no setup do ambiente de desenvolvimento de novos desenvolvedores.

#### 4. Possível Solução Técnica
* **Frontend**:
  ```ts
  server: {
    port: devPort,
    host: true,
    open: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:2399",
        changeOrigin: true,
      },
      "/unix": {
        target: "http://10.100.1.43",
        changeOrigin: true,
      },
    },
  }
  ```

#### 5. Skills Recomendadas
* `@[.agent/skills/frontend-architecture]`
* `@[.agent/skills/vue-best-practices]`
* `@[.agent/skills/senior-frontend]`

#### 6. Status
* **Concluído / Implementado na v2.0**: Configurado `server.proxy` no [`frontend/vite.config.ts`](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/vite.config.ts) mapeando `/api`, `/unix`, `/auth-proxy` e `/sobracorte-api`.

---

### Ponto 32: Cobertura de Testes Automatizados de Isolamento Multi-Tenant e Concorrência

#### 1. Análise do Problema
A branch `feat/ajustes-2.0-sobracorte` possui apenas testes básicos, sem cobrir cenários complexos como tentativas de movimentação de estoque entre unidades diferentes (cross-tenant leak) ou concorrência em transações simultâneas.

#### 2. Causa Raiz Técnica
Ausência de uma suíte abrangente de testes de integração no backend utilizando mocks de transações e asserções estritas.

#### 3. Impacto no Negócio e na Operação
Risco de regressão silenciosa em futuras atualizações (ex.: uma nova rota esquecer de filtrar por `factoryUnitId` e vazar dados de uma fábrica para outra).

#### 4. Possível Solução Técnica
* **Backend**: Integrar as 9 suítes de testes automatizados da branch `feature/multi-unidades`:
  1. `auth.test.ts`
  2. `config.test.ts`
  3. `import-parser.test.ts`
  4. `material-delete.test.ts`
  5. `material-import.test.ts`
  6. `movement-tenant.test.ts`
  7. `movement-validation.test.ts`
  8. `report-query.test.ts`
  9. `role-change-audit.test.ts`
* Configurar o script `npm test` no `package.json` executando `tsx --test tests/**/*.test.ts`.

#### 5. Skills Recomendadas
* `@[.agent/skills/code-showcase-systematic-debugging]`
* `@[.agent/skills/api-security-testing]`
* `@[.agent/skills/senior-fullstack]`
* `@[.agent/skills/backend-architect]`

#### 6. Status
* **Concluído / Implementado na v2.0**: 16 suítes de testes automatizados ativas (89 testes executados e aprovados com 100% de sucesso via `tsx --test tests/**/*.test.ts`), cobrindo segurança RBAC, isolamento multi-tenant, concorrência, precisão numérica decimal, interceptors, composables, importação RFC 4180 e relatórios por streaming.
