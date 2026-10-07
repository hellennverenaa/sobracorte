# Migração de categorias em produção

A correção `scripts/repair-category-entry-legacy.sql` foi preparada para três
registros específicos do banco de testes. **Não execute esse reparo em produção.**
Cada banco precisa de análise dos seus próprios vínculos e categorias.

## Auditoria e ensaio

1. Obtenha backup e valide sua restauração em uma cópia isolada da produção.
2. Na pasta `backend`, com `DATABASE_URL` apontando para essa cópia, execute:

   ```bash
   node scripts/audit-category-entry.cjs > category-entry-before.json
   ```

   O comando executa somente consultas, em transação de leitura. Código de saída
   `0` significa nenhum bloqueio encontrado; `2`, bloqueios nos dados ou no
   histórico de migrações; `1`, auditoria não concluída. O relatório contém IDs,
   configurações propostas, saldos por unidade/setor/medida e contagens históricas.
   Pode também ser executado com acesso somente de leitura no banco de produção.
   Não publique os relatórios: contêm dados operacionais.
3. Revise **todas** as configurações propostas, inclusive sem bloqueios. A migração
   prioriza a unidade efetivamente usada pelo estoque. Uma categoria configurada
   como `M`, mas com estoque em `M²`, passa a `M²` sem converter quantidades.
   Categorias vazias recebem regras derivadas da configuração legada.
4. Corrija os bloqueios no clone mediante decisões explícitas: vincular itens sem
   categoria, separar categorias com unidades ou modos misturados e regularizar
   quantidades incompatíveis. Nunca escolher arbitrariamente uma categoria nem
   converter unidades, arredondar saldos ou dividir pares sem análise do negócio.
5. Execute novamente a auditoria, ensaie `npx prisma migrate deploy` e valide a
   versão nova da aplicação: entradas por quantidade e por lado/par, importação,
   requisições e consulta dos dados históricos. Compare os saldos e as contagens
   antes/depois. Ausência de bloqueios não substitui esse ensaio; permissões,
   diferenças de esquema, disponibilidade e concorrência ainda podem impedir o deploy.

## Aplicação no banco de produção

Após aprovação do reparo específico e do ensaio:

1. Reserve janela de manutenção, interrompa gravações e obtenha backup atualizado.
2. Repita a auditoria. Execute apenas o reparo revisado para os dados de produção,
   se necessário, e confirme que desapareceram os bloqueios de dados.
3. Execute `npx prisma migrate deploy` e publique backend e frontend compatíveis,
   mantendo as gravações bloqueadas até a validação. Não altere a migração já
   aplicada, não use `prisma db push` e não use `migrate reset`.
4. Confirme `npx prisma migrate status`, saldos e contagens históricas, e os fluxos
   ensaiados antes de liberar as gravações. Guarde relatórios e logs do deploy.

## Se essa migração falhar

Pare e investigue o primeiro erro e o estado real do esquema. Esta migração possui
`BEGIN/COMMIT`: uma falha SQL deve reverter suas alterações. Confirme isso no
banco, corrija a causa e, **somente se a tentativa tiver sido revertida**, execute:

```bash
npx prisma migrate resolve --rolled-back 20261007120000_category_entry_rules
npx prisma migrate deploy
```

`resolve --rolled-back` ajusta o histórico do Prisma; não desfaz alterações de
dados. Não marque `--applied` uma migração incompleta. Após uma aplicação bem
sucedida, eventual retorno exige plano de compatibilidade ou restauração do backup;
voltar apenas o código ou marcar a migração como revertida não restaura o banco.

Referência: [Prisma: recuperação de migrações falhas](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing).
