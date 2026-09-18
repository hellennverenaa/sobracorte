# Plano de consolidação do estoque

Status: consolidação local e testes da etapa 5 executados em 18/09/2026 sobre uma cópia isolada do clone de produção. Upgrade, preservação dos dados, integridade, smoke tests e restauração com PostgreSQL 15 aprovados. Três dos quatro checksums históricos divergentes foram explicados pelo Git. Falta localizar o SQL originalmente aplicado de `20260807_sync_settings_schema`; o deploy em produção também depende da preparação operacional e autorização explícita. Evidências e procedimento em [VALIDACAO_CONSOLIDACAO_ESTOQUE.md](VALIDACAO_CONSOLIDACAO_ESTOQUE.md).

## Decisão

Usar as tabelas existentes como fonte única de estoque, renomeando-as diretamente no PostgreSQL:

```text
Material         → StockItem
MaterialLocation → StockItemLocation
Movement         → StockMovement
```

Também serão renomeadas as colunas relacionais:

```text
MaterialLocation.materialId → StockItemLocation.stockItemId
Movement.materialId         → StockMovement.stockItemId
```

Não serão usados `@@map` ou `@map`. Os nomes físicos, os modelos Prisma e o código usarão `StockItem`, `StockItemLocation` e `StockMovement`.

As renomeações serão feitas in-place, preservando dados, IDs, sequences e relações. Não haverá cópia de registros ou backfill entre tabelas.

A localização histórica dos movimentos será convertida conforme o tipo: `ENTRADA` usa destino; `SAIDA` e `REFUGO` usam origem. IDs e nomes existentes serão preservados antes da remoção de `locationId`. Transferências históricas com localização sem direção definida interrompem a migration para revisão, evitando atribuir uma direção presumida.

A constraint histórica `Movement_quantity_positive` será substituída pela regra final, que mantém quantidade positiva para movimentos de estoque e permite zero exclusivamente nas auditorias de configuração.

## Situação conhecida

No banco de desenvolvimento analisado:

| Estrutura | Registros |
| --- | ---: |
| `Material` | 3.437 |
| `MaterialLocation` | 174 |
| `Movement` | 217 |
| `StockItem` | 0 |
| `StockMovement` | 0 |

As tabelas paralelas estão vazias e o backfill não foi executado. Produção ainda não recebeu as migrations relacionadas ao estoque paralelo, segundo o histórico conhecido. A confirmação direta em `_prisma_migrations` será feita na validação final.

## Resultado esperado

- uma única fonte de estoque;
- dados históricos mantidos nas mesmas estruturas físicas renomeadas;
- código atual preservado em torno de `prisma.stockItem`, `prisma.stockItemLocation` e `prisma.stockMovement`;
- nenhuma referência `legacyMaterialId` ou `legacyMovementId`;
- nenhum checkpoint ou script de backfill;
- dashboard e relatórios sem combinação de fontes antigas e novas;
- migrations de produção baseadas em `ALTER TABLE`, sem duplicação de dados.

## Etapa 1 — Consolidar schema e migrations

1. Alterar `schema.prisma` para manter somente os modelos:
   - `StockItem`;
   - `StockItemLocation`;
   - `StockMovement`.
2. Remover os modelos duplicados `Material`, `MaterialLocation` e `Movement`.
3. Reescrever as migrations ainda não aplicadas em produção para:
   - renomear as tabelas existentes;
   - renomear `materialId` para `stockItemId`;
   - adicionar os campos multissetoriais;
   - classificar registros existentes como `CORTE/MATERIA_PRIMA`;
   - converter os tipos históricos de movimento;
   - criar constraints e índices finais.
4. Remover migrations exclusivas de preparação, checkpoint e reconciliação entre tabelas.
5. Validar o schema e compilar o backend.

Migrations que precisam ser revistas em conjunto:

- `20260915160000_add_multi_sector_stock_items`;
- `20260915160200_add_settings_audit_and_optional_stock_item`;
- `20260915160400_v3_schema_alignment`;
- `20260915160700_reconcile_schema_and_audit_integrity`;
- `20260915160800_align_production_schema`;
- `20260916130000_add_tenant_unique_selectors`;
- `20260916170000_prepare_stock_unification`;
- `20260916190000_index_report_pages`;
- `20260916220000_stock_quantity_guards`;
- `20260917120000_stock_history_snapshots`;
- `20260917150000_stock_migration_checkpoint`.

As migrations de identidade, RBAC e isolamento por unidade não fazem parte desta consolidação e devem ser preservadas.

## Etapa 2 — Simplificar o runtime

1. Remover leituras híbridas de estoque legado e canônico.
2. Ajustar SQL bruto para os nomes finais das tabelas e colunas.
3. Manter controllers e serviços usando apenas os modelos `stock*`.
4. Remover caminhos de compatibilidade e tipos exclusivos do legado.
5. Confirmar que inventário, movimentações, dashboard e relatórios usam a fonte única.

## Etapa 3 — Remover resíduos

Remover:

- `StockMigrationCheckpoint`;
- `legacyMaterialId` e `legacyMovementId`;
- `backend/scripts/stock-unification.cjs`;
- `backend/scripts/backfill-stock-unification.sql`;
- `backend/scripts/reconcile-stock-unification.sql`;
- fixtures específicas do backfill;
- comandos `stock:backfill`, `stock:reconcile` e `stock:status`;
- testes exclusivos de backfill, checkpoint e comparação entre tabelas;
- documentação da estratégia descartada.

Manter uma verificação simples de integridade da fonte única para saldos, localizações, tenant, movimentos e requisições.

## Etapa 4 — Validação local proporcional

Sem recriar agora um ambiente equivalente a produção:

1. executar `prisma validate` e gerar o Prisma Client;
2. executar o build do backend;
3. executar os testes unitários diretamente afetados;
4. executar testes funcionais de estoque que não exijam um clone de produção;
5. revisar o SQL final das migrations;
6. confirmar ausência de referências à arquitetura descartada.

Não será criada uma suíte extensa apenas para esta refatoração. Testes transitórios do mecanismo removido também não serão mantidos.

## Etapa 5 — Validação final com dados de produção

Executada em uma cópia isolada do clone restaurado de produção. O clone original foi preservado. Os resultados e as pendências operacionais estão registrados no relatório de validação.

1. confirmar `_prisma_migrations` em produção;
2. criar um ambiente descartável a partir da cópia;
3. registrar contagens anteriores;
4. executar `prisma migrate deploy`;
5. comparar IDs, contagens, saldos, localizações e movimentos, incluindo IDs e nomes das localizações históricas de origem/destino;
6. executar a verificação de integridade;
7. realizar smoke tests dos fluxos principais, incluindo criação, edição e exclusão de configurações com auditoria de quantidade zero;
8. medir a duração da migration;
9. fechar o procedimento de backup, deploy e rollback.

Nenhuma migration foi aplicada em produção. A validação técnica foi aprovada; o deploy real depende da revisão do histórico divergente, backup restaurável e autorização explícita.

## Observação sobre o banco de desenvolvimento

O banco de desenvolvimento anteriormente analisado já havia registrado as migrations da estratégia paralela. Depois de reescrever o histórico, ele não deve ser tratado como compatível com as novas migrations. Essa observação não se aplica ao clone de produção restaurado posteriormente para a etapa 5.

Até a validação final, ele pode ser usado apenas para atividades de desenvolvimento compatíveis com sua estrutura atual. As tabelas canônicas vazias não representam o estoque histórico, e esse banco não comprova compatibilidade do runtime, preservação de dados ou funcionamento da linha de upgrade. Não executar `prisma migrate deploy` nele com o histórico reescrito. O teste real da linha de upgrade deverá partir de uma cópia limpa da produção. Não serão executadas agora operações destrutivas para tentar adaptar esse banco ao novo histórico.

## Critérios de conclusão

- existe somente um conjunto de tabelas de estoque;
- dados e IDs históricos são preservados pela renomeação in-place;
- runtime não contém leitura híbrida;
- scripts e checkpoints de backfill foram removidos;
- schema, geração do Prisma Client e build passam;
- testes diretamente relacionados passam;
- upgrade validado em cópia de produção antes do deploy real.
