# Ciclo 0 — Baseline e contratos

## Checkpoint

- Data: 2026-09-16.
- Branch: `refactor/sobra_corte2.0`.
- Commit-base do ciclo: `cf2126b75cc0cf6ef36fedbad7e6aa0d5f2ee138`.
- O checkpoint começou com a árvore de trabalho limpa.
- Os arquivos `backend/.env` e `frontend/.env` existem apenas localmente e não são versionados. Somente os respectivos `.env.example` estão no Git.
- `backend/dist` não é versionado.
- `frontend/sobra_corte` contém quatro artefatos de build versionados. Eles são dívida conhecida e serão removidos no Ciclo 6.

## Baseline reproduzível

Execute a partir da raiz do repositório, salvo indicação contrária:

| Verificação | Comando | Resultado do checkpoint |
|---|---|---|
| Testes do backend | `npm --prefix backend test` | 129 testes passaram |
| Testes do frontend | `npm --prefix frontend test` | 3 testes passaram |
| Build do backend | `npm --prefix backend run build` | passou |
| Build do frontend | `npm --prefix frontend run build` | passou com alerta de chunk principal de 509,06 kB |
| Schema Prisma | `cd backend && npx prisma validate` | válido |
| Higiene do diff | `git diff --check` | passou |

No ambiente restrito, a primeira execução dos testes do backend falhou antes dos testes porque o `tsx` não pôde criar seu socket IPC em `/tmp`. A mesma suíte passou fora dessa restrição; isso é uma limitação do executor, não uma falha do projeto.

O build Vite escreve em `frontend/sobra_corte` e altera artefatos versionados. No checkpoint, essas alterações foram restauradas depois da validação. Até o Ciclo 6, qualquer build deve ser seguido de revisão explícita do status para impedir commits acidentais de bundles.

## Estado arquitetural inicial

- `User` mistura identidade autenticada, dados cadastrais e RBAC local.
- Quando não existe usuário local, o middleware ainda aceita `role` e `assignedSector` do JWT.
- O cliente Prisma protegido injeta tenant em operações de coleção e criação, mas não valida seletores de `findUnique`, `update`, `delete` e `upsert`.
- O cliente sem proteção tenant é usado no bootstrap HTTP de autenticação e em scripts internos.
- `Material`/`MaterialLocation`/`Movement` coexistem com `StockItem`/`StockItemLocation`/`StockMovement`.
- As APIs legadas e oficiais coexistem.
- Relatórios ainda unem as duas famílias de estoque em memória.
- O frontend usa um único booleano de carregamento no store de estoque e possui somente testes de helpers e fluxos sem montagem de componentes Vue.

Esses itens são o estado anterior aos ciclos e não devem ser confundidos com regressões introduzidas pela evolução.

## Contratos compartilhados

### Identidade, RBAC e unidade ativa

- Identidade autenticada e vínculo RBAC por unidade são entidades separadas.
- A unidade nativa vem do claim de unidade validado do token.
- `X-Dass-Unit` seleciona a unidade ativa; não altera a unidade nativa nem a identidade.
- A identidade é identificada por unidade nativa, origem e ID estável do provedor.
- Claims `role` e `assignedSector` do provedor nunca concedem autorização local.
- Sem vínculo local, o papel efetivo é `leitor` e o setor efetivo é `null`.
- A única exceção é o administrador reconhecido por `GLOBAL_ADMIN_IDENTITIES`.
- `GLOBAL_ADMIN_IDENTITIES=UNIDADE:MATRÍCULA` permanece sendo a configuração pública.
- Visitar outra unidade como administrador global não cria vínculo RBAC local.
- O primeiro login comum pode criar um único vínculo somente na unidade nativa.
- Sincronizações posteriores atualizam apenas dados cadastrais; papel e setor locais são preservados.

### Tenant

- Toda operação em modelo com `factoryUnitId` exige contexto tenant ativo.
- Operações singulares devem selecionar pela unidade ativa ou por chave composta equivalente.
- Relações e transações não podem associar registros de unidades diferentes.
- O cliente sem proteção tenant fica restrito ao bootstrap mínimo e a scripts internos identificados.
- O aceite de isolamento exige PostgreSQL descartável com pelo menos duas unidades; testes em memória não são prova suficiente.

### Estoque e API

- `StockItem`, `StockItemLocation` e `StockMovement` serão o modelo canônico, incluindo o setor `CORTE`.
- `/inventory/*` será a única API funcional de estoque depois do cutover.
- Relatórios paginados retornam `{ items, pagination, totals }`.
- `page` começa em `1`, `limit` tem padrão `50` e máximo `200`.
- Totais são calculados no banco e não variam entre páginas.
- Exportações retornam o conjunto completo por streaming.
- `DISTRIBUICAO` é o setor canônico; `CABEDAIS` e `EXPEDICAO` são apenas entradas legadas normalizadas na fronteira.

### Migração

- Expansão e contração nunca pertencem ao mesmo lote de `prisma migrate deploy`.
- O backfill é um comando versionado, observável e reexecutável, separado das migrations Prisma de execução única.
- O cutover depende de reconciliação com zero divergências.
- Estruturas antigas permanecem intactas para rollback até o Ciclo 8.
- A contração depende de backup restaurável, ensaio, nova reconciliação e autorização explícita.

## Especificação das fixtures de reconciliação

As fixtures executáveis serão implementadas no Ciclo 3. O conjunto mínimo deve conter:

- duas unidades fabris com códigos distintos;
- códigos de item repetidos entre unidades para provar isolamento;
- material de Corte com saldo distribuído em duas ou mais localizações;
- item sem saldo e item com estoque mínimo configurado;
- movimentos de entrada, saída e refugo com snapshots completos;
- movimento cujo item de origem já foi excluído, preservando apenas snapshots;
- itens e movimentos usando `EXPEDICAO` como valor legado, com resultado esperado `DISTRIBUICAO`;
- identidades de operador ausentes e presentes;
- datas históricas e valores decimais de Corte;
- quantidades inteiras nos setores discretos.

Para cada unidade, a reconciliação deve comparar:

1. quantidade de itens por setor;
2. correspondência determinística entre registro legado e canônico;
3. saldo total por item;
4. saldo por localização;
5. quantidade e volume dos movimentos por tipo;
6. snapshots, operador, datas, origem e motivo;
7. ausência de registros órfãos ou relações entre unidades;
8. resultado idêntico após a segunda execução do backfill.

Qualquer divergência bloqueia o cutover. Comparações de quantidade usam a precisão decimal armazenada no banco, sem conversão intermediária para ponto flutuante.

## Pendências aceitas para os próximos ciclos

- Ciclo 1: fechar confiança em claims e operações Prisma singulares, com testes reais de isolamento.
- Ciclo 2: separar identidade e vínculo RBAC local.
- Ciclo 3: implementar fixtures, backfill, reconciliação e cutover do estoque.
- Ciclo 6: remover bundles versionados e reduzir o README da raiz ao portal documental.
- Ciclo 8: executar a contração física somente após autorização.
