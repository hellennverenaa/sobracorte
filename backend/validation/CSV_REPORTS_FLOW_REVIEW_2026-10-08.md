# Revisão de importação CSV e relatórios — 08/10/2026

Análise do código atual, sem novas correções de aplicação ou alteração de banco. Preservadas alterações já presentes no workspace.

## Achados prioritários

| Prioridade | Achado | Evidência | Ajuste recomendado |
| --- | --- | --- | --- |
| Alta | Impressão apresenta somente a página carregada, mas resumo representa todo o filtro. Paginação não aparece no impresso. | frontend/src/pages/Reports.vue: printPDF chama window.print(); tabela usa reportData; paginação print:hidden. useReports.js: pageSize 50. Backend totais sem skip/take. | Diferenciar imprimir página e relatório completo. Cabeçalho deve informar escopo, número de registros e páginas. Relatório completo precisa carregar/exportar todos os registros com limite e progresso explícitos. |
| Alta | Unidade do detalhe e do agregado histórico seguem regras diferentes. | ReportController.ts: detalhe usa itemUnit ?? stockItem.unit; groupBy usa itemUnit e normalizeUnit(group.itemUnit, sector). Quando itemUnit é nulo, normalizeUnit não busca unidade do item. | Definir unidade efetiva única para detalhes e agregados. Se histórico não permite determinar unidade, identificar como desconhecida, sem inventar M²/UN ou alterar snapshots silenciosamente. |
| Alta | Consolidação decimal usa number e pode produzir precisão inválida. | materialImport.ts: existing.quantity += item.quantity e locMatch.quantity += item.quantity. validateQuantityPrecision conta casas na string. Reprodução: 0.1 + 0.2 = 0.30000000000000004, rejeitado pelo validador compilado. | Consolidar usando Decimal ou inteiros de milésimos. Validar quantidade consolidada na prévia e na confirmação. Não enfraquecer a regra de três casas. |
| Alta | Item existente com mesma identidade/unidade é ignorado sem comparação de quantidade ou distribuição nas prateleiras. | materialImport.ts: planImport, ramo sameIdentity/sameSubsector/unidade, apenas ignored++. | Explicar que importar cadastra itens novos; não repõe/atualiza estoque existente. Mostrar linhas ignoradas e diferenças de saldo/alocação. Se houver necessidade de reposição por planilha, oferecer operação distinta e auditada, sem mudar silenciosamente a importação atual. |
| Média | Modelo de CSV contém categorias e prateleiras fictícias/incompatíveis com a fábrica. | Settings.vue: exemplos EVA, PR-01, MO-02, CABEDAL, PE PRONTO; apenas lista descritiva de categorias de Pré-Fabricado é dinâmica. | Separar modelo vazio de exemplo didático. Gerar exemplos opcionais usando configuração da unidade, categoria, unidade, modo e localização compatível. Avisar quando a configuração mínima está incompleta. |
| Média | Nomes de localizações dependem de igualdade de texto; espaços e hífens geram rejeições pouco acionáveis. | materialImport.ts: locationFor compara nome em maiúsculas, setor e subsetor. Caso da planilha de Pré-Fabricado mostrou duas diferenças de espaçamento. | Mostrar sugestão de localização cadastrada e permitir confirmar o mapeamento na prévia. Normalização controlada somente se resultado for único dentro de unidade/setor/subsetor; não vincular por aproximação silenciosa. |
| Média | Erros limitados aos primeiros 100 e repetidos por linha; não há entrega completa de correções. | ImportController.ts: errors.slice(0,100); Settings.vue: exibe tabela. | Agrupar por causa/localização/categoria, mantendo linhas afetadas. Exportar relatório completo de erros e oferecer links para configuração. |
| Média | Prévia e confirmação recalculam planos independentes; podem apresentar resultados diferentes após alterações de estoque/configuração. | ImportController.ts: processCSV utilizado em duas requisições, planImport refeito; executeImportTransaction revalida configuração sob lock. | Manter revalidação transacional. Se plano mudou, retornar diferença e pedir nova confirmação antes de gravar, usando resumo/fingerprint do plano aprovado. Não reservar estoque nem confiar cegamente na prévia. |
| Média | Contagem de operações representa registros de movimento, não necessariamente ações do usuário. | ReportController.ts: qtdOperacoesSaida soma counts de SAIDA/CASAMENTO_PAR/SAIDA_REQUISICAO. Uma baixa repartida em locais cria vários movimentos. | Chamar de lançamentos de movimentação; para contar operações reais, usar identificador explícito de operação. Não deduplicar por horário ou motivo. |
| Média | Relatório consultado e filtros atualmente editados não têm estado separado. Respostas assíncronas não têm proteção contra retorno fora de ordem. | useReports.js: generateReport escreve reportData/totals a cada resposta; Reports.vue usa filtros atuais em cabeçalho/exportação e não recarrega tudo automaticamente. | Guardar filtros aplicados junto à resposta; marcar alterações pendentes; bloquear impressão incoerente e ignorar respostas obsoletas. Exportar pelos filtros aplicados ou avisar claramente que será uma consulta nova. |

## Pontos de atenção adicionais

- Consulta de relatório usa Promise.all para linhas, contagens e agregados, sem snapshot transacional único. Exportação consulta lotes em momentos distintos. Em banco movimentado, consistência sob concorrência precisa ser ensaiada; este comportamento é risco identificado por código, não divergência reproduzida nesta rodada.
- Tela ordena por createdAt/id e CSV de movimentações por id. Datas retroativas podem produzir sequências diferentes; definir e compartilhar ordenação.
- Sufixos ainda inferidos por setor em alguns cartões, como Corte = m². Corte também admite M/KG. Usar unidade efetiva ou subtotais por unidade em toda a tela, impressão e exportação.
- Datas passam por cálculo no navegador e ajustes de início/fim no backend. Avaliar limites de dia em fuso da fábrica com teste específico; não há conclusão de defeito reproduzido nesta revisão.
- Entrada por seleção de arquivo e arrastar têm verificações diferentes de extensão. Padronizar sem tratar extensão como validação suficiente.

## Melhorias de usabilidade

Importação em quatro passos: arquivo e unidade/setor; mapeamento e diagnóstico; revisão do plano; confirmação e recibo. Exibir linhas originais, itens consolidados, pares convertidos, novos e ignorados como métricas distintas. Permitir baixar todos os erros, corrigir e reenviar. Não criar cadastros nem alterar permissões de localização automaticamente.

Relatórios: filtros aplicados visíveis, unidades reais, definição de lançamentos versus operações, impressão completa versus página explícitas e mesmo resultado semântico entre tela, CSV e PDF. CSV de relatório é exportação para análise; não apresentar como arquivo pronto para reimportar estoque.

## Sequência recomendada

1. Corrigir consolidação decimal, unidade histórica e escopo da impressão.
2. Unificar filtros aplicados, ordenação e contratos de totais; preservar nulos/desconhecidos.
3. Tornar importação explicável: ignorados com motivo, diferenças de estoque, agrupamento/download completo de erros e modelos adequados à unidade.
4. Adicionar mapeamento confirmado de nomes e comparação entre prévia e execução.
5. Ensaiar concorrência e carga antes de adotar mecanismos adicionais de snapshot/exportação.

## Critérios de aceitação

- Quantidades 0.1 + 0.2, múltiplas prateleiras, três casas decimais, zero e PAR; prévia e confirmação coerentes.
- Item novo, idêntico existente, existente com quantidade/localização diferente e conflito de identidade.
- Categorias/localizações/subsetores ALL/SELECTED, homônimos, acentos, espaços e unidade distinta.
- Relatório com mais de 50 registros, unidade única/mista, histórico sem snapshot, dados retroativos e exclusão do cadastro atual.
- Comparar totais por unidade entre consulta completa, CSV e impressão completa; página isolada devidamente identificada.
- Alterar filtro rapidamente e mudar configuração/estoque entre prévia e confirmação.

## Verificação executada e limites

24 testes passaram: backend/tests/csvImport.test.ts, backend/tests/importController.test.ts e backend/tests/stockReportingReliability.test.ts. Reprodução isolada da falha decimal com o validador compilado também executada. Não foi feita nova importação, deploy, migração ou escrita em produção. Esta rodada é revisão de código e testes direcionados; não comprova todos os cenários concorrentes nem substitui ensaio de aceitação com banco e navegador.
