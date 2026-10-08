# Busca geral e subsetores — revalidação

Implementado após aprovação do usuário.

## Busca

- Busca inicial por trecho de código/SKU, sem categoria obrigatória. Também encontra código da peça e código de matéria-prima.
- Todos os setores é o filtro padrão; prioridade: Montagem, Distribuição (inclui EXPEDICAO legado), Pré-Fabricado, Peças Cortadas (APOIO), Corte.
- Setor específico restringe efetivamente a consulta, mantendo filtro de unidade, setor autorizado e subsetores permitidos.
- Seleção preenche categoria, descrição, modelo, cor, grade, lado e unidade conforme a sugestão. A categoria vem do material; não é selecionada antes da busca.
- Busca por setor selecionado e setor real do item são estados separados. A requisição usa o setor real da sugestão escolhida.
- Consulta limitada a 100 registros recentes por setor e resposta de até 30 sugestões; não é busca ilimitada nem medição de carga.

## Subsetores

Reproduzido erro Prisma Unknown argument factoryUnitId na criação aninhada das categorias. Criação/edição agora gravam os vínculos por createMany dentro da mesma transação, com unidade explícita. Leitura final retorna os vínculos atualizados.

No clone, criação QA SERIGRAFIA SELECTED com duas categorias retornou 201. Edição para uma categoria retornou 200, com vínculo atualizado. Nenhuma alteração em produção.

## Verificações

- Build completo backend/frontend aprovado.
- 32 testes backend aprovados: subsectorAccess, requisitionStockCandidates, stockReliability. Nova regressão verifica prioridade dos cinco setores, busca parcial e consulta específica.
- Testes de componente da página Requisitions aprovados, incluindo padrão Todos os setores e ausência de categoria manual.
- Chromium real: busca QA sem categoria mostrou Montagem primeiro; filtro Distribuição retornou somente esse setor; seleção preencheu dados, sem erro HTTP/runtime. Evidência sobracorte-general-search.json.
- Banco clone sobracorte_user_acceptance_20261008; autenticação externa simulada, aplicação e persistência reais.

Atualizar backend e frontend. Nenhuma migration nova, commit ou deploy executado. Permanecem as limitações gerais do relatório original, inclusive concorrência, provedor externo e carga prolongada.
