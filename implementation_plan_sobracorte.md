# Plano de Arquitetura & Implementação: Expansão Multi-Setor (SobraCorte)

> **Documentação Viva do Projeto SobraCorte**  
> Expansão Industrial para 5 Setores com Clean Architecture, Multi-Tenancy Estrito, Auditoria Atômica e Single Round-Trip.

---

## 📊 Status Geral de Execução

| Fase | Descrição | Status | Detalhes |
|---|---|:---:|---|
| **Fase 0** | Multi-Tenancy Automático (`AsyncLocalStorage` + `prisma.$extends`) | ✅ Concluído | Isolamento automático por `factoryUnitId` e verificação de chaves compostas. |
| **Fase 1** | Banco de Dados, Schema Prisma, Índices Compostos & Migrations 5 Unidades | ✅ Concluído | Schema com 5 setores, enums, índices de matching e carga idempotente (SEST, STJ, ITB, VDC, ITP). |
| **Fase 2** | Domain, Zod Discriminated Unions, Services ACID & Auditoria | ✅ Concluído | Validações estritas por setor, transações atômicas e serviço de histórico. |
| **Fase 3** | API REST, Single Round-Trip & Matching Query Otimizada | ✅ Concluído | Endpoints consolidados (`/inventory/search`, `/inventory/batch`, `/inventory/mounting/matching-pairs`). |
| **Fase 4** | Frontend Vue 3 (Formulários $\le 10$s, Hub de Abas, Matching e Auditoria) | ✅ Concluído | UX de chão de fábrica, atalhos de teclado e tela dedicada de casamento de pares. |
| **Fase 5** | Governança RBAC & Integração às Configurações Dinâmicas Existentes | ✅ Concluído | Proteção com `requireRole` no backend, travas `authStore.can` no frontend e consumo de `/settings/*`. |
| **Cartão 5.3** | Padronização Estrita de Formulários & Vínculo Multi-Categoria | ✅ Concluído | Prateleiras em `<select>` rígido, máscara estrita de grade/tamanho e suporte a múltiplas categorias por localização. |
| **Cartão 5.4** | Unificação Robusta do Fluxo de Movimentações no Estoque Multi-Setor | ✅ Concluído | Modal unificado (Entrada, Saída, Refugo, Transferência) com controle por prateleira e recarga instantânea. |
| **Cartão 5.5** | Consolidação do Sidebar com Single Round-Trip e Paginação de Alta Escala (>3.000 Itens) | ✅ Concluído | Query consolidada com take/skip, sincronização de URL via query params, paginação responsiva e redirects. |
| **Unificação Material** | Integração Completa da Tabela Oficial `Material` (4.000+ Itens) no Estoque | ✅ Concluído | Leitura e gravação de CORTE apontando para `Material`, zero N+1 queries, filterOptions unificadas no search. |
| **Dashboard Consolidado** | Single Round-Trip (`GET /dashboard/summary`) & Integração Total `StockMovement` | ✅ Concluído | Métricas analíticas unificadas de `StockMovement` + `Movement`, eliminação dos 4 requests separados no `Dashboard.vue`. |
| **Cartão 5.7** | Governança, Travas de Integridade & Auditoria de Configurações | ✅ Concluído | Verificação de vínculos ativos antes de mutações, trava para papéis não-admin e log de auditoria estruturado. |
| **Cartão 5.6** | Governança do Perfil Leitor & Setorização de Configurações | ✅ Concluído | Modo somente leitura para `leitor` no histórico/configurações, permissões granulares para `lider` e `admin`, e bloqueio 403 para mutações de leitor. |

---

## 🏭 1. Mapeamento Oficial dos 5 Setores Industriais

| Setor | Modelo / Objeto | Identificadores & Campos Principais | Unidade / Formato |
|---|---|---|---|
| **1. CORTE** | Matéria-Prima Bruta | `code` (Código MP), `name` (Descrição), `type` (Couro, Tecido, etc.), `minStock` | `m²`, `kg`, metros, `lote` |
| **2. APOIO** | Peças Cortadas / Moldes | `pieceCode` (Código do Molde/Peça), `description` (Gáspea, etc.), `materialColor` (Material/Cor), `sizeGrade` | Unidades (peças avulsas) |
| **3. PRÉ-FABRICADO** | Solas por Produto | `productName` (Linha/Produto), `color` (Cor da sola), `sizeGrade` (Numeração) | Pares de Solado |
| **4. EXPEDIÇÃO** | Cabedais por SKU | `sku` (SKU do Cabedal/Modelo), `color` (Cor do cabedal), `sizeGrade` (Numeração) | Unidades de Cabedal |
| **5. MONTAGEM** | Pés Prontos / Órfãos | `sku` (SKU do Calçado), `sizeGrade` (Numeração), `footSide` (`E` [Esquerdo] \| `D` [Direito]) | Pés avulsos cancelados |

---

## 🛡️ 2. Diretrizes e Decisões Arquiteturais Consolidadas

1. **Multi-Tenancy por FactoryUnit (`factoryUnitId`):**
   - Todas as tabelas de domínio (`StockItem`, `StockItemLocation`, `StockMovement`) utilizam chaves compostas `[id, factoryUnitId]` e `[stockItemId, locationId, factoryUnitId]`.
   - As queries são interceptadas pelo `prisma.$extends` garantindo impossibilidade de vazamento de dados entre unidades fabris.

2. **Fluxo e Tela de Casamento de Pares na Montagem (`MountingMatchingPairs.vue`):**
   - **Zero baixa invisível:** Pés órfãos permanecem nas prateleiras físicas até validação humana.
   - **Interface Visual:** A tela indica com destaque os pares casáveis e suas localizações físicas (ex: Pé Esquerdo na prateleira `A-01` e Pé Direito na prateleira `B-03`).
   - **Ação Explícita:** O operador retira os dois pés fisicamente e confirma o casamento no sistema.
   - **Baixa Atômica:** Execução de transação ACID com baixa dos pés avulsos e registro de movimentação de saída com motivo `CASAMENTO_PAR`.

3. **Auditoria e Rastreabilidade Total (`StockMovement`):**
   - Nenhuma alteração de saldo ocorre sem inserção de registro na tabela `StockMovement`.
   - Rastreamento obrigatório: `operatorId` (Matrícula DASS), `operatorName`, `createdAt`, `sector`, `type`, `quantity`, `sourceLocationId`, `destinationLocationId`, `origem` e `reason`.

4. **Performance & Single Round-Trip (`GET /inventory/search`):**
   - Frontend realiza apenas 1 requisição HTTP para carregar itens paginados por abas setoriais, métricas consolidadas, contagem de pares formáveis e filtros dinâmicos.

---

## 🗄️ 3. Modelagem de Dados & Schema Prisma

### 3.1 Enums do Domínio (`sobra_corte`)
```prisma
enum SectorType {
  CORTE
  APOIO
  PRE_FABRICADO
  EXPEDICAO
  MONTAGEM
  @@schema("sobra_corte")
}

enum ComponentType {
  MATERIA_PRIMA
  PECA_CORTADA
  SOLADO
  CABEDAL
  PE_PRONTO
  @@schema("sobra_corte")
}

enum FootSide {
  E // Pé Esquerdo
  D // Pé Direito
  @@schema("sobra_corte")
}

enum MovementType {
  ENTRADA
  SAIDA
  TRANSFERENCIA
  REFUGO
  CASAMENTO_PAR
  @@schema("sobra_corte")
}
```

### 3.2 Índices Compostos Estratégicos (PostgreSQL)
```prisma
@@unique([id, factoryUnitId])
@@index([factoryUnitId, sector, createdAt(sort: Desc)])
@@index([factoryUnitId, sector, productName, sizeGrade])   // Pré-Fabricado (Solas por Produto)
@@index([factoryUnitId, sector, sku, sizeGrade])           // Expedição (Cabedais por SKU)
@@index([factoryUnitId, sector, sku, sizeGrade, footSide]) // Montagem (Matching de Pés Órfãos)
@@index([factoryUnitId, sector, pieceCode])                // Apoio (Peças e Moldes)
```

---

## ⚡ 4. Contratos de API & Validações Zod (Fase 2 & Fase 3)

### 4.1 Discriminated Unions por Setor
```typescript
import { z } from 'zod';

export const CorteItemSchema = z.object({
  sector: z.literal('CORTE'),
  code: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default('UN'),
  type: z.string().default('OUTROS'),
  location: z.string().min(1),
  observation: z.string().optional(),
});

export const ApoioItemSchema = z.object({
  sector: z.literal('APOIO'),
  pieceCode: z.string().min(1),
  description: z.string().min(1),
  materialColor: z.string().min(1),
  sizeGrade: z.string().min(1),
  quantity: z.number().positive(),
  location: z.string().min(1),
  observation: z.string().optional(),
});

export const PreFabricadoItemSchema = z.object({
  sector: z.literal('PRE_FABRICADO'),
  productName: z.string().min(1),
  color: z.string().min(1),
  sizeGrade: z.string().min(1),
  quantity: z.number().positive(),
  location: z.string().min(1),
  observation: z.string().optional(),
});

export const ExpedicaoItemSchema = z.object({
  sector: z.literal('EXPEDICAO'),
  sku: z.string().min(1),
  color: z.string().min(1),
  sizeGrade: z.string().min(1),
  quantity: z.number().positive(),
  location: z.string().min(1),
  observation: z.string().optional(),
});

export const MontagemItemSchema = z.object({
  sector: z.literal('MONTAGEM'),
  sku: z.string().min(1),
  sizeGrade: z.string().min(1),
  footSide: z.enum(['E', 'D']),
  quantity: z.number().positive(),
  location: z.string().min(1),
  observation: z.string().optional(),
});

export const BatchCreateStockItemSchema = z.object({
  items: z.array(
    z.discriminatedUnion('sector', [
      CorteItemSchema,
      ApoioItemSchema,
      PreFabricadoItemSchema,
      ExpedicaoItemSchema,
      MontagemItemSchema,
    ])
  ).min(1),
});
```

---

### 4.2 Query Nativa de Casamento de Pares Órfãos
```sql
SELECT 
  e."sku",
  e."sizeGrade",
  e.id AS "leftFootStockItemId",
  e.quantity AS "leftQuantity",
  (
    SELECT string_agg(l.name, ' | ') 
    FROM sobra_corte."StockItemLocation" sil 
    JOIN sobra_corte."Location" l ON l.id = sil."locationId" 
    WHERE sil."stockItemId" = e.id AND sil.quantity > 0
  ) AS "leftLocations",
  d.id AS "rightFootStockItemId",
  d.quantity AS "rightQuantity",
  (
    SELECT string_agg(l.name, ' | ') 
    FROM sobra_corte."StockItemLocation" sil 
    JOIN sobra_corte."Location" l ON l.id = sil."locationId" 
    WHERE sil."stockItemId" = d.id AND sil.quantity > 0
  ) AS "rightLocations",
  LEAST(e.quantity, d.quantity) AS "formablePairs"
FROM sobra_corte."StockItem" e
INNER JOIN sobra_corte."StockItem" d
  ON e."factoryUnitId" = d."factoryUnitId"
  AND e."sku" = d."sku"
  AND e."sizeGrade" = d."sizeGrade"
WHERE e."factoryUnitId" = $1
  AND e.sector = 'MONTAGEM'
  AND d.sector = 'MONTAGEM'
  AND e."footSide" = 'E'
  AND d."footSide" = 'D'
  AND e.quantity > 0
  AND d.quantity > 0
ORDER BY "formablePairs" DESC;
```

---

## 🗺️ 5. Cartões de Execução Detalhados

### 🟩 Fase 2: Domain & Services (Próxima Etapa)
- [ ] Criar arquivo `backend/src/types/stock.dto.ts` com schemas Zod (`discriminatedUnion`) e tipos TypeScript inferidos.
- [ ] Implementar `StockItemService`:
  - Inserção em lote (`batchCreate`) com validação de prateleiras e criação automática caso não existam.
  - Transação ACID (`$transaction`) garantindo criação do item, vinculação da prateleira (`StockItemLocation`) e registro de movimentação inicial (`StockMovement` com `type = ENTRADA`).
- [ ] Implementar `MountingPairService`:
  - Localização de pares casáveis via SQL otimizada.
  - Execução do casamento (`executeMatch`) com baixa atômica dos pés órfãos e movimentação `CASAMENTO_PAR`.
- [ ] Implementar `StockMovementService`:
  - Registro de saídas avulsas, transferências entre prateleiras e consultas filtradas de histórico.

### 🟨 Fase 3: API REST & Controllers
- [ ] Criar `StockItemController` e `MountingPairController`.
- [ ] Configurar rotas no `backend/src/routes.ts`:
  - `POST /inventory/batch`
  - `GET /inventory/search`
  - `GET /inventory/mounting/matching-pairs`
  - `POST /inventory/mounting/execute-match`
  - `POST /inventory/movements`
  - `GET /inventory/movements/history`

### 🟧 Fase 4: Frontend Vue 3 (UX de Chão de Fábrica)
- [x] Atualizar Store Pinia `stockStore.ts` com suporte aos 5 setores e busca unificada.
- [x] Criar formulário dinâmico ultra-rápido (`SectorFormInput.vue`) com navegação por teclado ($\le 10$s).
- [x] Criar Tela Consolidada de Estoque por Abas (`InventoryHub.vue`).
- [x] Criar Tela de Casamento de Pares (`MountingMatchingPairs.vue`) com destaque das prateleiras.
- [x] Criar Painel de Histórico e Auditoria (`StockMovementHistory.vue`).

---

## 🏁 6. Status dos Cartões Kanban do Sprint 5

- **Cartão 5.1:** ✅ Modelagem e Migração Multi-Tenant do Banco de Dados (Prisma Schema, Enums, Índices Compostos e Particionamento Lógico) - **Concluído**
- **Cartão 5.2:** ✅ Camada de Serviço e Validações Zod (StockItemService, MountingPairService, Transações Atômicas) - **Concluído**
- **Cartão 5.3:** ✅ Casamento Inteligente de Pés Órfãos na Montagem (Query SQL nativa de alta performance e baixa atômica) - **Concluído**
- **Cartão 5.4:** ✅ Unificação Robusta do Fluxo de Movimentações no Estoque Multi-Setor (`POST /inventory/movements`, Drawer de Movimentação) - **Concluído**
- **Cartão 5.5:** ✅ Consolidação do Sidebar com Single Round-Trip e Paginação de Alta Escala (>3.000 itens) - **Concluído**
- **Cartão 5.6:** ✅ Governança do Perfil Leitor & Setorização de Configurações (RBAC estrito, bloqueio de `/settings`, exportação protegida) - **Concluído**
- **Cartão 5.7:** ✅ Governança, Travas de Integridade & Auditoria de Configurações (Restrições de exclusão e log no `StockMovement`) - **Concluído**
- **Cartão 5.8:** ✅ Evolução do Dashboard Multi-Setor & KPIs Operacionais (Single Round-Trip `GET /dashboard/summary`, filtro rápido por setor reativo sem overhead, itens parados sem giro >30d, proporção ESQ/DIR e ranking de reaproveitamento) - **Concluído**
- **Cartão 5.9:** ✅ Adaptação e Modernização da Central de Relatórios (`Reports.vue` multi-setor, `GET /reports/movements`, fechamento de período com métricas de entradas/saídas/refugos/casamentos, exportação CSV/Excel e bloqueio RBAC para leitor) - **Concluído**

🎉 **FASE 5 DO PROJETO TOTALMENTE CONCLUÍDA COM SUCESSO!**

