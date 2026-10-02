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

## 2. P2 — Compatibilidade de Cabedal nas requisições de Peças Cortadas — PENDENTE

### O que falta validar

O estoque interno APOIO pode guardar peças cortadas e cabedais, mas a busca de requisição precisa usar a identidade adequada ao tipo de material. Peça cortada usa código da peça (`pieceCode`); cabedal pode ser identificado por SKU. Uma busca que use apenas o código de peça pode ocultar cabedais ou sugerir registros incorretos.

Validar e alinhar o formulário e a busca do backend para distinguir tipo/componente, SKU ou código da peça, modelo, material/cor, grade e lado (`E`, `D` ou `PAR`). A busca precisa permanecer restrita aos identificadores e variantes informados, sem sugerir outros materiais apenas porque compartilham parte do texto.

### Critérios de validação

- Cabedal em APOIO encontrado pelo SKU e variantes compatíveis.
- Peça cortada encontrada pelo código da peça e variantes compatíveis.
- Tipo, modelo, cor/material, grade e lado incompatíveis não aparecem como substituições.
- Saldo e localização são exibidos para cada candidato sem somar itens diferentes.
- Testes cobrem busca exata, variantes incompletas e ausência de correspondência.

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
