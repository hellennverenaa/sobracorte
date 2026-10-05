# Plano priorizado de melhorias do SobraCorte

**Data:** 05/10/2026

**Escopo:** acompanha os pontos concluídos e a fila de trabalho. `VALIDADO` ou `CONCLUÍDO` indicam trabalho finalizado; `PENDENTE` indica trabalho ainda não implementado.

**Nomenclatura:** APOIO continua sendo o valor interno; na interface, o nome é “Peças Cortadas”.

## Visão geral

| Ponto | Prioridade | Situação | Resumo |
|---|---|---|---|
| 1 | P1 | VALIDADO | Bloquear acesso de perfil operacional sem setor atribuído |
| 2 | P2 | VALIDADO | Compatibilidade de cabedal nas requisições de Peças Cortadas |
| 3 | P3 | VALIDADO | Automatizar a validação do nome “Peças Cortadas” |
| 4 | P2 | CONCLUÍDO | Simplificar a experiência da tela “Estoque Multi-Setor” |
| 5 | P2 | PENDENTE | Organizar o formulário e a consulta do “Estoque Multi-Setor” |

**Próximo ponto:** o ponto 5 está detalhado abaixo e aguarda aprovação para implementação. Os pontos anteriores ficam registrados como histórico concluído.

## Detalhamento dos pontos

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

## 4. P2 — Simplificar a experiência da tela “Estoque Multi-Setor” — CONCLUÍDO

### Problema observado

- O formulário “Nova Entrada Rápida” aparece dentro da página e empurra filtros e tabela para baixo, fazendo a pessoa perder o contexto do estoque que estava consultando.
- O setor pode ser escolhido no campo “Setor Ativo” e novamente nas abas da tabela. As abas também criam rolagem horizontal em larguras menores, com a barra nativa do Windows visível.
- O menu lateral pode exibir uma barra vertical muito chamativa quando a janela é baixa.

### Objetivo

Simplificar a entrada de estoque e a navegação entre setores, preservando filtros, setor selecionado e acesso à tabela enquanto a pessoa trabalha.

### Etapas executadas

#### Etapa 1 — Abrir a entrada rápida em um diálogo

- Fazer o botão “Nova Entrada Rápida” abrir um diálogo, em vez de expandir o formulário no fluxo da página. O formulário completo não cabe bem em um menu dropdown; um menu só é útil se houver várias ações distintas para escolher.
- Usar um diálogo largo em desktop, com altura limitada à janela, cabeçalho e ações fixos e rolagem somente no corpo do formulário. Em telas estreitas, usar o diálogo em tela cheia.
- Usar como padrão o setor que estava ativo no estoque e manter dentro do diálogo a possibilidade de escolher outro setor.
- Preservar o comportamento de entrada rápida: após gravar, atualizar a lista, exibir confirmação e deixar o formulário pronto para outra entrada. Fechar ou cancelar com alterações pendentes deve continuar pedindo confirmação.

#### Etapa 2 — Unificar a seleção do setor

- Remover a duplicidade entre o campo “Setor Ativo” e as abas, que controlam o mesmo setor.
- Em telas largas, mostrar um único seletor de abas com contagens e quebra de linha quando necessário. Em telas estreitas, mostrar um seletor compacto com as mesmas contagens, sem exibir os dois controles ao mesmo tempo.
- Manter sincronizados o setor selecionado, a consulta da tabela e o parâmetro de setor na URL.

#### Etapa 3 — Ajustar as barras de rolagem

- Eliminar a barra horizontal das abas com a quebra de linha e o seletor responsivo da etapa 2.
- Tornar a barra vertical do menu lateral fina e discreta, mantendo a rolagem disponível em janelas baixas e por teclado.
- Manter a rolagem horizontal da tabela quando necessária para acessar todas as colunas.

#### Etapa 4 — Validar o fluxo completo

- Confirmar que abrir e fechar o diálogo não desloca a tabela nem perde filtros ou posição de rolagem.
- Confirmar que a entrada atualiza o estoque, mostra o resultado e permite cadastrar outra entrada sem reabrir o formulário.
- Verificar seleção de setor, fechamento com alterações pendentes, foco e navegação por teclado, além de larguras desktop e mobile no Windows.
- Executar build e testes relevantes após a implementação.

**Critério de conclusão:** a entrada rápida não empurra filtros e tabela; há somente um controle visível para escolher o setor; as opções de setor permanecem acessíveis sem barra horizontal; a barra do menu lateral é discreta sem remover sua rolagem; e o fluxo de gravar, repetir ou cancelar preserva o estado corretamente.

### Implementação e validação

- A entrada rápida abre em diálogo responsivo, mantém cabeçalho e ações acessíveis durante a rolagem e protege o fechamento com alterações pendentes. Após gravar, atualiza o estoque e mantém o formulário pronto para outra entrada.
- O seletor redundante “Setor Ativo” foi removido. As abas quebram linha em telas largas e viram um seletor compacto em telas estreitas, mantendo as contagens e a sincronização com a URL.
- A barra vertical do menu lateral foi reduzida e suavizada, sem remover a rolagem.
- Build de produção do frontend (`npm --prefix frontend run build`) passou; `git diff --check` passou.
- Testes automatizados e conferência visual manual em Windows não foram executados nesta etapa.

## 5. P2 — Organizar o formulário e a consulta do “Estoque Multi-Setor” — PENDENTE

### Problemas observados

- O diálogo “Nova Entrada Rápida” repete o título que já aparece no cabeçalho, comprime a seleção dos setores e distribui campos em colunas estreitas. Em algumas larguras, rótulos e controles quebram e o rodapé fixo encobre a área de observação.
- A busca e os filtros de localização, categoria, saldo e quantidade por página aparecem como caixas separadas e ocupam várias linhas antes da tabela.
- A tabela aperta as colunas em larguras médias, quebrando valores como combinação, lado e localização e dificultando comparar os itens.

### Objetivo

Reduzir a densidade visual e facilitar a leitura do estoque e o preenchimento da entrada, mantendo os campos, filtros, ações, dados e regras existentes.

### Etapas e andamento

#### Etapa 1 — Reorganizar o diálogo de entrada rápida — CONCLUÍDA

- Manter o cabeçalho externo como título único e remover o título repetido dentro do formulário.
- Exibir as opções de setor em uma faixa própria, com alvos de tamanho uniforme e sem quebra irregular entre as opções.
- Reorganizar os campos em colunas proporcionais à largura disponível no diálogo; dar mais espaço a descrições e observações, mantendo os mesmos campos obrigatórios e opcionais.
- Separar visualmente identificação do material, variantes e dados de entrada. Manter as ações no rodapé do diálogo, fora da área rolável, e reservar espaço no fim do formulário para nenhum campo ficar encoberto.

#### Etapa 2 — Reunir os filtros em um painel compacto — PENDENTE

- Manter a busca por código/descrição sempre visível.
- Reunir localização, categoria/tipo quando disponível, situação do saldo e itens por página sob um único controle “Filtros”, com indicação de quantos filtros estão ativos.
- Preservar os valores, opções, atualização dos resultados e limpeza de filtros já existentes; mostrar um resumo compacto quando filtros estiverem aplicados.
- Não introduzir critérios de busca de grade, lado ou quantidade nesta etapa, pois exigiriam lógica de consulta além da reorganização visual solicitada.

#### Etapa 3 — Melhorar a leitura dos materiais — PENDENTE

- Em telas largas, preservar a tabela e dar largura suficiente às colunas, evitando que códigos, variantes e ações se espremam.
- Em telas estreitas, apresentar os mesmos dados e ações em linhas organizadas como cartões compactos, sem remover ou alterar operações disponíveis.
- Manter as abas, contagens e setor ativo visíveis e consistentes com a consulta atual.

#### Etapa 4 — Conferir o desenho sem alterar os fluxos — PENDENTE

- Conferir o diálogo e a lista em larguras desktop, média e estreita, verificando rolagem, leitura, alinhamento e ausência de conteúdo encoberto.
- Confirmar que busca, filtros, setor, paginação e ações continuam ligados aos mesmos estados e operações.
- Gerar o build do frontend após a implementação aprovada.

### Implementação parcial

- O título interno repetido foi removido; os setores agora ficam em uma faixa uniforme separada do cabeçalho do diálogo.
- Os campos se reorganizam conforme a largura disponível no formulário, e os dados do material ficam visualmente separados da entrada de saldo e localização.
- A rolagem foi limitada à área dos campos; as ações permanecem em um rodapé próprio e o último campo não fica sob os botões.
- Campos, regras, validações, seleção de setor e ações de salvar/cancelar foram preservados. Filtros e tabela não foram alterados nesta etapa.
- Build de produção do frontend (`npm run build`): passou. A suíte de testes não foi executada.

**Critério de conclusão:** o formulário não repete títulos, não comprime nem encobre campos; os filtros ficam reunidos sem esconder a busca por código; e a lista permanece legível nas larguras menores, preservando os dados e as operações existentes.
