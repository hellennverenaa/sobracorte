# Revalidação dos quatro pontos adicionais

Correções implementadas após aprovação do usuário, exclusivamente no workspace e clone local.

1. Identificação de administrador: exclusões de origem, categoria e localização agora consultam o papel real da sessão e o indicador de administrador global. O bloqueio para Admin de Setor com histórico continua vigente. No navegador, o administrador excluiu a origem sintética QA EXCLUSAO HISTORICO com uma movimentação; consulta posterior confirmou remoção da opção e preservação da movimentação.
2. Edição de categoria: restaurados checkboxes dos setores. CABEDAL foi compartilhado com Peças Cortadas pelo navegador; banco confirmou APOIO e DISTRIBUICAO, sem remover o setor original.
3. Atendimento: reproduzido o erro de StockMovement_quantity_positive no material 1132796 do clone. Alocações eram 0, 0 e 6. Decimal.isPositive() considera zero positivo; o código gerava parcelas zeradas. Comparação corrigida para lte(0), inclusive na validação da quantidade de atendimento. Repetida baixa de 1.6 e inserção da movimentação na mesma transação: passou com uma parcela 1.6. Rollback confirmou saldo original 6. Nenhuma constraint flexibilizada. Ensaio cobre baixa e gravação, não o atendimento HTTP da requisição original da imagem.
4. Matéria-prima: categoria deixa de ser entrada manual. Busca parcial de código no Corte retorna sugestões com categoria e variantes. Seleção preenche categoria, descrição e unidade; alterar o código limpa identificação anterior. Descrição fica somente leitura. Motivo é preenchido automaticamente como REPOSIÇÃO DE MATÉRIA-PRIMA, mantendo o contrato existente da API. No navegador, uma requisição sintética foi adicionada e enviada informando apenas código e quantidade 0.125, sem erro HTTP.

## Validação

- Build completo backend/frontend passou; frontend reconstruído novamente após ajuste final do fluxo simplificado.
- Backend: stockReliability.test.ts + requisitionStockCandidates.test.ts, 19 testes passaram. Inclui nova regressão com locais 0, 0, 6 e baixa 1.6.
- Frontend: settings.component.test.js + requisitions.component.test.js passaram, repetidos após o ajuste final.
- Chromium real, servidor local e PostgreSQL no clone sobracorte_user_acceptance_20261008. Autenticação externa simulada; autorização e persistência reais.
- Evidências JSON: sobracorte-points-browser.json, sobracorte-points-final.json, sobracorte-raw-final.json.

É necessário atualizar backend e frontend. Não há migration nova. Produção não foi acessada nem modificada; não houve commit ou deploy nesta etapa. As limitações gerais do relatório de aceitação continuam aplicáveis.
