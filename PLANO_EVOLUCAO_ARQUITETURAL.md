# Plano de Evolução Arquitetural do SobraCorte

## 1. Objetivo e regra de execução

Este documento é a referência obrigatória para a evolução arquitetural do SobraCorte. O objetivo é corrigir riscos de autorização e isolamento, separar identidade de RBAC, unificar o estoque, melhorar desempenho e usabilidade e remover código redundante.

Todo o trabalho será realizado na branch existente `refactor/sobra_corte2.0`, que é a branch atual do projeto, e fará parte de um único programa de evolução. Não criar branches auxiliares para os ciclos. Cada ciclo deve cumprir integralmente seus critérios de conclusão antes do início do ciclo dependente e terminar em um commit próprio. A implantação em produção será deliberadamente dividida em checkpoints: expansão e cutover primeiro; contração somente depois da reconciliação e de autorização explícita.

Regras gerais:

- Preservar alterações preexistentes e não modificar arquivos fora do escopo do ciclo.
- Não enfraquecer testes, validações, RBAC ou isolamento tenant para obter resultado positivo.
- Não executar migrações destrutivas ou operações de produção sem autorização explícita.
- Usar migrations Prisma versionadas; nunca usar `db push` em produção.
- Não incluir expansão e contração no mesmo lote executado por `prisma migrate deploy`; migrations destrutivas devem permanecer fora do caminho de implantação até o gate de contração.
- Não manter compatibilidade especulativa. As APIs legadas listadas neste plano serão removidas.
- Não avançar quando houver achado crítico ou alto aberto.
- Não misturar em um commit alterações pertencentes a ciclos diferentes.
- Antes de cada commit, revisar o diff e confirmar que somente o escopo do ciclo está incluído.
- Registrar no resumo de cada ciclo: commit, arquivos alterados, decisões, testes executados, resultados e pendências.
- Não reescrever, fazer squash ou alterar o histórico dos commits de ciclo sem autorização explícita.

### Política de documentação

- Toda documentação técnica criada ou atualizada durante os ciclos deve ficar em `docs/` na raiz do projeto.
- Este plano permanece na raiz por ser o documento operacional que governa a execução.
- `docs/README.md` é o portal da documentação e deve referenciar todos os documentos ativos.
- O `README.md` da raiz deve permanecer curto e apontar para `docs/README.md`, seguindo o padrão de `enviroment/dass_auth_service`.
- Contratos de API, arquitetura, autenticação, banco, desenvolvimento, testes, migração e implantação não devem ser duplicados no README principal.
- Quando um ciclo alterar comportamento documentado, a atualização correspondente em `docs/` faz parte do mesmo commit e do mesmo critério de conclusão.

## 2. Estratégia de agentes

O agente principal será responsável por registrar o baseline, preparar contratos, distribuir tarefas quando a delegação trouxer benefício real, revisar resultados, coordenar correções e validar a entrega integrada. Ele pode implementar mudanças pequenas, sequenciais ou diretamente bloqueadoras quando isso for o caminho mais simples e seguro.

Distribuição padrão:

- **Luna high:** frontend, experiência do usuário, testes gerais, documentação e limpeza.
- **Terra medium:** segurança, RBAC, multi-tenancy, modelagem, migrações, desempenho e outras tarefas arquiteturais complexas.
- **Agente principal:** orquestração, análise, contratos, controle de escopo e aceite dos ciclos.

Regras de delegação:

- Usar zero subagentes por padrão e no máximo dois simultâneos quando houver trabalhos substanciais, independentes e bem delimitados.
- Não permitir que dois agentes editem o mesmo diretório ou fluxo ao mesmo tempo.
- Reutilizar o agente que já conhece o contexto quando um ciclo evoluir naturalmente para o seguinte.
- Usar um agente novo para a revisão independente final.
- Toda correção encontrada pelo revisor volta ao agente proprietário do escopo.

### Política de commits

- O agente principal confirma o encerramento do ciclo antes do commit.
- O commit deve conter implementação, testes e documentação daquele ciclo.
- Usar mensagens no padrão `refactor(ciclo-N): resumo objetivo`.
- O ciclo 0 usa `docs(ciclo-0): registrar baseline e contratos`.
- Correções solicitadas antes do aceite entram no mesmo ciclo; se o commit já existir, criar `fix(ciclo-N): resumo objetivo`, sem alterar o commit anterior.
- O hash de cada commit deve ser registrado no acompanhamento deste plano.
- A criação de um commit depende de solicitação ou autorização explícita do usuário; concluir tecnicamente um ciclo não autoriza o agente a gravar o histórico por conta própria.

## 3. Custos relativos e ordem obrigatória

| Ciclo | Categoria | Custo relativo | Dependência |
|---|---|---:|---|
| 0 | Baseline e contratos | Baixo | Nenhuma |
| 1 | Segurança e multi-tenancy | Alto | Ciclo 0 |
| 2 | Identidade e RBAC local | Alto | Ciclo 1 |
| 3 | Unificação do estoque | Alto | Ciclo 2 |
| 4 | APIs e desempenho | Alto | Ciclo 3 |
| 5 | Frontend e usabilidade | Alto | Ciclos 2, 3 e 4 |
| 6 | Limpeza e redundâncias | Médio | Ciclos 3, 4 e 5 |
| 7 | Revisão e validação integrada | Alto | Ciclos 0 a 6 |
| 8 | Contração autorizada | Alto | Ciclo 7 e autorização explícita |

Os ciclos 1 a 4 são sequenciais. Trabalho frontend preparatório só pode ocorrer em paralelo quando não depender de contratos ainda em alteração. O Ciclo 8 não faz parte da implantação inicial e não pode ser antecipado.

## 4. Estratégia de validação

Durante os ciclos 1 a 6, executar somente a validação mínima capaz de provar a integração alterada: typecheck ou build quando o contrato exigir e testes diretamente ligados aos arquivos e fluxos modificados. Não executar a suíte completa, auditorias gerais ou matrizes adicionais por precaução. A validação completa e transversal fica concentrada no Ciclo 7; a única exceção é uma falha focal que forneça evidência concreta de regressão mais ampla.

Validação mínima por tipo de alteração:

- autenticação, RBAC ou tenant: testes focados do middleware, configuração e HTTP de autenticação, além de testes de integração em PostgreSQL descartável para o isolamento afetado;
- schema ou migration: validação do schema, geração do Prisma, migration em banco descartável e testes do serviço afetado;
- serviço ou controller: testes unitários e HTTP das rotas alteradas;
- frontend: testes dos helpers/componentes alterados e build Vite em diretório temporário quando houver mudança de integração ou template;
- documentação e limpeza: `git diff --check`, busca por referências removidas e build/typecheck somente quando a remoção afetar imports ou configuração;
- todo ciclo: `git diff --check`, revisão do diff e confirmação de que não há alteração fora do escopo.

Não executar a suíte completa nos ciclos 1 a 6. Se um teste focado revelar falha estrutural fora do escopo previsto, interromper o aceite, analisar a dependência e atualizar este plano antes de expandir o trabalho.

## 5. Ciclo 0 — Baseline e contratos

**Responsável:** agente principal
**Custo:** baixo
**Permissão:** somente inspeção e documentação do checkpoint

### Instruções

1. Registrar branch, commit-base e `git status` dos repositórios envolvidos.
2. Identificar alterações preexistentes, arquivos gerados e arquivos deliberadamente removidos.
3. Executar a menor baseline necessária para identificar o estado inicial: testes focados de autenticação/tenant, testes do frontend e builds atuais. Registrar qualquer falha preexistente.
4. Criar os contratos que serão compartilhados pelos agentes:
   - identidade autenticada é separada do RBAC por unidade;
   - `GLOBAL_ADMIN_IDENTITIES=UNIDADE:MATRÍCULA` continua sendo a configuração pública;
   - `/inventory/*` será a única API de estoque;
   - relatórios paginados retornarão `items`, `pagination` e `totals`;
   - o setor canônico é `DISTRIBUICAO`; `CABEDAIS` e `EXPEDICAO` são apenas entradas legadas a normalizar;
   - nenhuma visita de administrador global deve criar vínculo RBAC local automaticamente.
5. Especificar o formato, os casos representativos e os invariantes das futuras fixtures de reconciliação por unidade para itens, saldos, localizações e movimentos. A implementação executável dessas fixtures pertence ao Ciclo 3.

### Critérios de conclusão

- Baseline documentada e reproduzível.
- Alterações preexistentes identificadas e protegidas.
- Contratos disponíveis para todos os agentes.
- Falhas anteriores ao trabalho diferenciadas de regressões futuras.
- Documentação inicial registrada em `docs/` e indexada por `docs/README.md`.
- Formato e invariantes das fixtures de reconciliação documentados, sem alteração de código ou dados neste ciclo.
- Commit `docs(ciclo-0): registrar baseline e contratos` criado.

## 6. Ciclo 1 — Segurança, RBAC e isolamento multi-tenant

**Responsável:** Terra medium
**Custo:** alto
**Escopo principal:** `backend/src/auth`, `backend/src/middlewares`, cliente Prisma e testes correspondentes

### Instruções

1. Remover `role` e `assignedSector` do JWT como fontes de autorização.
2. Quando não houver vínculo RBAC local, usar papel efetivo `leitor` e setor `null`.
3. Manter como única exceção o administrador reconhecido por `GLOBAL_ADMIN_IDENTITIES`.
4. Fazer toda operação em modelo tenant falhar quando não existir contexto tenant ativo.
5. Para `findUnique`, `update`, `delete` e `upsert`, exigir `factoryUnitId` explícito ou chave composta equivalente.
6. Restringir o cliente sem proteção tenant ao bootstrap autenticado e a scripts internos explicitamente identificados.
7. Cobrir leitura, criação, alteração, exclusão e upsert tentando cruzar unidades.
8. Não considerar testes com objetos simulados suficientes para provar isolamento: executar essas operações, inclusive em transação e em lote, contra PostgreSQL descartável com pelo menos duas unidades.
9. Garantir que o guard rejeite a operação antes de consultar o banco quando faltar contexto tenant e rejeite seletores singulares que não contenham a unidade ativa.

### Critérios de conclusão

- Claims de papel ou setor do provedor não concedem autorização local.
- Nenhuma operação tenant aceita alvo de outra unidade.
- Operações sem contexto falham antes da consulta ao banco.
- Testes de integração provam isolamento de `findUnique`, criação, alteração, exclusão, upsert, operações em lote e transações; testes puramente em memória podem complementar, mas não substituir essa cobertura.
- Login, refresh e administrador global continuam funcionando.
- Testes focados de autenticação, middleware, configuração HTTP e isolamento passam.
- Documentação de autenticação e multi-tenancy atualizada em `docs/`.
- Commit `refactor(ciclo-1): fechar RBAC e isolamento tenant` criado.

## 7. Ciclo 2 — Separação entre identidade e RBAC local

**Responsável:** Terra medium reutilizado
**Custo:** alto
**Escopo principal:** schema Prisma, autenticação, usuários, auditoria e migrations

### Modelo pretendido

- **Identidade autenticada:** unidade de origem, origem do provedor, ID estável, matrícula e dados cadastrais sincronizados.
- **Vínculo por unidade:** referência à identidade, unidade, papel e setor atribuídos localmente.
- **Administrador global:** identidade configurada no ambiente; recebe papel efetivo global sem precisar de vínculo na unidade visitada.

### Contrato de bootstrap

- A unidade nativa vem exclusivamente do claim de unidade validado no token; `X-Dass-Unit` representa apenas a unidade ativa de navegação.
- A identidade é localizada pela unidade nativa, origem e ID estável do provedor, nunca pela unidade atualmente visitada.
- O primeiro login comum pode criar um vínculo somente na unidade nativa.
- O bootstrap de administrador global pode criar ou atualizar sua identidade na unidade nativa, mas nunca cria vínculo na unidade visitada.
- Uma identidade válida sem vínculo na unidade ativa recebe papel efetivo `leitor` e setor `null`, salvo a exceção explícita de administrador global.
- `check-user` deve retornar separadamente identidade, vínculo local, contexto efetivo, unidade nativa e unidade ativa; a ausência de vínculo não pode ser mascarada como vínculo persistido.

### Instruções

1. Criar entidades separadas para identidade autenticada e vínculo RBAC por unidade.
2. Garantir unicidade da identidade por unidade de origem, origem e ID do provedor.
3. Migrar usuários existentes para o novo modelo sem adivinhar associações ambíguas.
4. Gerar relatório dos conflitos; qualquer grupo ambíguo bloqueia a migration de contração.
5. No primeiro login comum, criar ou vincular exatamente um vínculo na unidade nativa.
6. Em logins posteriores, sincronizar somente dados cadastrais e preservar papel e setor.
7. Ao navegar como administrador global, registrar o ator nas auditorias sem criar vínculo RBAC na unidade de destino.
8. Atualizar listagem, edição, exclusão e histórico de usuários para operar sobre vínculos locais.
9. Garantir que login por outro provedor não converta silenciosamente uma identidade existente.
10. Tornar o bootstrap idempotente e seguro sob chamadas concorrentes, com restrições únicas e tratamento explícito de conflito.

### Critérios de conclusão

- Identidade e RBAC são persistidos separadamente.
- Visitar uma unidade como global não aumenta a lista de usuários locais.
- Identidades `LEGADO` e `EXTERNO` não colidem.
- Migração é idempotente e reporta ambiguidades.
- Papel e setor sobrevivem a login, refresh e sincronização.
- Chamadas concorrentes de bootstrap não criam identidades ou vínculos duplicados.
- Testes de autenticação, usuário, auditoria e navegação global passam.
- Schema Prisma e migration são validados em banco descartável.
- Documentação de identidade e RBAC atualizada em `docs/`.
- Commit `refactor(ciclo-2): separar identidade e vinculo local` criado.

## 8. Ciclo 3 — Unificação física do estoque

**Responsável:** Terra medium reutilizado
**Custo:** alto
**Escopo principal:** schema, migrations, importação e domínio de estoque

### Modelo canônico

- `StockItem` representa todos os setores, incluindo `CORTE`.
- `StockItemLocation` representa todo saldo físico por localização.
- `StockMovement` representa todo histórico de movimentação.
- Itens de Corte usam `sector=CORTE` e `componentType=MATERIA_PRIMA`.

### Instruções

1. Implementar neste ciclo somente expansão, backfill e cutover da aplicação. A contração física pertence exclusivamente ao Ciclo 8.
2. Migrar `Material` para `StockItem`, preservando código, nome, unidade, categoria, estoque mínimo, observação, datas e unidade fabril.
3. Migrar `MaterialLocation` para `StockItemLocation`, preservando saldo por prateleira.
4. Migrar `Movement` para `StockMovement`, normalizando o tipo e preservando snapshots, operador, datas, origem e motivo.
5. Implementar o backfill como comando versionado e reexecutável, separado das migrations Prisma de execução única, usando uma referência determinística para impedir duplicação.
6. Migrar importação CSV, requisições, movimentações, exclusões, auditorias, dashboard e relatórios para o modelo canônico.
7. Executar reconciliação por unidade antes do cutover da aplicação:
   - quantidade de itens;
   - saldo total por item;
   - saldo por localização;
   - quantidade e volume de movimentos por tipo;
   - ausência de registros órfãos.
8. Abortar o cutover se qualquer comparação não for exatamente igual.
9. Após o gate, remover leituras e gravações funcionais nos modelos antigos, mas manter suas tabelas e colunas intactas até o Ciclo 8.
10. Implementar fixtures executáveis com pelo menos duas unidades, dados históricos, snapshots sem relação ativa, aliases de setor e casos de saldo distribuído em múltiplas localizações.
11. Definir explicitamente a estratégia durante o rollout: janela sem gravações ou dual-write verificável. Não presumir dual-write sem implementá-lo e testá-lo.

### Critérios de conclusão

- Não existe leitura ou gravação funcional nas tabelas antigas após o cutover; as estruturas físicas permanecem disponíveis para rollback até o Ciclo 8.
- Reconciliação retorna zero divergências em todas as unidades.
- O comando de backfill pode ser repetido sem duplicar dados e sem depender de reaplicar migration Prisma.
- Importações e movimentações continuam atômicas.
- Testes de saldo, concorrência, exclusão e auditoria passam.
- Migration e reconciliação são validadas em fixture representativa; a execução completa sobre cópia anonimizada fica para o Ciclo 7.
- Documentação de dados e migração atualizada em `docs/`.
- Migrations destrutivas não estão no lote implantável deste ciclo.
- Commit `refactor(ciclo-3): unificar modelo de estoque` criado.

## 9. Ciclo 4 — APIs e desempenho

**Responsável:** Terra medium
**Custo:** alto
**Escopo principal:** rotas, relatórios, dashboard, queries e documentação de API

### APIs removidas

- `/materials`
- `/movements`
- `/stats`
- `/dashboard/origem-sobras`
- `/dashboard/distribuicao`
- `/dashboard/top-materiais`
- `/reports/data`

### APIs oficiais preservadas

- `/inventory/*`
- `/dashboard/summary`
- `/reports/inventory`
- `/reports/movements`
- `/reports/requisitions`
- respectivas rotas de exportação

### Instruções

1. Remover rotas, controllers, testes e documentação sem consumidores oficiais.
2. Implementar paginação de relatórios no banco:
   - `page` padrão `1`;
   - `limit` padrão `50`;
   - `limit` máximo `200`;
   - resposta `{ items, pagination, totals }`.
3. Calcular totais com agregações SQL independentes da página.
4. Não carregar, unir ou ordenar históricos completos em memória.
5. Medir planos das consultas críticas e criar apenas índices justificados.
6. Atualizar `docs/API.md`, smoke tests e coleções Postman. O README da raiz deve apenas apontar para a documentação especializada.

### Critérios de conclusão

- APIs removidas retornam 404.
- Nenhum arquivo ativo referencia as rotas removidas.
- Totais permanecem iguais em qualquer página.
- Consultas respeitam limites máximos.
- Exportações continuam produzindo o conjunto completo por streaming.
- Testes focados das rotas, paginação, totais e exportações passam.
- Contratos oficiais registrados em `docs/API.md` e indexados.
- Commit `refactor(ciclo-4): consolidar APIs e relatorios` criado.

## 10. Ciclo 5 — Frontend e usabilidade

**Responsável:** Luna high
**Custo:** alto
**Escopo principal:** `frontend/src`

### Direção de UX

A evolução será conservadora: preservar identidade visual, navegação e tarefas conhecidas, corrigindo inconsistências e estados confusos.

### Instruções

1. Dividir `Requisitions`, `Settings`, `InventoryHub`, `Dashboard` e `Reports` em componentes de apresentação e composables de domínio.
2. Padronizar em todas as páginas:
   - carregamento;
   - estado vazio;
   - erro recuperável;
   - botão de retry;
   - toast;
   - paginação;
   - limpeza e persistência de filtros.
3. Substituir o único booleano de carregamento do estoque por estados por operação ou contador concorrente.
4. Exibir a unidade ativa no layout e dentro de confirmações destrutivas.
5. Na troca global, mostrar progresso, sucesso ou falha sem renovar a identidade.
6. Bloquear troca de rota ou unidade quando houver formulário alterado sem confirmação.
7. Centralizar setores, aliases, papéis, rótulos e mensagens.
8. Mostrar a última atualização do dashboard e remover atualizações reativas a cada segundo.
9. Garantir foco em modais, navegação por teclado, labels e atributos `aria`.
10. Consumir somente as APIs oficiais do Ciclo 4.
11. Antes dos testes de componente, escolher e registrar em `docs/DESENVOLVIMENTO-E-TESTES.md` a infraestrutura mínima de testes Vue/DOM. Adicionar somente as dependências necessárias e cobrir comportamento observável, não detalhes internos dos componentes.

### Critérios de conclusão

- Nenhuma falha relevante fica somente no console.
- Usuário distingue vazio, erro, falta de permissão e indisponibilidade.
- Operações concorrentes não escondem carregamento prematuramente.
- Formulários alterados não são perdidos silenciosamente.
- Fluxos de estoque, requisição, relatório, configuração e troca global passam em testes de componente.
- Testes dos componentes, stores e fluxos alterados passam; build Vite valida a integração.
- Documentação de uso e desenvolvimento atualizada em `docs/` quando necessária.
- Commit `refactor(ciclo-5): modularizar frontend e padronizar ux` criado.

## 11. Ciclo 6 — Limpeza e redução de redundância

**Responsável:** Luna high reutilizado
**Custo:** médio

### Instruções

1. Remover `Materials.vue` e `Movement.vue`, pois suas rotas já redirecionam para o inventário.
2. Remover helpers, exports, imports e módulos sem consumidores.
3. Consolidar `tsconfig.json` e `jsconfig.json` em uma configuração de projeto.
4. Remover bundles compilados de `frontend/sobra_corte` do Git; o deploy deve executar o build.
5. Limpar regras duplicadas dos `.gitignore`.
6. Remover documentação e comentários sobre os modelos e endpoints antigos. As definições Prisma das tabelas preservadas para rollback são a única exceção temporária e devem estar marcadas como pendentes do Ciclo 8.
7. Consolidar normalização de setores e aliases.
8. Verificar dependências usadas; mover pacotes de tipagem para `devDependencies` e remover dependências sem uso comprovado.
9. Executar busca final por símbolos, rotas e arquivos mortos.

### Critérios de conclusão

- Nenhum arquivo ativo importa módulos removidos.
- Nenhuma rota ou documentação menciona APIs antigas.
- Nenhum bundle gerado permanece versionado.
- Configuração TypeScript é única e aceita pelo editor e pelo build.
- Toda redução é justificada por ausência de consumidor, substituição pelo caminho canônico ou eliminação de duplicação; não há meta artificial de linhas removidas.
- Testes diretamente afetados, verificação de imports e build/typecheck passam.
- `docs/README.md` referencia apenas documentação vigente.
- Commit `refactor(ciclo-6): remover legado e redundancias` criado.

## 12. Ciclo 7 — Revisão independente e validação integrada

**Responsável:** novo Terra medium
**Custo:** alto
**Permissão inicial:** somente leitura

### Instruções de revisão

1. Revisar todos os ciclos contra este documento.
2. Classificar achados por severidade e indicar arquivo, linha, impacto e correção esperada.
3. Verificar especialmente:
   - RBAC sem confiança em claims do provedor;
   - isolamento multi-tenant em todas as operações;
   - navegação global sem criação de vínculo local;
   - colisão entre origens de autenticação;
   - reconciliação da migração de estoque;
   - paginação e totais de relatórios;
   - estados de erro e carregamento do frontend;
   - remoção completa do legado.
4. Devolver correções ao agente proprietário do ciclo.
5. Repetir a revisão após as correções.

### Validação obrigatória

- Suíte completa do backend.
- Testes e build do frontend.
- Migrations não destrutivas aplicadas do zero em banco vazio.
- Migrations não destrutivas aplicadas sobre cópia anonimizada do banco atual.
- Backfill executado duas vezes para provar idempotência.
- Reconciliação 100% com zero divergências.
- Testes de isolamento executados em PostgreSQL descartável com duas ou mais unidades; simulações em memória não satisfazem este item.
- Smoke tests das APIs oficiais.
- Login legado e externo.
- Login, refresh, logout e expiração.
- Troca global repetida entre todas as unidades ativas.
- Importação, entrada, saída, transferência, refugo e casamento de pares.
- Requisições, relatórios e exportações.
- Busca por credenciais, rotas antigas, bundles e código morto.
- `git diff --check` e revisão integral do diff.

### Critérios finais de conclusão

- Nenhum achado crítico ou alto permanece aberto.
- Todas as suítes e builds passam.
- Reconciliação apresenta zero divergências.
- Alterações preexistentes foram preservadas.
- Nenhuma credencial foi adicionada ao Git ou aos logs.
- APIs e documentação refletem somente a arquitetura nova; estruturas físicas legadas podem permanecer exclusivamente para rollback até o Ciclo 8.
- O agente principal aprovou o diff integrado.
- Documentação final está completa, indexada e referenciada pelo README da raiz.
- Commit `test(ciclo-7): validar fluxo integrado` criado após o aceite da aplicação e do gate de dados.

## 13. Ciclo 8 — Contração física autorizada

**Responsável:** agente de dados que executou o Ciclo 3, com nova revisão independente
**Custo:** alto
**Dependências:** Ciclo 7 concluído, backup restaurável validado e autorização explícita do usuário

### Instruções

1. Confirmar novamente, imediatamente antes da contração, que não há leituras ou gravações nas estruturas antigas.
2. Reexecutar a reconciliação sobre a cópia anonimizada e registrar zero divergências.
3. Criar a migration Prisma de contração em lote separado das migrations de expansão.
4. Remover do schema Prisma as entidades e relações legadas somente no mesmo checkpoint da migration de contração.
5. Ensaiar a migration, medir locks, duração e espaço e validar a restauração do backup.
6. Submeter migration, evidências e procedimento de rollback a revisão independente.
7. Aplicar em produção somente durante a janela aprovada e após nova confirmação explícita.

### Critérios de conclusão

- Autorização de contração registrada.
- Backup restaurável e ensaio sobre cópia anonimizada comprovados.
- Reconciliação imediatamente anterior apresenta zero divergências.
- Schema Prisma, banco e código não contêm mais estruturas legadas.
- Suíte focada, smoke tests e reconciliação pós-contração passam.
- Commit `refactor(ciclo-8): contrair estruturas legadas` criado antes do rollout, sem aplicação automática em produção.

## 14. Rollout e rollback

### Checkpoint A — expansão e cutover

1. Gerar e validar backup restaurável.
2. Ensaiar migrations não destrutivas, backfill e aplicação em cópia anonimizada.
3. Medir duração, locks e espaço adicional.
4. Preparar uma curta janela sem gravações para backfill final e reconciliação, salvo se houver dual-write implementado e validado.
5. Aplicar somente as migrations não destrutivas e implantar juntos o backend e o frontend compatíveis com as estruturas expandidas.
6. Executar smoke tests e reconciliação pós-deploy.
7. Liberar gravações somente após validação.

### Checkpoint B — contração

1. Aguardar período de observação definido no aceite do Ciclo 7.
2. Confirmar que não há consultas ou gravações nas estruturas legadas.
3. Obter autorização explícita para executar o Ciclo 8 e para a janela de produção.
4. Aplicar separadamente a migration destrutiva já ensaiada.
5. Executar smoke tests e reconciliação pós-contração antes de encerrar a janela.

Rollback:

- Antes da contração, reverter a aplicação para o checkpoint anterior e manter as estruturas expandidas.
- Depois da remoção das tabelas antigas, o rollback depende da restauração do backup validado.
- A execução da contração em produção requer autorização explícita do usuário.

## 15. Decisões fixadas

- Todos os achados da revisão estão no escopo.
- O trabalho ocorrerá em um único programa e branch, mas a produção terá pelo menos dois checkpoints: expansão/cutover e contração.
- A execução ocorrerá somente em `refactor/sobra_corte2.0`.
- Cada ciclo concluído será registrado em commit próprio.
- Entre ciclos será executada validação mínima e proporcional; a validação integrada ocorrerá no Ciclo 7 e será repetida de forma focada após a contração.
- Documentação técnica ficará em `docs/` e será acessível pelo README principal.
- APIs antigas serão removidas, não mantidas permanentemente.
- A migração usará expansão, backfill reexecutável, reconciliação, cutover e contração autorizada em lote separado.
- O gate de dados exige reconciliação de 100%.
- A UX seguirá evolução conservadora.
- Não serão introduzidos frameworks ou abstrações sem necessidade demonstrada.
