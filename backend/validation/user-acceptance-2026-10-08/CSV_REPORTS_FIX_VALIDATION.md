# Correções de CSV e relatórios — 08/10/2026

Implementadas após aprovação da revisão geral. Alterações anteriores da sidebar e de relatórios foram preservadas. Nenhuma alteração de schema/migration, commit ou deploy.

## Importação

- Consolidação de quantidades por Decimal: 0.1 + 0.2 produz 0.3 tanto no item quanto na localização, sem relaxar a precisão de três casas.
- Prévia distingue linhas do arquivo de itens consolidados/convertidos. Lista itens ignorados, quantidade do arquivo versus estoque e alocações de localização. Não modifica saldo de item existente.
- Erros completos devolvidos pela API; tela limita tabela a 100, agrupa por causa e oferece CSV com todos os erros, com proteção contra fórmulas em planilhas.
- Seleção explícita de localização para uma linha rejeitada; exige revalidação. Servidor confere ID autorizado, setor/subsetor/categoria e impede que nome igual em outro setor substitua silenciosamente o ID escolhido. CSV original preservado.
- Prévia inclui hash do plano, arquivo, configuração e saldos de itens ignorados. Interface envia o hash na confirmação; alteração detectada retorna 409 e exige nova prévia. Chamadas legadas sem hash seguem compatíveis; validações transacionais existentes continuam obrigatórias.
- Modelo baixado contém somente cabeçalhos. Exemplos da tela identificados como ilustrativos; nenhum cadastro fictício vem como linha pronta para importar.
- Seleção de arquivo e arrastar usam a mesma verificação de extensão, incluindo .CSV. Conteúdo continua validado no backend.
- Erros transacionais de validação de importação são entregues como 422 com informações de linha.

## Relatórios

- Detalhe, CSV e agregados usam unidade efetiva e aliases canônicos. Snapshot tem prioridade; registros legados usam unidade do item ainda existente; se indisponível, exibem NÃO INFORMADA. Não houve preenchimento artificial de snapshots ou alteração do histórico.
- Volumes nulos preservados e subtotais por unidade visíveis, inclusive dentro de Corte. Refugos mostram contagem de lançamentos separada do volume.
- Contagens chamadas de lançamentos, evitando confundir alocações por prateleira com ações únicas do usuário.
- Filtros aplicados guardados com a resposta. Alterações pendentes avisadas; impressão/exportação exigem aplicação dos filtros. Respostas antigas não substituem a consulta mais recente.
- Exportação usa parâmetros e período da consulta aplicada. CSV de movimentos/requisições segue createdAt/id como a tela; cursor considera ambos os campos.
- Impressão completa carrega todas as páginas, até 10.000 registros, com indicação explícita. Para maiores volumes, reduzir filtro ou exportar CSV. Impressão de página atual tem botão e identificação próprios, incluindo aviso de que totais representam todo o filtro.
- Preparação confere contagem e IDs duplicados entre páginas, mostra progresso e restaura dados/paginação ao sair da impressão.

## Verificação executada

- Build completo passou; após ajustes finais, backend e frontend reconstruídos com sucesso.
- Conjunto direcionado de 40 testes backend passou. Após normalização da apresentação de aliases, 13 testes dos relatórios/exportação foram repetidos e passaram. Após validação final de mapeamento, testes de revisão/controller também passaram.
- Testes de componentes Settings e Reports passaram. Reports repetido após ajustes finais de impressão.
- Regressões cobrem soma decimal, unidade histórica, preservação de snapshots, paginação fora dos totais, 501 registros com IDs fora da ordem cronológica, filtro obsoleto, carregamento completo, bloqueio de plano alterado e mapeamento indisponível/de outro setor.
- Chromium + servidor real + PostgreSQL no clone sobracorte_user_acceptance_20261008. Autenticação externa simulada; JWT, permissões e persistência reais.
- Impressão: DOM preparado com 89 lançamentos completos versus 50 na página atual, escopos identificados. Diálogo nativo de impressão interceptado apenas para capturar o DOM; esta rodada não valida impressora física ou paginação visual final do PDF.
- Importação pelo navegador: duas linhas 0.1/0.2, ambas mapeadas explicitamente para localização existente; um item e alocação 0.3 KG persistidos. Reimportação mostrou um item ignorado; alteração temporária do saldo da fixture bloqueou confirmação com 409, sem importar. Fixture restaurada a 0.3.
- API final devolveu todos os 110 erros de um CSV sintético inválido, sem importar dados.

Evidência: sobracorte-csv-report-acceptance.json. Não contém tokens/credenciais.

## Limites e próximos ensaios

Consultas e exportações continuam lendo um banco em movimento. Detecção de contagem/duplicação não é snapshot imutável e não cobre alterações que preservam a contagem. Ensaios de concorrência prolongada, carga, fuso de cada fábrica e PDF/impressora físicos continuam pendentes. Estas mudanças não incluem serviço assíncrono de exportação nem reposição/atualização de estoque por CSV.

Para publicar as correções desta rodada, atualizar backend e frontend. Nenhuma migration nova.
