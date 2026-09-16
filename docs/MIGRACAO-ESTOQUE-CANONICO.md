# Migração para o estoque canônico

O Ciclo 3 mantém `Material`, `MaterialLocation` e `Movement` somente para rollback. A aplicação lê e grava exclusivamente `StockItem`, `StockItemLocation` e `StockMovement`; itens do Corte usam `sector=CORTE` e `componentType=MATERIA_PRIMA`.

## Estratégia de implantação

O rollout exige uma janela sem gravações. Dual-write não é suportado.

1. Aplicar as migrations Prisma.
2. Suspender gravações de estoque.
3. Executar `npm --prefix backend run stock:backfill`.
4. Executar `npm --prefix backend run stock:reconcile`.
5. Prosseguir somente se todas as linhas retornarem `divergences = 0`.
6. Liberar a aplicação nova e reabrir gravações.

O backfill usa `legacyMaterialId` e `legacyMovementId` por unidade como referências determinísticas. Ele pode ser repetido: itens e movimentos são atualizados pelas chaves únicas, e saldos por localização usam upsert.

Tipos antigos são normalizados para `ENTRADA`, `SAIDA`, `TRANSFERENCIA` e `REFUGO`. Um tipo não reconhecido não é importado e faz a reconciliação falhar. Movimentos sem relação ativa preservam snapshots e permanecem com `stockItemId` nulo.

As tabelas antigas não devem ser removidas antes do Ciclo 8 e da autorização explícita prevista no plano.
