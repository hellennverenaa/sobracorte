# Pontos restantes da análise priorizada do SobraCorte

**Data:** 02/10/2026

**Escopo:** somente os três pontos ainda citados na análise anterior. Os pontos previamente validados foram removidos deste arquivo.

**Nomenclatura:** APOIO continua sendo o valor interno; na interface, o nome é “Peças Cortadas”.

## 1. P1 — Bloquear acesso de perfil operacional sem setor atribuído — VALIDADO

### Problema

O teste HTTP reproduziu `GET /inventory/search` retornando `200` para um vínculo `admin_setor` sem setor. `effectiveRoleForBinding` rebaixava silenciosamente perfis operacionais sem setor para `leitor`. Como o leitor pode consultar todos os setores da unidade, esse rebaixamento liberava a consulta.

O papel `leitor` sem setor é uma exceção prevista e deve continuar podendo consultar o estoque multi-setor. O perfil operacional precisa de um setor válido.

### Ajuste

- Manter o papel persistido do vínculo, sem converter `admin_setor`, `lider` ou `movimentador` em `leitor` quando o setor estiver ausente ou inválido.
- Deixar a validação de `requireAuth` bloquear esses perfis com `403` por meio de `assignedStockSector`.
- Preservar a consulta multi-setor para o perfil `leitor` sem setor.

### Validação executada

- Antes do ajuste, o teste HTTP reproduziu a falha: resposta `200` para `admin_setor` sem setor.
- Depois do ajuste, `admin_setor` sem setor e com setor `TODOS` recebe `403` em `/inventory/search`.
- Leitor sem setor recebe `200` em `/inventory/search`.
- Teste HTTP de autenticação: 10 passaram, 0 falharam.
- Testes unitários de autenticação: passaram.
- Verificação TypeScript do backend (`tsc --noEmit`): passou.

## 2. P2 — Compatibilidade de Cabedal nas requisições de Peças Cortadas — VALIDADO

### Ajustes e validação executada

- O formulário tem um modo próprio para matéria-prima do Corte e um formulário compartilhado para reutilização de produtos/componentes nos demais setores.
- Matéria-prima usa o código interno do material e consulta somente o estoque do Corte. Ela não aparece como substituta de SKU/modelo de produto acabado.
- Em APOIO, peça cortada consulta `pieceCode` e cabedal consulta SKU. O formulário coleta modelo e variantes relevantes; lado não é exigido para peça cortada porque o cadastro desse componente não guarda lado.
- A busca automática rejeita tipo, modelo, cor/material, grade, lado e unidade incompatíveis. Variantes ausentes geram candidatos separados e não somam saldo entre itens; cada candidato informa seu próprio saldo e localização.
- Entre candidatos compatíveis, a lista prioriza itens de etapas de produção mais prontas.
- Os testes focados de busca de requisição passaram: 15 aprovados, 0 falharam. Cobrem busca exata, variantes incompatíveis e incompletas, falta de correspondência, isolamento da matéria-prima do Corte e prioridade de candidatos.
- Build de produção do frontend e verificação TypeScript (`tsc --noEmit`) do backend passaram. `git diff --check` passou.

## 3. P3 — Automatizar a validação do nome “Peças Cortadas” — VALIDADO

Criar uma verificação automatizada para garantir que telas e textos voltados ao usuário exibam “Peças Cortadas” para o setor APOIO. Manter `APOIO` nos valores internos, banco, API e permissões. Cobrir também os textos de relatórios e modelos de CSV que exibem o nome do setor.

**Critério de conclusão:** a verificação identifica novas ocorrências visíveis de “APOIO” sem falhar para referências internas autorizadas, e os testes relevantes passam.

### Ajustes e validação executada

- Adicionada uma guarda automatizada dos templates Vue que detecta “APOIO” em texto, interpolação e atributos visíveis, preservando comparações internas e chamadas ao formatador do setor.
- Mensagens de validação e rótulos do Dashboard exibem “Peças Cortadas”. O valor `APOIO` permanece nos identificadores, filtros e respostas JSON.
- Exportações CSV de inventário, movimentações e requisições exibem “Peças Cortadas”; os filtros internos continuam usando `APOIO`. O modelo CSV de Configurações também foi validado.
- Testes focados do frontend (`sectorDisplayName`, `reports` e `settings`): passaram.
- Testes focados do backend (`reportPagination` e `stockValidation`): 14 passaram, 0 falharam.
- `git diff --check`: passou.
- Execução completa de `npm test` no frontend: 11 passaram e 4 arquivos de teste falharam fora deste ponto (`dashboard.component`, `inventory.component`, `unitAccess` e `users.permissions`).
