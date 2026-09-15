# Upgrade do backup de produção para o estoque multissetor

## Execução

Com esta versão completa da aplicação e `backend/.env` apontando para o banco
pretendido, execute em `backend/`:

```bash
npx prisma migrate deploy
```

O ponto de partida validado é o backup com a migration
`20260913000000_add_stable_auth_identity` concluída. Não há migrations com falha
pendente nesse backup. Não é necessário executar `resolve`, recriar o banco ou
editar `_prisma_migrations`.

O build normal da aplicação continua gerando o Prisma Client (`npm run build`).
`migrate deploy` atualiza o banco; não substitui o build ou a publicação da aplicação.

## Organização

- Os oito arquivos históricos ausentes foram recuperados do commit `1b93e65`.
  Como seus nomes já constam como concluídos no backup, o deploy não os reaplica.
- As nove migrations multissetor, ainda não aplicadas em produção, foram movidas
  para `20260915160000` até `20260915160800`, depois da linha histórica de produção.
- O diretório contém 25 migrations: 16 históricas e 9 pendentes nesse backup.
- Não foram alterados checksums ou registros no banco. Há divergências antigas
  de conteúdo em `0_init`, `20260327174728_init`,
  `20260407000000_sincronizacao_user_usuarios` e no marcador histórico
  `20260807_sync_settings_schema`. Isso não impediu o deploy/status no ensaio.
  Não inventar SQL nem editar checksums para ocultar essa proveniência.

As renomeações valem para este ponto de partida restaurado. Bancos de ensaios
anteriores que já receberam os nomes antigos não são o ponto de partida desta
entrega. A validação de upgrade não certifica reconstrução de todo o histórico
antigo a partir de um banco vazio.

## Conversões e preservação

- `Material.categoryId/unitId` são convertidos para `type/unit` usando categoria
  e unidade da mesma fábrica, antes de remover as colunas relacionais antigas.
  A conversão falha se não conseguir resolver todos os valores.
- `Movement.originName` e a origem relacionada são preservados em `origem`;
  os snapshots existentes de material e localização são mantidos.
- SAJ mantém seu ID, configuração e usuários. STJ não é recriada.
- Todos os vínculos de `LocationCategory` são mantidos. As novas fábricas recebem
  todos os vínculos das localizações copiadas de SEST.
- `authOrigin/authUserId` e seu índice único são preservados.
- Os índices GIN de `pg_trgm` e os checks de saldo existentes são preservados.
- As novas fábricas previstas na cadeia são ITB, VDC, ITP e IVT. O cadastro e a
  replicação de configurações não copiam materiais, saldos ou usuários.

## Ensaio realizado

Banco isolado: `sobracorte_deploy_acceptance_20260915`.
Origem: cópia do schema `sobra_corte` e da extensão `pg_trgm` do backup restaurado,
incluindo o histórico Prisma. O restore da cópia usou `--exit-on-error`.

1. Um `migrate deploy` aplicou as nove migrations, sem `resolve`.
2. Um segundo `migrate deploy` informou `No pending migrations to apply`.
3. `migrate status` informou `Database schema is up to date`.
4. `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   informou `No difference detected`.
5. A comparação registro a registro confirmou a preservação dos 3.430 materiais,
   203 movimentações, 20 usuários, 163 vínculos material/localização, 23 vínculos
   localização/categoria e todos os registros originais de configurações/auditorias.
6. As 16 rotas verificadas responderam HTTP 200, incluindo dashboard, estoque,
   relatórios, configurações, usuários e requisições.
7. Gravações com o Prisma Client gerado para material, movimentação, auditoria,
   estoque multissetor e requisição passaram em transação revertida no final.

Os testes de API usam um JWT de teste assinado localmente para o administrador da
cópia. Não verificam a disponibilidade do serviço externo de login nem o navegador.

Verificadores reproduzíveis (fora da suíte unitária automática):

- `node tests/verify-production-upgrade.cjs <banco-isolado>`: somente leitura;
  usa `DATABASE_URL` como origem restaurada e compara com o banco migrado indicado.
- `node tests/smoke-production-upgrade.cjs`: usa `DATABASE_URL` apontando para a
  cópia isolada, após o build; rejeita bancos sem prefixo
  `sobracorte_deploy_acceptance_` ou host não local. As gravações são revertidas.

O banco `postgres` restaurado fica reservado para o deploy manual do usuário.
