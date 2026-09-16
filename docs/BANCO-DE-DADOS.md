# Banco de dados e multi-tenancy

Todos os modelos de domínio, exceto `FactoryUnit`, pertencem a uma unidade por `factoryUnitId`. O cliente padrão Prisma aplica o `TenantGuard` em cada operação.

- Sem `tenantStorage` ativo, a operação falha antes de consultar PostgreSQL.
- Leituras e mutações em lote recebem a unidade ativa e rejeitam `factoryUnitId` estrangeiro explícito.
- Criações recebem a unidade ativa e rejeitam tentativa de gravar outra unidade.
- `findUnique`, `findUniqueOrThrow`, `update`, `delete` e `upsert` exigem seletor que inclua a unidade ativa, normalmente uma chave composta como `id_factoryUnitId`.
- `upsert` também fixa e valida a unidade de `create`.

Operações singulares não devem ser feitas por `id` isolado. Ao adicionar um novo modelo tenant que precise dessa operação, inclua uma chave composta que contenha `factoryUnitId` e atualize a migration Prisma correspondente.

`prismaForInternalUse` não pode ser importado por controllers, serviços de requisição ou código acionado por usuário. Ele existe exclusivamente para scripts internos identificados. Não o use para contornar falhas do guard.

## Validação de isolamento

Os testes focados validam o fail-fast e todos os tipos de operação do guard. A prova final deve rodar o mesmo conjunto contra PostgreSQL descartável, com duas unidades e com leitura, criação, alteração, exclusão, upsert, lote e transação. Esta execução só é permitida com uma URL de banco de teste descartável explícita; a configuração local padrão não é considerada autorização para apagar ou recriar dados.

Depois de aplicar as migrations no banco descartável, execute:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npm --prefix backend run test:tenant:db
```

O teste se recusa a executar quando `DATABASE_URL` e `TEST_DATABASE_URL` não são exatamente iguais.
