# Banco de dados e multi-tenancy

Os modelos de domínio pertencem a uma unidade por `factoryUnitId`, com duas exceções de bootstrap: `FactoryUnit` e `AuthIdentity`. A identidade usa `nativeUnitId` e só pode ser consultada pela chave estável completa no fluxo autenticado. O cliente padrão Prisma aplica o `TenantGuard` aos modelos com `factoryUnitId`.

- Sem `tenantStorage` ativo, a operação falha antes de consultar PostgreSQL.
- Leituras e mutações em lote recebem a unidade ativa e rejeitam `factoryUnitId` estrangeiro explícito.
- Criações recebem a unidade ativa e rejeitam tentativa de gravar outra unidade.
- `findUnique`, `findUniqueOrThrow`, `update`, `delete` e `upsert` exigem seletor que inclua a unidade ativa, normalmente uma chave composta como `id_factoryUnitId`.
- `upsert` também fixa e valida a unidade de `create`.

Operações singulares não devem ser feitas por `id` isolado. Ao adicionar um novo modelo tenant que precise dessa operação, inclua uma chave composta que contenha `factoryUnitId` e atualize a migration Prisma correspondente.

`prismaForInternalUse` não pode ser importado por controllers, serviços de requisição ou código acionado por usuário. Ele existe exclusivamente para scripts internos identificados. Não o use para contornar falhas do guard.

As tabelas legadas `User` e `RoleChangeAudit.userId` permanecem durante a expansão. O modelo novo adiciona `AuthIdentity`, `UserRoleBinding` e a referência opcional `RoleChangeAudit.bindingId`; nenhuma tabela legada é removida neste ciclo.

O backfill normaliza origem vazia como `LEGADO` e ID vazio como `usuario`. Grupos com mais de um `User` para a mesma chave normalizada são registrados em `IdentityMigrationConflict` e não são migrados. O trecho de backfill pode ser repetido: identidades são atualizadas por chave estável, vínculos usam `ON CONFLICT DO NOTHING` e conflitos possuem chave determinística única.

Antes de qualquer contração, a consulta abaixo deve retornar zero:

```sql
SELECT count(*) FROM sobra_corte."IdentityMigrationConflict";
```

Um resultado diferente de zero exige reconciliação manual; nunca escolha automaticamente um dos registros listados em `legacyUserIds`.

## Validação de isolamento

Os testes focados validam o fail-fast e todos os tipos de operação do guard. A prova final deve rodar o mesmo conjunto contra PostgreSQL descartável, com duas unidades e com leitura, criação, alteração, exclusão, upsert, lote e transação. Esta execução só é permitida com uma URL de banco de teste descartável explícita; a configuração local padrão não é considerada autorização para apagar ou recriar dados.

Depois de aplicar as migrations no banco descartável, execute:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npm --prefix backend run test:tenant:db
DATABASE_URL="$TEST_DATABASE_URL" npm --prefix backend run test:identity:db
```

O teste se recusa a executar quando `DATABASE_URL` e `TEST_DATABASE_URL` não são exatamente iguais.

## Estoque canônico

O procedimento operacional de expansão, backfill, reconciliação e cutover está em [Migração para o estoque canônico](MIGRACAO-ESTOQUE-CANONICO.md). O gate é obrigatório e a implantação usa janela sem gravações, não dual-write.
