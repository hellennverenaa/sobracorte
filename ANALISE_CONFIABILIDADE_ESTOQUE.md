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
7. **Transferência intersetorial indevida.** O fluxo encontrado permitia ao Admin Master mover materiais entre setores, criando itens ou alterando seu setor e preservando classificações incompatíveis. A regra de negócio posteriormente confirmada proíbe essa operação para qualquer perfil: transferências físicas só redistribuem o mesmo item entre localizações compatíveis com seu setor. Ver correção final abaixo.
   - Referência: `backend/src/services/StockMovementService.ts`.

## Outras incongruências

8. **Indicadores sem coerência dimensional.** Relatórios somavam unidades incompatíveis; dashboard de Corte identificava o total agregado como M². A taxa exibida como reaproveitamento usa contagem de movimentações, não volume.
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

## Implementação e validação inicial (16/09/2026)

Os críticos **1, 2 e 3 foram corrigidos**:

- `stockDebit.ts` distribui a baixa entre localizações com saldo ou respeita o local informado, rejeitando saldo insuficiente e divergências preexistentes. O histórico registra cada local debitado; qualquer falha reverte a operação completa.
- Atendimento, cancelamento, casamento, movimentação e exclusão de item usam o bloqueio transacional por unidade antes da leitura. Baixas e atendimento usam decrementos/incrementos condicionados, sem substituir saldos por valores absolutos desatualizados.
- `requisitionStock.ts` exige todos os identificadores fornecidos, sem descrição parcial ou alternativas por OR. Disponibilidade e atendimento usam a mesma seleção; ambiguidades são bloqueadas. Pares exigem identidade, material e unidade compatíveis.
- A migração `20260916220000_stock_quantity_guards` foi aplicada ao banco local: impede saldos negativos e atendimento acima do solicitado. Movimentações físicas exigem quantidade positiva; eventos de configuração podem registrar zero. Nenhum registro existente foi corrigido ou excluído.

Na implementação inicial, os pontos **4, 5, 8 e 9** foram considerados corrigidos por integrarem esses fluxos, e **6 e 7** ficaram pendentes. A revisão de 17/09 abaixo identificou e tratou lacunas adicionais em **5 e 8**.

No ponto 8, os totais de inventário e movimentação agora são separados por unidade normalizada. Totais mistos retornam detalhamento por unidade e não um número físico agregado. O gráfico global do dashboard foi renomeado para distribuição de cadastros por setor; a taxa antes chamada de reaproveitamento passou a ser apresentada como taxa de operações de saída, pois continua baseada na contagem de operações.

Validação realizada:

- Quatro testes focados de duplicidade, transferência, baixa por localização, rollback, concorrência simulada, seleção exata e compatibilidade de pares passaram; mais 14 testes de CSV passaram.
- Testes de unidade confirmam Consumo fracionado em KG e rejeição de fração em UN no cadastro e na importação CSV.
- O endpoint do dashboard e o relatório de inventário foram validados contra SEST: Corte retornou separadamente KG, M e M²; os totais mistos não foram agregados.
- Serviços de casamento e atendimento de Apoio executados no PostgreSQL local com rollback obrigatório: saldos e pendência permaneceram intactos.
- Restrições CHECK bloquearam saldo negativo e excesso de atendimento em transações revertidas.
- Reconciliação final de SEST: zero diferenças entre saldo do item e soma dos locais.

Na validação inicial, não foi executada validação geral nem typecheck completo, para evitar a carga que anteriormente esgotou a memória do ambiente. Concorrência real entre processos não foi ensaiada; a validação de concorrência foi feita com transações simuladas serializadas pelo bloqueio.


## Revisão e correções de 17/09/2026

A comparação com o código confirmou as proteções dos pontos 1–4 e 9. A conclusão inicial sobre 5 e 8 era abrangente demais: o dashboard ainda calculava pares sem comparar modelo/unidade, somava volumes heterogêneos de saída de Corte e calculava percentuais por origem com quantidades sem unidade. Os subtotais por tipo/setor do relatório de movimentações também somavam unidades diferentes.

Correções implementadas:

- **Ponto 5:** dashboard e consulta de casamento compartilham o mesmo predicado SQL de identidade, modelo, material, grade, cor e unidade normalizada. EXPEDICAO e DISTRIBUICAO são tratados como aliases, conforme a execução. Os aliases de unidade são compartilhados com `normalizeUnit`.
- **Ponto 6:** consultas, CSV e filtro de saídas do histórico incluem `SAIDA_REQUISICAO`; os totais de saída também incluem atendimentos. Relatório, CSV e tela de histórico priorizam snapshots sobre atributos atuais. Novas movimentações físicas registram também modelo, grade, lado e cor. A busca usa os atributos históricos disponíveis, com fallback para atributos sem snapshot.
- **Ponto 7 — rastreabilidade, antes da confirmação da regra:** foram adicionados IDs históricos dos itens e setores de origem/destino, inclusive para os fluxos intersetoriais que existiam nessa etapa. Esses fluxos foram removidos na correção final abaixo. Os IDs são valores históricos preservados após exclusão, sem vínculo de chave estrangeira que os apague. A localização efetivamente utilizada é registrada mesmo quando escolhida pelo fallback do serviço. Relatório JSON e CSV expõem a origem e o destino. O histórico filtrado por item também encontra transferências em que esse item foi a origem ou o destino.
- **Ponto 8:** saídas de Corte/Apoio e subtotais de movimentação são separados por unidade normalizada. Totais mistos não retornam um volume agregado. O dashboard de Corte/Apoio exibe a unidade real quando única e a contagem de registros quando houver unidades diferentes. A origem das entradas passa a representar percentuais de registros, com rótulo explícito; a distribuição por categoria retorna contagem de cadastros, sem somar unidades diferentes. A taxa de Montagem usa contagem de registros, como os demais setores. As entradas acumuladas são agrupadas pela unidade histórica e o fallback do ranking respeita a unidade selecionada.

A migração aditiva `20260917120000_stock_history_snapshots` foi aplicada ao PostgreSQL local. Não altera saldos nem preenche snapshots antigos com valores atuais. Em registros anteriores, atributos sem snapshot ainda dependem do cadastro atual: não é possível garantir sua imutabilidade retroativamente sem uma fonte histórica confiável.

**Situação final do ponto 7:** resolvido pela proibição de movimentações entre setores, após confirmação da regra de negócio pelo usuário. A hipótese de transformação entre setores foi descartada. A rastreabilidade permanece disponível para preservar os históricos existentes; novas transferências mantêm item, setor, classificação e saldo total.

Validação desta revisão:

- Nove arquivos de testes focados do backend passaram, incluindo testes novos que executam o controller de relatórios/CSV com snapshots divergentes do cadastro atual, exclusão de item, saídas por requisição, unidades mistas e aliases.
- Dois arquivos de testes de componentes do frontend passaram, incluindo o caso de Corte com saídas em KG e M² sem rotular o total como m².
- Build do frontend aprovado, com saída de validação em `/tmp`.
- Migração validada inicialmente em transação revertida e posteriormente aplicada pelo fluxo versionado de migrations no banco local.
- Nove combinações sintéticas no PostgreSQL confirmaram que o predicado SQL de pares e `assertCompatiblePair` concordam para diferenças de modelo, material, grade, cor, unidade e setor, incluindo aliases, espaços e unidade ausente.
- Dashboard, relatório de inventário, relatório de movimentações e consulta de pares executados contra SEST.
- Transferência parcial sintética validada no PostgreSQL com rollback obrigatório: IDs/setores e snapshots corretos; quantidade total preservada. Nenhum saldo ou histórico sintético persistiu. Sequências de IDs podem avançar mesmo com rollback.
- Reconciliação de SEST após a validação: zero diferenças entre saldo do item e soma dos locais.
- Typecheck completo executado com memória limitada: falhou com os mesmos 18 diagnósticos da versão anterior, confirmados por comparação com o código de HEAD em diretório temporário. São incompatibilidades existentes de tipos do cliente Prisma estendido com `TransactionClient` e variáveis possivelmente indefinidas em testes; nenhum diagnóstico adicional na revisão.

Concorrência real entre processos continua sem ensaio. A revisão não realizou deploy em produção.


## Correção final: isolamento das localizações por setor

Regra confirmada pelo usuário: uma localização vinculada a um setor só pode ser usada por itens desse setor. Admin Master não possui exceção. Transferências só redistribuem o saldo entre localizações compatíveis com o setor do mesmo item.

- Removidos os caminhos de transferência intersetorial que criavam/reutilizavam um item no destino ou mudavam o setor do item de origem.
- Backend valida o setor real do item, a unidade fabril e os setores das localizações de origem/destino antes das alterações de saldo. A regra vale para entradas, saídas, refugos e transferências.
- Cadastro em lote e execução da importação CSV também rejeitam localizações específicas de outro setor. A importação reconfere a localização dentro da transação, após o bloqueio por unidade. Localizações criadas pelo cadastro ficam vinculadas ao setor do item.
- Atendimento e casamento recusam baixas em localizações incompatíveis, mesmo se já houver um vínculo incorreto no estoque.
- A consulta operacional de localizações e o seletor de destino não possuem exceção para Admin Master. Removida a apresentação de autorização intersetorial no frontend.
- A edição do setor de uma localização rejeita vínculos incompatíveis com itens já alocados, sob o mesmo bloqueio transacional por unidade.
- Nesta etapa, localizações sem setor ainda eram consideradas gerais. Essa permissão foi removida das transferências na revisão abaixo. EXPEDICAO e DISTRIBUICAO continuam aliases do mesmo setor.
- Saldos e históricos anteriores foram preservados. Não houve nova migração nem correção automática de dados.

Validação final da regra:

- Cinco arquivos focados do backend passaram: duplicidade/transferências, confiabilidade, CSV, relatórios e permissões de configurações. Os testes verificam a recusa de transferências totais/parciais entre setores para Admin Master e demais perfis, sem gravar saldo ou histórico; origem incompatível; setor informado incorreto; preservação do saldo/item em transferências permitidas; proteção de cadastro, importação, baixas e edição do setor da localização.
- Testes de componentes de inventário e configurações passaram. O caso de inventário usa Admin Master e confirma que o seletor exclui destinos de outro setor.
- Build do frontend aprovado com saída em `/tmp`.
- PostgreSQL local: transferência entre setores recusada para Admin Master antes de gerar histórico; transferência dentro do setor preservou o item e saldo total e registrou snapshots corretos. Teste sintético em transação com rollback obrigatório. Endpoints e reconciliação de SEST validados novamente: zero diferenças entre saldo do item e soma dos locais.
- Typecheck executado: restam 11 diagnósticos das categorias preexistentes de incompatibilidade do cliente Prisma estendido com `TransactionClient` e variáveis possivelmente indefinidas em testes. O helper de bloqueio agora declara somente a operação `$queryRaw` que utiliza, removendo parte dos erros de tipos anteriores; não foram introduzidos erros adicionais.

Permanece sem ensaio a concorrência real entre processos e sem garantia retroativa a imutabilidade de atributos antigos que não possuíam snapshots. Não houve deploy em produção.


## Correção dos artefatos executáveis após relato de transferência bem-sucedida

A validação anterior comprovava o código-fonte e builds temporários, mas não comprovava a versão servida ao usuário. Foram encontrados artefatos desatualizados em `backend/dist` e `frontend/sobra_corte`, ainda contendo o fluxo de transferência intersetorial. O `ecosystem.config.cjs` executa `dist/src/server.js`; portanto, alterar apenas `src` não atualiza esse modo de execução.

- Corrigidos os tipos dos helpers para usar a transação real do cliente Prisma com extensão de tenant, sem casts nem bypass do typecheck. Corrigidas também as anotações de variáveis de captura dos testes.
- `npm run build` do backend passou integralmente (geração do Prisma, TypeScript e cópia do runtime gerado), atualizando o `dist`. Os 11 erros de tipos restantes na etapa anterior foram resolvidos.
- `npm run build` do frontend passou, atualizando `frontend/sobra_corte`, em vez de produzir somente uma saída temporária.
- Cinco arquivos de testes focados passaram, incluindo isolamento de tenant e restrição de setores.
- Os serviços compilados de `backend/dist` foram executados contra o PostgreSQL local em transação com rollback: Admin Master recebeu recusa na transferência intersetorial, transferência no mesmo setor preservou item e saldo, e reconciliação de SEST ficou sem diferenças.

## Verificação do fluxo real em localhost:3000

O usuário identificou a URL `http://localhost:3000/sobra_corte/inventory?sector=DISTRIBUICAO&page=1`. Ela serve o frontend pelo Vite, com o componente atualizado. Os artefatos antigos eram um problema adicional, mas não explicavam a brecha nessa tela.

A causa confirmada foi a permissão para localizações com `sector = null`: os nomes exibidos na imagem correspondem a cadastros sem setor, alguns com estoque de Apoio ou Pré-Fabricado. Considerá-los compartilhados permitia uma transferência incompatível com a regra confirmada.

- Transferências agora exigem setor explícito tanto na origem quanto no destino. Admin Master também recebe recusa para localizações sem setor.
- O catálogo operacional e o seletor de destino excluem localizações sem setor e de outros setores.
- Operações legadas de entrada/saída mantêm o tratamento existente para locais sem setor; isso não autoriza transferências nesses locais.
- Nenhum setor foi inferido pelo nome da prateleira ou preenchido automaticamente. Cadastros antigos precisam receber o setor correto antes de participar de transferências, respeitando a validação dos itens já vinculados.

Validação após essa correção:

- Quatro arquivos focados do backend passaram: transferências, confiabilidade, relatórios e isolamento de tenant. O teste de componente do inventário passou, verificando também a exclusão de locais sem setor para Admin Master.
- Builds completos do backend e do frontend passaram após a alteração, atualizando os artefatos locais.
- O fluxo HTTP real pelo proxy de `localhost:3000` foi validado com Admin Master: a consulta de Distribuição retornou somente localizações explicitamente vinculadas a DISTRIBUICAO; a transferência para destino sem setor retornou HTTP 400 com a mensagem de vínculo obrigatório.
- A tentativa HTTP usou quantidade acima do saldo total para impedir persistência mesmo se uma versão antiga fosse atendida. A resposta confirmou que a validação de setor ocorreu antes da baixa.

Não foi realizado restart nem deploy em produção. Os saldos e cadastros existentes foram preservados.

## Regra definitiva de Geral/Livre e permissões de usuários (17/09/2026)

A regra esclarecida pelo usuário substitui o bloqueio absoluto de localizações sem setor da etapa anterior: **Geral/Livre (`sector = null`) aceita itens de qualquer setor, mas somente Admin Master ou Administrador Global pode cadastrar itens, registrar entradas adicionais ou transferir de/para esses locais.** O item conserva seu setor e classificação. Localizações específicas continuam exigindo o mesmo setor do item, inclusive para Master.

Correções de acesso:

- A autorização usa o setor real do item consultado no banco; omitir `sector` no payload de movimentação não permite operar outro setor. Cadastro em lote e CSV verificam cada item, dentro dos fluxos transacionais existentes.
- Perfis `admin_setor`, `lider`, `movimentador` e `leitor` precisam de setor específico. Setor ausente, `TODOS` ou inválido não concede acesso amplo. A sincronização de login continua disponível para permitir identificar usuários ainda sem atribuição.
- Inventário, sugestões, combinações, pares, histórico, dashboard, relatórios e exportações respeitam o setor atribuído. Contagens e agregações também ficam restritas. Relatórios e suas exportações exigem Líder, Admin de Setor ou Master; o exportador do histórico na interface segue essa permissão.
- Catálogos operacionais incluem Geral/Livre somente para Master. O formulário de cadastro e os seletores de movimentação aplicam essa regra. Categorias e definições gerais compartilhadas continuam disponíveis quando cabível, sem expor contagens de estoque de outros setores.
- Edição e exclusão de localizações, categorias e origens verificam o setor do recurso real. Um Admin de Setor não pode alcançar recursos de outro setor ou gerais informando o ID. Escritas também incluem o filtro de setor para impedir que uma alteração concorrente invalide a autorização anterior.
- Apenas Administrador Global pode promover alguém para Master, alterar/rebaixar um Master ou remover seu vínculo. Alteração e remoção bloqueiam a linha do vínculo antes de consultar o perfil atual, evitando decisão baseada em um perfil desatualizado.
- A tela de usuários bloqueia os controles de Master para administradores locais, oferece promoção a Master somente ao Global e exige setor específico nos demais perfis. Dashboard, relatórios, pares e histórico apresentam apenas os seletores de setor autorizados.

Nenhum vínculo de usuário foi elevado ou reatribuído automaticamente. Usuários antigos sem setor precisam receber a atribuição correta pelo administrador. Não houve nova migração nem alteração de saldos ou cadastros existentes.

Validação:

- Onze arquivos focados do backend passaram, incluindo autorização com setor omitido, recusa de Geral/Livre para perfis de setor, proteção de recursos por ID, relatórios/agregações restritos, duplicidade, CSV, histórico, validação de unidades e proteção de Master.
- Teste HTTP das rotas reais de autenticação passou: dez testes, incluindo recusa de usuários sem setor e de relatórios/exportações por Leitor e Movimentador. Persistência e provedor foram simulados; o servidor HTTP era real e local.
- Cinco arquivos de testes de componentes do frontend passaram. Casos adicionais confirmaram Geral/Livre disponível para Master e oculto para Admin de Setor, gestão de Master exclusiva do Global e seletores/consultas restritos mesmo após limpar filtros.
- PostgreSQL local: dashboard e relatórios validados nos cinco setores; transferência de/para Geral/Livre permitida para Master e recusada para perfis de setor; omissão de setor não contornou autorização. Testes sintéticos executados com rollback obrigatório, saldo total preservado e reconciliação de SEST sem diferenças.
- Builds completos do backend e frontend passaram, atualizando os artefatos locais.
- Fluxo real pelo proxy de `localhost:3000`: Master recebeu Geral/Livre no catálogo; transferência para destino geral passou pela autorização e retornou HTTP 400 por saldo insuficiente. A quantidade foi deliberadamente maior que o saldo total para impedir qualquer gravação.

Não houve deploy em produção. Concorrência real entre processos e reconstrução de snapshots históricos ausentes continuam fora da validação realizada.
