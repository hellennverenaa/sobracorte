# Análise de confiabilidade e acuracidade do estoque

Escopo: estoque, movimentações, requisições, casamento de pares e relatórios.
Evidência: leitura do código e consultas ao banco local; sem alterações nos dados durante a análise.

## Situação encontrada

Na conferência de SEST, não havia saldos negativos, diferenças entre saldo total e soma dos locais ou locais com saldo positivo em setor incompatível. Isso não garante segurança dos fluxos: os problemas abaixo podem produzir inconsistências em operações posteriores.

## Críticos

1. **Baixas inconsistentes por localização.** Casamento e atendimento de requisições debitam o item, mas somente a primeira localização, limitando o saldo local a zero. Localização informada sem vínculo também pode não ser debitada. Reprodução em memória: casamento de 100 pares deixou 31 unidades no item e 43 nas localizações, divergência de 12.
   - Referências: `backend/src/services/MountingPairService.ts`, `backend/src/services/RequisitionService.ts`.
2. **Concorrência sem proteção suficiente.** Atendimentos podem verificar a mesma pendência/saldo e consumir duas vezes. Casamento grava saldos absolutos baseados em leituras anteriores, permitindo perda de baixas. Cancelamento pode competir com atendimento. As tabelas canônicas não tinham restrições CHECK contra saldos negativos ou atendimento acima do solicitado.
   - Referências: os mesmos serviços e `backend/prisma/schema.prisma`.
3. **Seleção de material incorreto.** A busca usa SKU OU modelo OU descrição parcial, em vez de exigir os identificadores fornecidos. Esquerdo e direito de uma requisição de par podem ser selecionados de produtos diferentes. Cadastros ambíguos não são rejeitados.
   - Referência: `backend/src/services/RequisitionService.ts`.

## Alta prioridade

4. **Disponibilidade de Apoio contradiz o atendimento.** Disponibilidade ignora grade e material/cor; atendimento compara `color`, mas Apoio armazena `materialColor`. Nos dados sintéticos, uma requisição de 10 unidades apresentava 1.522 na consulta ampla e zero candidatos no atendimento.
5. **Casamento ignora modelo.** SKU presente permite casar modelos diferentes, apesar de o cadastro considerar modelo parte da identidade. Consulta e execução precisam seguir a mesma regra.
6. **Relatórios incompletos e histórico mutável.** Filtros omitem SAIDA_REQUISICAO. Apresentação prioriza atributos atuais do item/local sobre snapshots, podendo mudar o passado após renomeações.
   - Referência: `backend/src/controllers/ReportController.ts`.
7. **Transferência intersetorial com rastreabilidade/classificação incompletas.** A movimentação vinculada ao destino não identifica estruturalmente o item debitado na origem. Classificação é copiada, permitindo um cabedal em Montagem continuar classificado como CABEDAL. Transformações entre setores exigem regra de negócio explícita, não inferência automática.
   - Referência: `backend/src/services/StockMovementService.ts`.

## Outras incongruências

8. **Indicadores sem coerência dimensional.** Relatórios somam unidades incompatíveis; dashboard de Corte identifica o total agregado como M². Taxa de reaproveitamento usa contagem de movimentações, não volume.
   - Referências: `backend/src/controllers/ReportController.ts`, `backend/src/controllers/DashboardController.ts`.
9. **Consumo fracionado inconsistente.** Inicialmente, o cadastro aceitava decimais enquanto a movimentação rejeitava decimais por setor. A regra foi corrigida para considerar a unidade: Consumo aceita frações em unidades contínuas (`KG`, `G`, `L`, `M`, `M²`) e exige inteiros em unidades discretas (`UN`, `UND`, `PC`, `PAR`, `CX`, `ROLO`).
   - Referências: `backend/src/utils/unitHelper.ts`, `backend/src/types/stock.dto.ts`, `backend/src/import/materialImport.ts`, `backend/src/services/StockMovementService.ts` e `backend/src/services/stockDebit.ts`.

## Diretrizes de correção dos críticos

- Baixar quantidade exata em local explícito ou distribuir deterministicamente entre locais com saldo; nunca esconder insuficiência limitando saldo a zero.
- Registrar uma movimentação por local efetivamente debitado, dentro da mesma transação do saldo.
- Serializar operações concorrentes usando o bloqueio por unidade já existente e aplicar decrementos condicionados ao saldo disponível.
- Atender somente a identidade compatível com todos os identificadores informados; rejeitar ambiguidades e pares incompatíveis.
- Usar a mesma seleção na disponibilidade e no atendimento.
- Adicionar restrições não destrutivas de quantidade no banco, sem corrigir ou excluir registros automaticamente.
- Preservar dados e mudanças locais não relacionados à correção.

## Implementação e validação

Os críticos **1, 2 e 3 foram corrigidos**:

- `stockDebit.ts` distribui a baixa entre localizações com saldo ou respeita o local informado, rejeitando saldo insuficiente e divergências preexistentes. O histórico registra cada local debitado; qualquer falha reverte a operação completa.
- Atendimento, cancelamento, casamento, movimentação e exclusão de item usam o bloqueio transacional por unidade antes da leitura. Baixas e atendimento usam decrementos/incrementos condicionados, sem substituir saldos por valores absolutos desatualizados.
- `requisitionStock.ts` exige todos os identificadores fornecidos, sem descrição parcial ou alternativas por OR. Disponibilidade e atendimento usam a mesma seleção; ambiguidades são bloqueadas. Pares exigem identidade, material e unidade compatíveis.
- A migração `20260916220000_stock_quantity_guards` foi aplicada ao banco local: impede saldos negativos e atendimento acima do solicitado. Movimentações físicas exigem quantidade positiva; eventos de configuração podem registrar zero. Nenhum registro existente foi corrigido ou excluído.

Os pontos **4, 5 e 9** também foram corrigidos por integrarem esses fluxos. Os pontos **6, 7 e 8 permanecem pendentes**.

Validação realizada:

- Quatro testes focados de duplicidade, transferência, baixa por localização, rollback, concorrência simulada, seleção exata e compatibilidade de pares passaram; mais 14 testes de CSV passaram.
- Testes de unidade confirmam Consumo fracionado em KG e rejeição de fração em UN no cadastro e na importação CSV.
- Serviços de casamento e atendimento de Apoio executados no PostgreSQL local com rollback obrigatório: saldos e pendência permaneceram intactos.
- Restrições CHECK bloquearam saldo negativo e excesso de atendimento em transações revertidas.
- Reconciliação final de SEST: zero diferenças entre saldo do item e soma dos locais.

Não foi executada validação geral nem typecheck completo, para evitar a carga que anteriormente esgotou a memória do ambiente. Concorrência real entre processos não foi ensaiada; a validação de concorrência foi feita com transações simuladas serializadas pelo bloqueio.
