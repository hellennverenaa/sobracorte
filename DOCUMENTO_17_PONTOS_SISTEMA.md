# SobraCorte - Documento Consolidado de Pontos do Sistema (18 Pontos)

Este documento reúne de forma detalhada todos os **18 pontos** mapeados para evolução, correção de bugs, governança operacional e escalabilidade multi-unidade do ecossistema **SobraCorte**. 

Para cada ponto, são detalhados:
1. **O Problema e Cenário Operacional**
2. **Causa Raiz Técnica**
3. **Possível Solução Técnica (Frontend, Backend e Banco de Dados)**
4. **Skills Recomendadas** (localizadas em `.agent/skills` e `.agents/skills`)
5. **Status Atual**

---

## Índice Rápido dos Pontos

1. [Ponto 1: Desacoplamento de Setores Operacionais x Cargos de RH e Isolamento Operacional](#ponto-1-desacoplamento-de-setores-operacionais-x-cargos-de-rh-e-isolamento-operacional)
2. [Ponto 2: Governança e Regras Rígidas de Aprovação de Requisições](#ponto-2-governança-e-regras-rígidas-de-aprovação-de-requisições)
3. [Ponto 3: Pré-Fabricado – Controle de Solas, Tipo de Material e Gestão de Lado](#ponto-3-pré-fabricado--controle-de-solas-tipo-de-material-e-gestão-de-lado)
4. [Ponto 4: Distribuição (ex-Expedição) – Recepção de Cabedais e Solas Processadas](#ponto-4-distribuição-ex-expedição--recepção-de-cabedais-e-solas-processadas)
5. [Ponto 5: Autocomplete e Busca Otimizada de Combinações](#ponto-5-autocomplete-e-busca-otimizada-de-combinações)
6. [Ponto 6: Validação Estrita de Dados de Entrada no Setor de Apoio](#ponto-6-validação-estrita-de-dados-de-entrada-no-setor-de-apoio)
7. [Ponto 7: Padronização Rígida de Unidades de Medida Fixas por Setor](#ponto-7-padronização-rígida-de-unidades-de-medida-fixas-por-setor)
8. [Ponto 8: Tratamento Especial para Papel de Sublimação (Metros Lineares vs Rendimento)](#ponto-8-tratamento-especial-para-papel-de-sublimação-metros-lineares-vs-rendimento)
9. [Ponto 9: Higienização e Formatação Automática do Campo "Combinação"](#ponto-9-higienização-e-formatação-automática-do-campo-combinação)
10. [Ponto 10: Sincronização do Dashboard: Casamento de Pares e Requisições Atendidas](#ponto-10-sincronização-do-dashboard-casamento-de-pares-e-requisições-atendidas)
11. [Ponto 11: Formulários Dinâmicos e Flexíveis Adaptados por Setor](#ponto-11-formulários-dinâmicos-e-flexíveis-adaptados-por-setor)
12. [Ponto 12: Correção do Bug de Loading em Requisições e Feedback de Validação na Transferência](#ponto-12-correção-do-bug-de-loading-em-requisições-e-feedback-de-validação-na-transferência)
13. [Ponto 13: Saldo Visual na Transferência Parcial (Item com 5 não reduz visualmente para 4)](#ponto-13-saldo-visual-na-transferência-parcial-item-com-5-não-reduz-visualmente-para-4)
14. [Ponto 14: Bloqueio de Transferência Cruzada Indevida Entre Setores Diferentes](#ponto-14-bloqueio-de-transferência-cruzada-indevida-entre-setores-diferentes)
15. [Ponto 15: Card Dinâmico de Pares Casados e Formáveis no Dashboard por Setor](#ponto-15-card-dinâmico-de-pares-casados-e-formáveis-no-dashboard-por-setor)
16. [Ponto 16: Habilitação de "Combinação" no Setor de Montagem](#ponto-16-habilitação-de-combinação-no-setor-de-montagem)
17. [Ponto 17: Ativação/Desativação Modular da Aba de Requisições por Unidade Fabril](#ponto-17-ativaçãodesativação-modular-da-aba-de-requisições-por-unidade-fabril)
18. [Ponto 18: Visão Dupla nos Relatórios: Quantidade de Operações (Lançamentos) e Volume Físico Total (Cards Duplos Integrados)](#ponto-18-visão-dupla-nos-relatórios-quantidade-de-operações-lançamentos-e-volume-físico-total-cards-duplos-integrados)

---

### Ponto 1: Desacoplamento de Setores Operacionais x Cargos de RH e Isolamento Operacional

#### 1. O Problema
No início, o sistema atrelava permissões de acesso ao cargo formal de RH (`UserRole`), misturando papéis como encarregado de almoxarifado, líder de linha e operadores aos setores físicos da fábrica (`CORTE`, `APOIO`, `MONTAGEM`, `PRE_FABRICADO`, `DISTRIBUICAO`). Além disso, locais de armazenamento (`Location`) e categorias (`CategoryConfig`) podiam ser visualizados e selecionados indiscriminadamente entre setores distintos, gerando quebra de escopo operacional. Outro detalhe importante foi a nomenclatura: o setor antigamente chamado de `EXPEDICAO` precisava ser padronizado para `DISTRIBUICAO`.

#### 2. Causa Raiz Técnica
- Modelagem do Prisma atrelando `Role` diretamente a acessos de tela sem uma tabela ou enum claro de `SectorType` desacoplado.
- Queries no Prisma sem filtro explícito de `sector` e `factoryUnitId`.
- Componentes Vue consumindo stores genéricas sem filtrar as opções pelo setor ativo da sessão do operador.

#### 3. Possível Solução Técnica
- **Banco de Dados**: Criação/manutenção do enum `SectorType` (`CORTE`, `APOIO`, `MONTAGEM`, `PRE_FABRICADO`, `DISTRIBUICAO`). Vincular `Location.sector` e `CategoryConfig.sector`.
- **Backend**: Desacoplar `Role` (permissão funcional: `admin`, `leader`, `operator`, `viewer`) do `assignedSector` (setor operacional onde atua). Nas APIs de consulta (`StockItemService.searchUnified`), injetar obrigatoriamente `where: { sector: user.assignedSector }` caso o usuário não seja `admin_master`.
- **Frontend**: Ajustar menus laterais, filtros e cabeçalhos para refletir `DISTRIBUICAO` em vez de `EXPEDICAO`. Filtrar rotas e listagens com base no setor do usuário logado.

#### 4. Skills Recomendadas
- `backend-architect`
- `database-design`
- `backend-security-coder`
- `prisma-client-api`

#### 5. Status
- **Em andamento / Estruturado**: Enum `SectorType` e isolamentos principais já criados; filtros refinados aplicados no Ponto 14.

---

### Ponto 2: Governança e Regras Rígidas de Aprovação de Requisições

#### 1. O Problema
Qualquer usuário com permissão de líder ou operador conseguia atender e aprovar requisições de outros setores. Um líder do Apoio podia aprovar a saída de sobras da Montagem ou do Corte, quebrando o controle de inventário dos encarregados e a rastreabilidade de quem autorizou a saída dos materiais.

#### 2. Causa Raiz Técnica
- O endpoint `POST /api/requisitions/:id/fulfill` (ou status change) não validava se o setor do material requisitado era idêntico ao `assignedSector` do usuário autenticado no token JWT.

#### 3. Possível Solução Técnica
- **Backend**: No `RequisitionService.fulfillRequisition`, adicionar guarda estrita de autorização:
  ```typescript
  if (user.role !== 'admin') {
    if (user.assignedSector !== requisition.targetSector) {
      throw new ForbiddenError('Você só pode aprovar ou atender requisições do seu próprio setor.');
    }
  }
  ```
- **Frontend (`Requisitions.vue`)**: Esconder botões de ação ("Aprovar", "Atender", "Rejeitar") quando o item requisitado pertencer a um setor diferente do usuário logado (exceto se for `admin_master`). Adicionar badge visual de identificação do setor responsável.

#### 4. Skills Recomendadas
- `backend-security-coder`
- `api-security-best-practices`
- `vue-best-practices`

#### 5. Status
- **Mapeado e especificado** para revisão final junto à API de Requisições.

---

### Ponto 3: Pré-Fabricado – Controle de Solas, Tipo de Material e Gestão de Lado

#### 1. O Problema
No setor de Pré-Fabricado, as sobras são majoritariamente solas e componentes de sola. O sistema não exigia a especificação do material do solado (`EVA` vs `Borracha`), o que causava mistura de matérias-primas de custos e propriedades físicas distintas. Além disso, a gestão de pés soltos (`E` - Esquerdo, `D` - Direito) ou `PAR` necessitava de tratamento automático para cálculo de estoque balanceado.

#### 2. Causa Raiz Técnica
- Falta de campos no formulário de entrada para o setor `PRE_FABRICADO` e falta de campos específicos de composição no modelo `StockItem` ou `metadata`.
- Quando o operador cadastrava 10 pares, o sistema não calculava nem separava a equivalência de pés caso houvesse descarte unilateral.

#### 3. Possível Solução Técnica
- **Frontend**: Criar formulário contextual para `PRE_FABRICADO`:
  - Campo seletor de Tipo de Material obrigatório: `EVA` ou `Borracha`.
  - Campo de Lado: `E`, `D` ou `PAR`. Se for `PAR`, o sistema pode registrar o item como `PAR` ou oferecer a opção de desmembramento automático em `E` e `D` conforme a regra da fábrica.
- **Backend / Prisma**: Garantir que o campo `material` ou `description` receba o tipo de sola higienizado. Armazenar `footSide` de forma canônica (`E`, `D`, `PAR`).

#### 4. Skills Recomendadas
- `vue-best-practices`
- `typescript-expert`
- `prisma-client-api`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 4: Distribuição (ex-Expedição) – Recepção de Cabedais e Solas Processadas

#### 1. O Problema
O setor de Distribuição recebe sobras já processadas prontas para aproveitamento ou reenvio: cabedais costurados e solas preparadas. No fluxo anterior, não havia distinção clara entre esses dois tipos de peças no momento da entrada, faltavam atributos como SKU, Grade (numeração), Cor e Lado do cabedal.

#### 2. Causa Raiz Técnica
- O setor de Expedição original estava modelado apenas com campos genéricos de produto acabado, sem campos de componentes (cabedal / sola) e sem rastreabilidade de grade de calçados.

#### 3. Possível Solução Técnica
- **Frontend**: No formulário de cadastro de sobras para `DISTRIBUICAO`:
  - Seletor de Tipo de Componente: `Cabedal` ou `Sola Processada`.
  - Inputs para: Referência/SKU, Numeração/Grade (ex.: 35 a 44), Cor e Lado (`E`, `D`, `PAR`).
- **Backend / DB**: Mapear `DISTRIBUICAO` para salvar no `StockItem` com `sku`, `sizeGrade`, `color` e `footSide`, permitindo que o motor de busca unificada e o dashboard identifiquem os componentes.

#### 4. Skills Recomendadas
- `backend-architect`
- `database-migrations-sql-migrations`
- `vue-best-practices`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 5: Autocomplete e Busca Otimizada de Combinações

#### 1. O Problema
Ao cadastrar ou requisitar sobras, o campo "Combinação" era um campo de texto livre. Operadores digitavam variações do mesmo item (ex.: "PRETO/BRANCO", "PT/BC", "Preto-Branco", "PRETO BRANCO"), gerando centenas de combinações duplicadas no banco de dados e impossibilitando o agrupamento correto de saldo e casamento de pares.

#### 2. Causa Raiz Técnica
- Ausência de um endpoint de busca de valores distintos pré-existentes de combinação para o SKU selecionado.
- Frontend sem componente de `Combobox` / `Datalist` com sugestões dinâmicas.

#### 3. Possível Solução Técnica
- **Backend**: Criar endpoint otimizado:
  ```http
  GET /api/inventory/combinations?sku=...&sector=...
  ```
  Executando `SELECT DISTINCT combination FROM "StockItem" WHERE sku = :sku AND sector = :sector AND combination IS NOT NULL`.
- **Frontend**: Substituir o `<input type="text">` por um `<Combobox>` ou `<input list="combinations-list">` que busca as combinações já existentes para aquele SKU à medida que o usuário digita, permitindo selecionar uma existente ou criar uma nova padronizada.

#### 4. Skills Recomendadas
- `prisma-client-api`
- `vue-best-practices`
- `frontend-api-integration-patterns`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 6: Validação Estrita de Dados de Entrada no Setor de Apoio

#### 1. O Problema
No setor de Apoio (insumos, aviamentos, ilhoses, fivelas, linhas), operadores estavam conseguindo inserir letras, números negativos e números fracionados/decimais (ex.: "2.5 ilhoses" ou "-10") no campo de quantidade e nos campos numéricos, corrompendo a integridade dos cálculos de estoque.

#### 2. Causa Raiz Técnica
- Inputs no frontend sem máscara de restrição e sem validação `@keypress` para impedir caracteres não numéricos.
- Schema do Zod no backend aceitando `z.number()` sem restrições de `.int()` e `.positive()`.

#### 3. Possível Solução Técnica
- **Frontend**: Aplicar máscara no campo de quantidade para o setor Apoio:
  ```html
  <input type="text" inputmode="numeric" @input="event.target.value = event.target.value.replace(/\D/g, '')" />
  ```
  Impedindo a digitação de '.', ',', '-', 'e' e qualquer caractere não numérico.
- **Backend**: No schema de validação (Zod):
  ```typescript
  quantity: z.number().int({ message: "A quantidade para o setor de Apoio deve ser um número inteiro." }).positive()
  ```

#### 4. Skills Recomendadas
- `vue-best-practices`
- `backend-security-coder`
- `typescript-expert`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 7: Padronização Rígida de Unidades de Medida Fixas por Setor

#### 1. O Problema
Cada setor da fábrica opera com uma grandeza física específica. O sistema permitia que o operador escolhesse a unidade de medida manualmente em um dropdown (M², KG, UN, PAR, PÉ), o que resultava em peças de Corte cadastradas em "UN" e itens de Apoio cadastrados em "M²", inviabilizando conversões e relatórios de custo.

#### 2. Causa Raiz Técnica
- Dropdown de unidades de medida desvinculado do contexto do setor.

#### 3. Possível Solução Técnica
- **Frontend**: Travar a unidade de medida padrão de forma automática e somente-leitura (ou restrita às unidades válidas do setor):
  - **Corte**: Fixo em `M²` (Metros Quadrados).
  - **Apoio**: Fixo em `UND` (Unidade) ou `PÇ` (Peça).
  - **Pré-Fabricado**: `PAR` ou `UND`.
  - **Distribuição**: `UND`.
  - **Montagem**: `PÉ` ou `PAR`.
- **Backend**: Validar no `StockItemService` se a `unitOfMeasure` enviada é compatível com o `sector` do cadastro, rejeitando requisições fora do padrão.

#### 4. Skills Recomendadas
- `vue-best-practices`
- `database-design`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 8: Tratamento Especial para Papel de Sublimação (Metros Lineares vs Rendimento)

#### 1. O Problema
O papel de sublimação (utilizado na estamparia/corte) chega na fábrica e é armazenado em bobinas medidas por metros lineares (`M` ou `ML`). Porém, as ordens de corte e as requisições de sobras consomem o papel por área ou por rendimento de pares de calçado (grade). O estoque ficava inconsistente porque a entrada era em metros lineares e o consumo em unidades/pares.

#### 2. Causa Raiz Técnica
- Falta de regra de conversão ou fator multiplicador de rendimento (metros lineares por par/grade) para a categoria de Papel de Sublimação.

#### 3. Possível Solução Técnica
- **Backend / Modelagem**: No cadastro de produtos/categorias, parametrizar o fator de rendimento para insumos lineares:
  - Entrada: Quantidade em Metros Lineares (`M`) e largura da bobina.
  - Saída/Baixa: Pode ser dada diretamente em metros lineares ou calculada por número de peças x consumo médio por peça cadastrado.
- **Frontend**: Exibir no modal de detalhes do item a quantidade restante em metros lineares e o rendimento estimado em pares/peças.

#### 4. Skills Recomendadas
- `backend-architect`
- `database-design`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 9: Higienização e Formatação Automática do Campo "Combinação"

#### 1. O Problema
Usuários digitavam combinações com espaços no início ou fim (" PRETO/BRANCO "), com letras minúsculas ("preto/branco") ou com caracteres especiais inadequados, gerando falhas nas consultas de agregação e incompatibilidade em buscas exatas.

#### 2. Causa Raiz Técnica
- Falta de sanitização automática no evento `@input` / `@blur` no frontend e ausência de sanitização no service do backend antes de persistir no banco.

#### 3. Possível Solução Técnica
- **Frontend**: Impedir a inserção de espaços e converter automaticamente para maiúsculas em tempo real:
  ```typescript
  const onCombinationInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    target.value = target.value.toUpperCase().replace(/\s+/g, '');
    form.combination = target.value;
  };
  ```
- **Backend**: No middleware ou service de criação/atualização:
  ```typescript
  if (data.combination) {
    data.combination = data.combination.trim().toUpperCase().replace(/\s+/g, '');
  }
  ```

#### 4. Skills Recomendadas
- `vue-best-practices`
- `backend-security-coder`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 10: Sincronização do Dashboard: Casamento de Pares e Requisições Atendidas

#### 1. O Problema
No dashboard, o card de "Pares Casados" exibia valor `0` mesmo após a equipe de fábrica ter atendido requisições de pares completos. A rotina considerava apenas a movimentação interna de tipo `CASAMENTO_PAR`, ignorando as saídas efetuadas via requisição (`SAIDA_REQUISICAO`), causando discrepância nos indicadores de produtividade. Além disso, faltava uma métrica de "Pares Formáveis" no estoque atual.

#### 2. Causa Raiz Técnica
- A query SQL agregava apenas a tabela de movimentações onde `type = 'CASAMENTO_PAR'`.
- Ao atender uma requisição de pares, o tipo registrado era `SAIDA_REQUISICAO` ou `BAIXA_PAR`, e a query do dashboard não somava essas operações como pares efetivamente aproveitados.
- Não havia cálculo do mínimo entre pés esquerdos (`E`) e direitos (`D`) disponíveis para o mesmo SKU/Grade/Cor (`LEAST(SUM(E), SUM(D))`).

#### 3. Possível Solução Técnica
- **Backend (`DashboardService.ts`)**:
  - Ajustar a query de Pares Aproveitados/Casados para somar:
    ```sql
    SUM(CASE WHEN m.type IN ('CASAMENTO_PAR', 'SAIDA_REQUISICAO', 'BAIXA_PAR') THEN m.quantity ELSE 0 END)
    ```
  - Criar métrica de **Pares Formáveis em Estoque**:
    ```sql
    SELECT sku, size_grade, color,
           SUM(CASE WHEN foot_side = 'E' THEN quantity ELSE 0 END) as qtd_e,
           SUM(CASE WHEN foot_side = 'D' THEN quantity ELSE 0 END) as qtd_d,
           LEAST(
             SUM(CASE WHEN foot_side = 'E' THEN quantity ELSE 0 END),
             SUM(CASE WHEN foot_side = 'D' THEN quantity ELSE 0 END)
           ) as pares_formaveis
    FROM "StockItem"
    WHERE sector = :sector AND status = 'AVAILABLE'
    GROUP BY sku, size_grade, color;
    ```
- **Frontend (`Dashboard.vue`)**: Exibir no card: "Pares Formáveis: X" e "Pares Casados/Aproveitados: Y".

#### 4. Skills Recomendadas
- `sql-pro`
- `postgresql-optimization`
- `prisma-client-api`
- `vue-best-practices`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 11: Formulários Dinâmicos e Flexíveis Adaptados por Setor

#### 1. O Problema
O formulário de cadastro de sobras era genérico e exigia campos obrigatórios desnecessários para determinados setores. Por exemplo, na Montagem, o campo "Nome da Peça" era obrigatório, mas na Montagem o item é identificado puramente por SKU, Grade, Cor e Lado do calçado. Isso forçava os operadores a preencher textos fictícios como "xx" ou "calçado".

#### 2. Causa Raiz Técnica
- Validação no frontend marcando `partName` como `required: true` incondicionalmente, independentemente do setor selecionado.

#### 3. Possível Solução Técnica
- **Frontend**: Criar um componente de formulário dinâmico baseado no setor:
  - **Montagem**: Ocultar ou tornar opcional "Nome da Peça". Exigir SKU, Grade, Cor e Lado.
  - **Corte**: Exigir Tipo de Material, Cor, Metragem Quadrada (`M²`).
  - **Apoio**: Exigir Nome/Descrição do Aviamento, Quantidade Inteira (`UND`).
  - **Pré-Fabricado**: Exigir Tipo de Material (`EVA`/`Borracha`), Grade, Cor e Lado.
  - **Distribuição**: Exigir Tipo (`Cabedal`/`Sola`), SKU, Grade, Cor e Lado.
- **Backend**: No Zod schema, aplicar `.refine()` condicional ou schemas específicos por `sector`.

#### 4. Skills Recomendadas
- `vue-best-practices`
- `typescript-expert`
- `ui_ux_pro_max`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 12: Correção do Bug de Loading em Requisições e Feedback de Validação na Transferência

#### 1. O Problema
Ao interagir com a tela de requisições (`Requisitions.vue`), ocorria o erro em tempo de execução `ReferenceError: loading is not defined`, que travava a interface. Além disso, no modal de transferência de estoque (`InventoryHub.vue`), quando o botão de confirmação ficava desabilitado por falta de preenchimento da prateleira de destino ou da quantidade, o operador não recebia nenhuma indicação visual do motivo do bloqueio, gerando confusão de que o sistema havia travado.

#### 2. Causa Raiz Técnica
- `Requisitions.vue`: Uso da variável reativa `loading` no template sem a sua declaração prévia no `<script setup>`.
- `InventoryHub.vue`: O botão "Confirmar Transferência" utilizava apenas `:disabled="!isValidTransfer"`, sem mensagens de dica ou bordas vermelhas nos campos pendentes.

#### 3. Possível Solução Técnica
- **Frontend (`Requisitions.vue`)**: Declarar `const loading = ref(false)` e envolver chamadas assíncronas no try/finally.
- **Frontend (`InventoryHub.vue`)**: 
  - Adicionar badges/mensagens de alerta: `"Selecione a prateleira de destino"` e `"Informe uma quantidade maior que zero"`.
  - Destacar os campos obrigatórios com classes dinâmicas `:class="{ 'border-amber-500 ring-1 ring-amber-500': !selectedDestLocation }"`.

#### 4. Skills Recomendadas
- `vue-debug-guides`
- `debug_issue`
- `frontend-design`

#### 5. Status
- **Resolvido e consolidado** nas revisões da interface.

---

### Ponto 13: Saldo Visual na Transferência Parcial (Item com 5 não reduz visualmente para 4)

#### 1. O Problema
Ao realizar a transferência de 1 unidade de um lote que continha 5 unidades (ex.: transferir da Prateleira A para a Prateleira B), o operador observava que o item original ainda continuava exibindo quantidade 5 ou o item não refletia a redução imediata para 4 na tela. 

#### 2. Causa Raiz Técnica
1. **Ausência de Re-fetch ou Atualização Reativa na Store**: A mutação de transferência era concluída com sucesso no banco de dados, mas o frontend não chamava `await stockStore.fetchUnifiedInventory()` ou não atualizava o objeto local no array da store.
2. **Divisão de Registros no Banco (Item Splitting)**: Quando um `StockItem` possui quantidade 5 e 1 unidade é transferida para outro endereço físico, o registro original deve ter sua quantidade decrementada para 4 (`UPDATE "StockItem" SET quantity = 4 WHERE id = :id`), e um NOVO registro (ou agregação) deve ser gerado na localização de destino com quantidade 1. Se o serviço mantinha a quantidade no registro ou não persistia o decremento na mesma transação (`prisma.$transaction`), ocorria inconsistência de dados.

#### 3. Possível Solução Técnica
- **Backend (`StockMovementService.ts`)**:
  - Em transferências parciais (`quantityToMove < sourceItem.quantity`), executar atomicamente dentro de `prisma.$transaction`:
    1. `UPDATE "StockItem" SET quantity = quantity - quantityToMove WHERE id = sourceItem.id`
    2. Verificar se já existe um `StockItem` compatível na localização de destino para incrementar ou criar um novo registro com `quantity: quantityToMove`.
    3. Criar registro de movimentação `TRANSFERENCIA`.
- **Frontend (`InventoryHub.vue` / `stockStore.ts`)**:
  - Imediatamente após a resposta de sucesso da transferência, disparar `await fetchUnifiedInventory()` e emitir toast com o novo saldo das prateleiras de origem e destino.

#### 4. Skills Recomendadas
- `prisma-client-api`
- `database-design`
- `vue-best-practices`

#### 5. Status
- **Mapeado e pronto para implementação**.

---

### Ponto 14: Bloqueio de Transferência Cruzada Indevida Entre Setores Diferentes

#### 1. O Problema
Líderes e operadores conseguiam abrir o modal de transferência e selecionar prateleiras de outros setores (ex.: mover insumos do Apoio para prateleiras da Montagem ou do Corte). Isso causava contaminação de estoque, mistura de materiais incompatíveis e quebrava os relatórios setoriais. A transferência intersetorial deve ser bloqueada para operadores e permitida **exclusivamente para o `admin_master`** com justificativa obrigatória.

#### 2. Causa Raiz Técnica
- **Frontend**: O seletor de localização de destino listava todas as localizações cadastradas na fábrica sem filtrar pelo setor de origem do item.
- **Backend**: O endpoint `POST /api/stock-movements/transfer` não comparava o setor da prateleira de destino com o setor do item e não checava o cargo do usuário autenticado.

#### 3. Solução Técnica Implementada
- **Frontend (`InventoryHub.vue` & `stockStore.ts`)**:
  - Atualização do tipo `Location` na store para incluir `sector`.
  - Criação da computed `availableDestinationLocations`: para usuários não-admin, filtra estritamente `loc.sector === currentTransferItem.sector`. Para administradores, exibe todas as localizações com identificação visual do setor (`[SETOR] Nome da Prateleira`).
  - Exibição de banner de alerta âmbar caso o `admin_master` realize transferência entre setores distintos, tornando o campo de justificativa/observação obrigatório.
- **Backend (`StockMovementService.ts`, `StockMovementController.ts`, `StockItemService.ts`)**:
  - `StockItemService.searchUnified`: Retorna o `sector` em cada item de `filterOptions.locations` e restringe a busca de localizações ao setor do usuário para não-admins.
  - `StockMovementService.transferStock`: Valida `destLocation.sector === item.sector`. Se divergente e o usuário não for `admin`, lança erro retornando HTTP `403 Forbidden`. Se for `admin`, registra no log de auditoria a migração intersetorial.

#### 4. Skills Utilizadas
- `backend-security-coder`
- `api-security-best-practices`
- `prisma-client-api`
- `vue-best-practices`

#### 5. Status
- **CONCLUÍDO E VERIFICADO** (Backend e Frontend compilando 100% com `npm run build` sem erros).

---

### Ponto 15: Card Dinâmico de Pares Casados e Formáveis no Dashboard por Setor

#### 1. O Problema
No dashboard da tela principal, o card que exibe "Pares Casados e Formáveis" estava fixo e hardcoded para a regra do setor de Montagem. No entanto, setores como Pré-Fabricado (solas E e D) e Distribuição (cabedais e solas processadas) também trabalham com o conceito de pares formáveis. Ao alternar o filtro de setor no topo da tela, o card continuava apresentando os dados da Montagem ou ficava zerado/estático.

#### 2. Causa Raiz Técnica
- Frontend com card 4 apontando diretamente para `dashboardData.assemblyPairs`.
- Backend agregando dados de pares exclusivamente na query de `sector = 'MONTAGEM'`, sem agrupar por setor nem considerar o parâmetro `?sector=...` enviado na requisição.

#### 3. Possível Solução Técnica
- **Backend (`DashboardService.ts` / `DashboardController.ts`)**:
  - Aceitar o parâmetro opcional `sector` na rota `GET /api/dashboard/stats?sector=...`.
  - Executar cálculo de agregação de pares dinamicamente:
    - Se `sector === 'PRE_FABRICADO'`: calcular pares formáveis a partir dos itens de sola com `footSide IN ('E', 'D')`.
    - Se `sector === 'DISTRIBUICAO'`: calcular pares a partir de cabedais/solas processadas.
    - Se `sector === 'MONTAGEM'` ou não informado: manter o cálculo consolidado da montagem.
- **Frontend (`Dashboard.vue`)**:
  - Tornar o título e a descrição do Card 4 reativos:
    - Setor Montagem: "Pares Formáveis (Montagem)"
    - Setor Pré-Fabricado: "Pares de Solas Formáveis (Pré-Fabricado)"
    - Setor Distribuição: "Pares de Componentes (Distribuição)"
    - Outros setores (Corte/Apoio): Ocultar o card ou substituí-lo por métrica de área cortada / insumos críticos.

#### 4. Skills Recomendadas
- `sql-pro`
- `postgresql-optimization`
- `prisma-client-api`
- `vue-best-practices`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 16: Habilitação de "Combinação" no Setor de Montagem

#### 1. O Problema
O setor de Montagem trabalha intensamente com referências e variações de cores/materiais denominadas "Combinações" (ex.: "AZUL/BRANCO", "PRETO/LARANJA"). Na interface e nas rotas de inventário da Montagem, o campo e a coluna de combinação não estavam disponíveis ou estavam ocultos, forçando os encarregados a misturar peças de combinações diferentes para a mesma numeração, inviabilizando a montagem correta do par de calçados.

#### 2. Causa Raiz Técnica
- Tabela de listagem do estoque na Montagem não continha a coluna `combination`.
- O índice de unicidade ou agregação no Prisma para busca rápida não incluía `combination` em conjunto com `sku`, `sizeGrade`, `color` e `footSide`.

#### 3. Possível Solução Técnica
- **Frontend**:
  - Adicionar a coluna "Combinação" na tabela de inventário da Montagem (`InventoryHub.vue` e `StockItemDetailsModal.vue`).
  - Adicionar o campo "Combinação" no formulário de entrada e no formulário de requisição da Montagem, com suporte ao autocomplete/datalist (Ponto 5) e sanitização automática (Ponto 9).
- **Backend / Prisma**:
  - Assegurar que os serviços de `StockItemService` e `StockMovementService` tratem o campo `combination` como chave de agrupamento e validação de par casado:
    `PAR CASADO = Mesmo SKU + Mesma Grade + Mesma Cor + Mesma Combinação + (1 Pé E + 1 Pé D)`.
  - No `schema.prisma`, otimizar o índice de consulta:
    ```prisma
    @@index([factoryUnitId, sector, sku, sizeGrade, color, combination, footSide])
    ```

#### 4. Skills Recomendadas
- `vue-best-practices`
- `prisma-client-api`
- `database-design`
- `backend-security-coder`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 17: Ativação/Desativação Modular da Aba de Requisições por Unidade Fabril

#### 1. O Problema
O sistema **SobraCorte** está sendo preparado para expansão multi-unidade (diferentes fábricas/cidades). Algumas unidades possuem cultura e fluxo operacional onde as sobras são requisitadas ativamente via sistema pelas linhas de produção, enquanto em outras unidades menores as sobras são apenas consultadas e movimentadas internamente, sem o uso do módulo formal de requisições. É necessário que o `admin_master` consiga ativar ou desativar a funcionalidade de Requisições individualmente por unidade fabril.

#### 2. Causa Raiz Técnica
- O menu de navegação exibia a aba "Requisições" de forma estática para todos os usuários de todas as unidades.
- A entidade `FactoryUnit` no banco de dados não possuía uma flag booleana de configuração para o módulo de requisições.

#### 3. Possível Solução Técnica
- **Banco de Dados / Prisma**:
  - Adicionar campo na model `FactoryUnit`:
    ```prisma
    model FactoryUnit {
      id                 String      @id @default(uuid())
      name               String
      code               String      @unique
      // ... campos existentes
      enableRequisitions Boolean     @default(true)
    }
    ```
  - Gerar migração com `npx prisma migrate dev --name add_enable_requisitions_to_factory_unit`.
- **Backend**:
  - No `FactoryUnitController` / `FactoryUnitService`, permitir que o `admin_master` atualize `enableRequisitions`.
  - Nas rotas `/api/requisitions/*`, adicionar middleware que valida se a unidade do usuário tem `enableRequisitions === true`. Caso contrário, retornar HTTP `403 Forbidden` ("Módulo de Requisições desativado nesta unidade").
- **Frontend**:
  - Na tela de Configurações da Unidade (`Settings.vue`), adicionar um toggle switch (ativar/desativar) exclusivo para o `admin_master`: *"Habilitar Módulo de Requisições nesta Unidade"*.
  - No `AppLayout.vue` / Menu Lateral: Esconder o item "Requisições" se a unidade atual do usuário estiver com a funcionalidade desativada.
  - No `router/index.ts`: Adicionar navigation guard para impedir acesso direto via URL à rota `/requisitions` se o recurso estiver desativado para a unidade logada.

#### 4. Skills Recomendadas
- `backend-architect`
- `database-migrations-sql-migrations`
- `api-security-best-practices`
- `vue-best-practices`
- `ui_ux_pro_max`

#### 5. Status
- **Mapeado para implementação**.

---

### Ponto 18: Visão Dupla nos Relatórios: Quantidade de Operações (Lançamentos) e Volume Físico Total (Cards Duplos Integrados)

#### 1. O Problema
Na aba de Relatórios (`Reports.vue`), o card analítico de entrada de materiais exibe atualmente apenas o título **"VOLUME ENTRADAS"** e um número escalar como `46` (conforme registrado no print da interface).
- No contexto operacional e fabril do Grupo DASS, existem dois indicadores gerenciais distintos e indispensáveis que estavam sendo confundidos:
  1. **Quantidade de Operações (Entradas / Saídas)**: Representa a **frequência transacional / ritmo de linha** (quantas vezes a equipe deu entrada ou realizou baixas de materiais no período, ex.: *"o Apoio realizou 40 entradas e 20 saídas"*).
  2. **Volume Físico Total**: Representa a **soma real das peças, metros lineares ou metros quadrados** contidos dentro desses pacotes/lotes (`SUM(quantity)` de cada operação, ex.: *"essas 40 entradas totalizaram 46 unidades ou 500 peças"*).
- Ao exibir apenas "VOLUME ENTRADAS: 46", o sistema omitia quantas operações/lotes foram manipulados pela equipe e gerava dubiedade para o PCP, supervisores e auditores de estoque.
- Ao gerar relatórios para impressão (PDF) ou exportação em planilha (CSV), a liderança necessita visualizar com clareza **ambas as métricas**: o total de operações realizadas e o volume físico consolidado movimentado no estoque.

#### 2. Causa Raiz Técnica
- **Frontend (`Reports.vue`)**:
  - O template renderiza um card estático isolado: `<p class="text-[11px] font-bold text-emerald-600 uppercase">Volume Entradas</p>` consumindo apenas `reportTotals.volumeEntradas`.
  - Não havia exibição da quantidade de lançamentos/operações de entrada (`qtdOperacoesEntrada` / `COUNT`) nem discriminação da unidade de medida do setor ($m^2$, un, pares).
- **Backend (`ReportController.ts`)**:
  - No método `movements`, os totais calculavam apenas a soma das quantidades dos itens (`volumeEntradas = reduce(...)`), sem computar e retornar a contagem de operações de entrada e saída de forma desacoplada do volume físico:
    ```typescript
    // Cálculo anterior que misturava conceitos:
    volumeEntradas: allItems.filter((m) => m.tipo === 'ENTRADA').reduce((a, c) => a + Number(c.quantidade), 0),
    volumeSaidas: allItems.filter((m) => m.tipo === 'SAIDA' || m.tipo === 'CASAMENTO_PAR').reduce((a, c) => a + Number(c.quantidade), 0),
    ```
- **Relatório Gerado (PDF e Planilhas CSV)**:
  - O cabeçalho de exportação e a síntese impressa não consolidavam o número de operações executadas versus o volume físico total movimentado.

#### 3. Solução Técnica Validada (Cards Duplos Integrados)

- **Frontend (`Reports.vue`)**:
  - Estruturar **Cards Duplos Integrados** no topo do relatório de movimentações:
    - **Card de Entradas (Verde - Emerald)**:
      - **Métrica Principal em Destaque**: `{{ reportTotals.qtdOperacoesEntrada }} Entradas` *(Quantidade de lançamentos/operações no período)*
      - **Submétrica Integrada (Abaixo)**: `Volume Total: {{ reportTotals.volumeTotalEntrada }} {{ currentUnitSuffix }}` *(Soma física de peças/m² contidas nos lotes)*
    - **Card de Saídas (Azul - Blue)**:
      - **Métrica Principal em Destaque**: `{{ reportTotals.qtdOperacoesSaida }} Saídas` *(Quantidade de operações de baixa/saída)*
      - **Submétrica Integrada (Abaixo)**: `Volume Total: {{ reportTotals.volumeTotalSaida }} {{ currentUnitSuffix }}` *(Soma física que saiu)*
    - **Sufixo de Unidade Dinâmico**:
      - Setor **Corte**: `m²`
      - Setor **Montagem** / **Pré-Fabricado**: `pares / pés`
      - Setor **Apoio** / **Distribuição**: `un`
      - Se **Todos os Setores (Geral)**: Apresentar a discriminação segmentada no subtítulo (`X m² Corte | Y un Componentes`).
  - **Relatório Gerado (Impressão PDF & Exportação CSV)**:
    - Na tabela: cada linha lista a operação individual e o respectivo volume do lote.
    - No cabeçalho e resumo executivo (PDF/CSV): apresentar o consolidado duplo inequívoco:
      - *Entradas Realizadas: X operações | Volume Total: Y [un/m²]*
      - *Saídas Realizadas: W operações | Volume Total: Z [un/m²]*
- **Backend (`ReportController.ts`)**:
  - No método `movements`, separar o cômputo dos totais em duas grandezas analíticas explícitas:
    ```typescript
    const entradas = allItems.filter((m) => m.tipo === 'ENTRADA');
    const saidas = allItems.filter((m) => m.tipo === 'SAIDA' || m.tipo === 'CASAMENTO_PAR');

    const totals = {
      totalRegistros: allItems.length,
      // 1. Quantidade de Operações (Lançamentos / Frequência de Linha)
      qtdOperacoesEntrada: entradas.length,
      qtdOperacoesSaida: saidas.length,

      // 2. Volume Físico Total (Soma real de peças / metros nos lotes)
      volumeTotalEntrada: entradas.reduce((a, c) => a + Number(c.quantidade), 0),
      volumeTotalSaida: saidas.reduce((a, c) => a + Number(c.quantidade), 0),

      // Retrocompatibilidade provisória com código legado:
      volumeEntradas: entradas.reduce((a, c) => a + Number(c.quantidade), 0),
      volumeSaidas: saidas.reduce((a, c) => a + Number(c.quantidade), 0),

      totalRefugos: allItems.filter((m) => m.tipo === 'REFUGO').reduce((a, c) => a + Number(c.quantidade), 0),
      totalCasamentosPares: Math.floor(allItems.filter((m) => m.tipo === 'CASAMENTO_PAR').reduce((a, c) => a + Number(c.quantidade), 0) / 2),
      totalTransferencias: allItems.filter((m) => m.tipo === 'TRANSFERENCIA').reduce((a, c) => a + Number(c.quantidade), 0),
    };
    ```
- **Banco de Dados / Prisma**:
  - Não requer migração DDL. Os modelos `StockMovement` e `Movement` já registram a quantidade do lote, o tipo de operação e a unidade de medida do material.

#### 4. Skills Recomendadas
- `vue-best-practices`: Estruturação reativa dos cards com métrica e submétrica no Vue 3.
- `frontend-design` / `ui_ux_pro_max`: Hierarquia visual dos cards duplos integrados, tipografia de KPIs e cores industriais adequadas.
- `backend-architect`: Separação arquitetural entre contagem transacional (`COUNT`) e volume físico agregado (`SUM`).
- `sql-pro` / `prisma-client-api`: Otimização de consultas analíticas e agregações no banco de dados.

#### 5. Status
- **Mapeado para implementação** (Arquitetura e layout de cards duplos validados).

---

## Matriz Resumo das Skills por Ponto

| Ponto | Descrição Resumida | Skills Principais | Status |
| :--- | :--- | :--- | :--- |
| **01** | Desacoplamento Setores x Cargos e Isolamento | `backend-architect`, `database-design`, `backend-security-coder`, `prisma-client-api` | Em andamento |
| **02** | Governança e Aprovação de Requisições | `backend-security-coder`, `api-security-best-practices`, `vue-best-practices` | Mapeado |
| **03** | Pré-Fabricado: Solas, Material e Lado | `vue-best-practices`, `typescript-expert`, `prisma-client-api` | Mapeado |
| **04** | Distribuição: Cabedais e Solas Processadas | `backend-architect`, `database-migrations-sql-migrations`, `vue-best-practices` | Mapeado |
| **05** | Autocomplete de Combinações | `prisma-client-api`, `vue-best-practices`, `frontend-api-integration-patterns` | Mapeado |
| **06** | Validação Estrita no Setor de Apoio | `vue-best-practices`, `backend-security-coder`, `typescript-expert` | Mapeado |
| **07** | Padronização de Unidades de Medida Fixas | `vue-best-practices`, `database-design` | Mapeado |
| **08** | Papel de Sublimação: Metros vs Rendimento | `backend-architect`, `database-design` | Mapeado |
| **09** | Higienização do Campo Combinação | `vue-best-practices`, `backend-security-coder` | Mapeado |
| **10** | Dashboard: Casamento e Pares Formáveis | `sql-pro`, `postgresql-optimization`, `prisma-client-api`, `vue-best-practices` | Mapeado |
| **11** | Formulários Dinâmicos por Setor | `vue-best-practices`, `typescript-expert`, `ui_ux_pro_max` | Mapeado |
| **12** | Bug de Loading e Feedback na Transferência | `vue-debug-guides`, `debug_issue`, `frontend-design` | Resolvido |
| **13** | Saldo Visual na Transferência (Item Split) | `prisma-client-api`, `database-design`, `vue-best-practices` | Mapeado |
| **14** | Bloqueio de Transferência Cruzada | `backend-security-coder`, `api-security-best-practices`, `prisma-client-api`, `vue-best-practices` | **CONCLUÍDO** |
| **15** | Card Dinâmico no Dashboard por Setor | `sql-pro`, `postgresql-optimization`, `prisma-client-api`, `vue-best-practices` | Mapeado |
| **16** | Combinação no Setor de Montagem | `vue-best-practices`, `prisma-client-api`, `database-design`, `backend-security-coder` | Mapeado |
| **17** | Ativação Modular de Requisições por Unidade | `backend-architect`, `database-migrations-sql-migrations`, `api-security-best-practices`, `vue-best-practices`, `ui_ux_pro_max` | Mapeado |
| **18** | Visão Dupla em Relatórios (Cards Duplos Integrados: Qtd. Operações + Volume Total) | `vue-best-practices`, `frontend-design`, `ui_ux_pro_max`, `backend-architect`, `sql-pro`, `prisma-client-api` | Mapeado |

---
*Documento gerado e sincronizado no repositório SobraCorte para consulta contínua.*
