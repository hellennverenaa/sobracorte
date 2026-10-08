# Atualização da versão 2.0 preservando dados

Comparação local: `refactor/sobra_corte2.0` em `d41937b` contra
`fix/correcoes-sobracorte` em `b8e7f87`. A referência remota local da branch 2.0
aponta para o mesmo commit; não foi realizado fetch nem acesso à produção.
Nenhuma migration anterior foi alterada ou removida nesta comparação.
O histórico real em `_prisma_migrations`, e não o nome da branch, determina
quais migrations devem ser aplicadas.

## Diferenças e riscos

| Migration nova | Adequação | Ponto de atenção |
| --- | --- | --- |
| `20261001120000_category_sector_scope_and_stock_category` | Escopo de categorias, vínculo no estoque e localização/categoria | Atualiza `componentType` de itens vinculados. Correspondência por nome normalizado pode ter mais de uma categoria; revisar antes do ensaio. |
| `20261002130000_editable_component_subtypes` | Catálogo legado de subtipos e vínculo nas categorias | O catálogo permanece arquivado na versão atual; não excluir seus registros. |
| `20261002150000_sector_scrap_origins` | Acrescenta origens por fábrica | Mantém origens existentes por conflito de nome; conferir setor e disponibilidade. |
| `20261002170000_requisition_cross_sector_sources` | Campos de origem/unidade e tabela de compatibilidades | Requisições antigas mantêm campos novos nulos ou defaults; validar atendimento histórico, inclusive fracionado. |
| `20261005120000_add_subsector_inventory_scope` | Subsetores e permissões | Vínculos novos opcionais; estoque antigo não recebe subsetor automaticamente. |
| `20261006120000_location_category_mode` | Modo de categorias na localização | Localizações antigas recebem `SELECTED`, preservando restrição explícita. |
| `20261007120000_category_entry_rules` | Unidade/modo por categoria e unicidade de código/lado | Bloqueia classificação ambígua, mistura de medidas/modos, PAR persistido e quantidades fracionadas em unidades discretas. Possui transação explícita. |

As primeiras seis não possuem `BEGIN/COMMIT` explícitos. Não presumir rollback
integral diante de falha: verificar o esquema e os dados efetivamente persistidos.
A atualização muda classificações/configurações; preservação não significa que
todos os campos terão valores idênticos. IDs, saldos, alocações e histórico devem
ser comparados separadamente das alterações de classificação aprovadas.

## Diagnóstico inicial

No `backend`, com conexão configurada pelo operador, execute no clone ou com
acesso somente de leitura à produção:

```bash
psql -X -v ON_ERROR_STOP=1 -f validation/upgrade-diagnosis.sql > /tmp/sobracorte-upgrade-before.txt
```

Use configuração libpq existente (`PGSERVICE` ou variáveis `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER` e autenticação protegida). `psql` não lê o `.env` nem usa
`DATABASE_URL` automaticamente. Confirme o destino; não exponha a senha na linha
de comando. O SQL exige as tabelas da versão 2.0 e aborta se elas não existirem.
Ele é somente de leitura, informa histórico/esquema/saldos e grupos sem categoria
inequívoca. Não substitui a auditoria final de regras ou a comparação por registro.

Compare os checksums aplicados com os arquivos versionados correspondentes.
Migração ausente no repositório, checksum divergente ou tentativa falha exige
diagnóstico próprio antes do deploy. `migrate deploy` não detecta todo drift de
esquema; um histórico aparentemente correto não prova equivalência do banco.
O [relatório atualizado](PRODUCTION_UPGRADE_2026-10-08.md) documenta a investigação
das quatro divergências históricas deste backup. Não corrigir esse histórico
mediante atualização direta de checksum ou reaplicação de migrations antigas.

## Ensaio obrigatório para este upgrade

### Adequações por regras, sem registros fixos

O procedimento definitivo deve avaliar os dados presentes no momento da execução,
sem depender de IDs de fábricas/itens, contagens de um backup ou listas fechadas
de materiais. IDs podem aparecer no relatório para rastreabilidade; não devem
determinar quais registros uma regra alcança.

- Encontrar categorias pela unidade fabril, identidade normalizada e escopo de
  setor. Antes da associação, exigir exatamente uma correspondência. A primeira
  migration usa `UPDATE ... FROM` sem verificar multiplicidade, portanto esta
  verificação precisa ocorrer antes dela, inclusive para nomes que diferem apenas
  por caixa/espaços. Não selecionar uma correspondência arbitrária.
- Para tipos não vazios sem categoria, propor criação a partir da classificação
  existente e das regras observadas de unidade/lado. Reutilizar categoria existente
  somente quando escopo e regras forem compatíveis. Nome igual em setores com
  regras distintas exige separação explícita, pois o nome é único por fábrica.
- Tipos vazios, mistura de medidas ou de itens com/sem lado precisam de uma regra
  de negócio aprovada, aplicável ao grupo inteiro. Não substituir por uma categoria
  genérica apenas para fazer o deploy passar. A regra aprovada pode usar metadados
  legados; a lista de IDs do clone não deve ser reutilizada em produção.
- Preservar quantidades e medidas dos itens, IDs, alocações e campos históricos.
  Não inferir conversão de medidas ou divisão de um registro PAR. Divergências
  bloqueiam o procedimento e ficam explícitas no relatório.
- Simular por padrão. A aplicação deve recalcular o plano dentro da transação,
  impedir gravações concorrentes nas tabelas envolvidas e verificar os invariantes
  antes do commit. A preparação deve poder ser repetida sem criar duplicatas.

O ensaio aprova regras e invariantes, não um conjunto congelado de linhas. Na
produção, repetir a avaliação durante a janela sem gravações: novos registros
compatíveis são abrangidos pelas mesmas regras; novos casos ambíguos bloqueiam
a aplicação. Manutenção continua necessária para evitar que a preparação e as
migrations sejam executadas sobre estados diferentes.

### Execução no clone

Implementação disponível: `scripts/prepare-category-upgrade.cjs`, executada antes
de qualquer migration de outubro. Usa o `.env` de `backend`; `--database` muda
somente o nome do banco, mantendo host/usuário/credenciais da conexão configurada.
Confirme esses parâmetros antes de executar. Não imprime credenciais.

```bash
# Na pasta backend. Substitua BANCO_CLONE pelo nome real.
node scripts/prepare-category-upgrade.cjs --database=BANCO_CLONE > /tmp/category-plan.json
node scripts/prepare-category-upgrade.cjs --database=BANCO_CLONE --apply --confirm-database=BANCO_CLONE
```

Sem `--apply`, realiza apenas leitura. Com `--apply`, recalcula o plano sob locks,
insere categorias e altera somente `StockItem.type`, dentro de transação. Exige
confirmação do nome do destino. Retorna `2` quando há bloqueios, `1` quando não
conclui, `0` quando simula/aplica com sucesso. Nunca execute a aplicação após
saída diferente de zero. Arquivos de relatório contêm dados operacionais;
guarde-os com acesso restrito e fora do Git.

As regras iniciais são: preservar tipo textual existente; criar a categoria
faltante com medida observada; distinguir colisão em outro setor com o sufixo
`(SETOR)`; preencher tipo vazio somente para `APOIO/PECA_CORTADA` com
`MOLDE / PEÇA` e `MONTAGEM/PE_PRONTO` com `PE PRONTO`, conforme o catálogo do
domínio. Esses nomes são regras semânticas, não referências a registros fixos.
Outras classificações vazias e misturas bloqueiam a aplicação. A preparação não
edita unidade de categoria existente: a última migration deriva a unidade do
estoque. Revisar também configurações de categorias vazias.

Depois do deploy, com origem preservada e ensaio atualizado no mesmo servidor,
a comparação somente de leitura pode ser executada com:

```bash
node scripts/verify-category-upgrade.cjs BANCO_ORIGEM BANCO_CLONE > /tmp/category-verification.json
```

Ela confere campos antigos dos registros, histórico do Prisma, migrations novas
e checksums. Os únicos campos antigos de estoque que podem mudar são `type`
conforme o plano e `componentType` conforme a primeira migration. Nas categorias,
`defaultUnitCode` e `unitLocked` são alterações previstas. Retorno `2` informa
divergência de checksum histórico mesmo se a comparação de registros passar;
retorno `1` informa comparação incompleta ou invariantes violados.

1. Restaurar backup atualizado em banco isolado e confirmar sua recuperação.
   Guardar antes da atualização esquema, histórico, registros e saldos por
   fábrica/setor/medida. Não apontar o ensaio para produção.
2. Com base nos grupos encontrados, preparar regras de adequação:
   categorias faltantes, escopos, vínculos e classificações. Usar transação,
   verificações de correspondência inequívoca e invariantes antes/depois. Não converter
   medidas, arredondar quantidades, dividir pares ou excluir estoque para liberar
   a migration. Essas alterações exigem decisão operacional explícita.
3. Executar o reparo revisado no clone, seguido do deploy das migrations. O Prisma
   aplica todas as pendentes; não há seleção de apenas seis via `migrate deploy`.
   Se for necessário auditar um estado intermediário, usar checkout/cópia isolada
   contendo somente aquele histórico, sem remover migrations do checkout de release.
4. No clone atualizado, executar:

   ```bash
   npx prisma migrate status
   node scripts/audit-category-entry.cjs > /tmp/sobracorte-category-after.json
   npm run build
   ```

5. Comparar registros antigos por chave e campo: itens, alocações, localizações,
   movimentos, requisições, usuários, identidades, permissões e auditorias.
   Contagens e somas sozinhas não comprovam preservação. Documentar separadamente
   os campos alterados por regra aprovada e as inclusões esperadas.
   Confirmar também a equivalência do esquema com
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`.
   Esse comando consulta o banco configurado e não executa o SQL de adequação.
6. Validar entrada, saída, transferência, pares, importação, requisições históricas,
   relatórios e acesso por fábrica. O teste `tests/categoryEntryProductionUpgrade.cjs`
   exige build e clone local com nome `sobracorte_deploy_acceptance_*`; executá-lo
   somente após revisar suas premissas para o novo backup. Confirmar também a UI.

O relatório [do ensaio anterior](PRODUCTION_UPGRADE_2026-10-07.md) registra
569 itens que exigiram preparação. O [SQL daquele backup](category-entry-preflight.sql.review)
não é genérico e foi aprovado para testes. Suas contagens/IDs não autorizam seu
uso no banco atual. As mudanças posteriores de medida descritas no relatório
também foram específicas de testes e não fazem parte do deploy automático.

## Aplicação e recuperação

Depois do ensaio e da aprovação das regras de adequação, bloquear gravações em todos os
processos que acessam o estoque, obter backup atualizado e repetir o diagnóstico.
Recalcular a preparação sobre os dados atuais e bloquear diante de casos não
abrangidos pelas regras aprovadas. Aplicar o SQL revisado e executar
`npx prisma migrate deploy` na pasta `backend`, com configuração de destino
confirmada. Publicar backend e frontend compatíveis e verificar status, auditoria,
comparação de dados e fluxos antes de liberar gravações.

Se falhar, preservar o erro e verificar os objetos/dados reais. `resolve --rolled-back`
altera o histórico, não desfaz DDL ou dados. Na última migration, confirmar primeiro
que a transação foi revertida. Nas demais, planejar reversão dos passos parciais
ou conclusão exata dos passos faltantes, ensaiando no clone. `resolve --applied`
só se justifica quando todos os efeitos estiverem comprovadamente completos.
Não reescrever migrations aplicadas, usar `db push`, resetar o banco ou marcar
uma migration incompleta como aplicada.

Retornar apenas o código antigo não restaura o banco. Manter gravações bloqueadas
até decidir entre correção adiante e restauração validada, considerando os dados
gravados após o backup.

Referências oficiais: [recuperação de migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing)
e [aplicação de migrations](https://www.prisma.io/docs/orm/migrations/applying-a-migration).
