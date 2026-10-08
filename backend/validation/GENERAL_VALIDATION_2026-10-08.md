# Validação geral após correções de cadastros legados

Escopo: contratos de entrada/configurações, categorias e unidades, isolamento
por fábrica/setor/subsetor, importação, movimentações, requisições e dashboard.
Nenhuma operação foi executada em produção. As migrations não foram alteradas.

## Defeitos corrigidos nesta rodada

- Consultas de localizações e origens com filtro explícito de Distribuição
  agora incluem o alias legado Expedição, preservando o filtro de fábrica.
- Edição de localização em modo SELECTED bloqueia a remoção de todas as
  categorias quando há itens alocados. A transição para ALL permanece válida:
  lista vazia nesse modo significa aceitar todas, e não remover a permissão.
- Dashboard de perfil restrito mostra e seleciona o setor atribuído, conforme
  os dados limitados pelo backend. Admin e administrador global mantêm a visão
  de todos os setores.
- O mock da rota de usuários no teste de autenticação passou a representar
  `subsectorAccesses`, relação incluída pela consulta real. A asserção HTTP 200
  e as verificações de RBAC foram mantidas.

## Evidência

- Build completo de backend e frontend passou.
- 29 testes direcionados de origem, categoria, localização e subsetor passaram.
- 14 testes de autenticação HTTP e compatibilidade de configurações passaram.
- Componentes de entrada rápida, configurações e dashboard passaram. O teste
  isolado do dashboard executou quatro cenários, todos aprovados.
- `tests/legacyLocationAcceptance.cjs`, após build, passou no clone local
  `sobracorte_deploy_acceptance_dynamic_clean_20261008`: oito localizações
  legadas, 16 entradas reais usando nome original e maiúsculas, todas apontando
  para os IDs existentes. Todas as entradas foram revertidas; o teste verifica
  ausência dos itens de ensaio após o rollback. Os candidatos são derivados do
  catálogo do clone, sem uma lista fixa de IDs de produção.
- Auditoria somente de leitura de categorias no clone retornou `blocked: 0`,
  sem categorias ausentes, quantidades inválidas, vínculos inválidos, códigos
  duplicados ou migrations falhas.

## Pendências da suíte geral

A validação geral não está integralmente aprovada. A execução inicial do backend
teve 219 testes aprovados, quatro falhas (incluindo o teste pai de autenticação)
e 20 testes de banco ignorados por falta de destino descartável explícito.
A falha de autenticação foi corrigida e validada separadamente.
Após as correções, a suíte completa do backend foi repetida: **225 aprovados,
duas falhas e 20 ignorados**, em 247 testes. As duas falhas restantes são
exclusivamente os testes que dependem do CSV ausente descrito abaixo.

Dois testes de Distribuição dependem do arquivo externo ausente
`TESTE_DISTRIBUIÇÃO - modelo_importacao_distribuicao.csv`. Não foi inventado um
substituto para afirmar que os 582 pés do arquivo original foram validados.
Os demais testes de importação executados passaram.

Na execução inicial do frontend, 14 arquivos passaram e quatro falharam. O
dashboard foi corrigido e revalidado. Permanecem três arquivos com expectativas
incompatíveis com o comportamento atual:

- `inventory.component.test.js`: exige fallback CORTE para URL de Consumo;
  o código atual descarta setores inválidos para TODOS, sem reclassificar estoque.
- `unitAccess.test.js`: exige que leitor sem setor fique pendente; a regra atual
  permite leitura sem setor.
- `users.permissions.component.test.js`: exige setor obrigatório ao editar
  leitor; o formulário atual declara esse campo opcional.

Não foram enfraquecidas essas asserções nem alteradas as regras do produto para
ocultar divergências. Falta formalizar as expectativas e atualizar os testes
correspondentes. Testes PostgreSQL ignorados e aceitação visual em navegador
real não são cobertos pela aprovação dos testes unitários/componentes.

O HTTP 400 informado para PUT de localização ainda exige o corpo da resposta
para identificar a restrição efetivamente acionada. As quatro divergências
históricas de checksum continuam documentadas no relatório do upgrade; esta
rodada não as resolve nem as oculta.

## Publicação

As correções desta rodada exigem publicar backend e frontend e reiniciar a API
pelo procedimento existente. Não exigem nova migration ou alteração manual dos
nomes/vínculos. A suíte geral deve fazer parte da revisão de release; sucesso de
build ou `migrate deploy` sozinho não comprova compatibilidade dos cadastros.
