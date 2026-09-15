# Plano de Correção e Integridade — SobraCorte

Data de elaboração: 14/09/2026.

Base: Relatório de Auditoria e Integridade apresentado nesta conversa, com achados C1–C6, M1–M24 e B1–B5.

## Objetivo e limites desta etapa

Restabelecer a integridade entre frontend, backend e PostgreSQL, corrigindo autenticação, permissões, precisão numérica, movimentação física, requisições, histórico e indicadores.

Este documento é o único arquivo autorizado para alteração na etapa de planejamento. Sua criação não autoriza iniciar as correções, aplicar migrações, modificar dados, publicar versões ou gerar commits de implementação. Todos os pontos começam pendentes.

A auditoria examinou o código e as migrações versionadas; não consultou o banco instalado nem validou a autenticação externa em execução. Diferenças estruturais observadas no repositório não comprovam, isoladamente, o estado do banco de produção. Cada ponto deverá confirmar suas premissas no código vigente antes da implementação e registrar qualquer diagnóstico revisado.

## Protocolo obrigatório de execução

1. **Comando inicial:** aguardar `Ponto 1` ou comando equivalente. Na primeira execução, não há ponto de implementação anterior para validar ou commitar; conferir a baseline e o estado do Git.
2. **Um ponto por vez:** implementar somente o ponto solicitado, dentro das dependências descritas. Não antecipar correções de pontos futuros, refatorações gerais ou atualizações de dependências sem relação com o ponto.
3. **Primeira ação a cada próximo comando:** antes de editar o ponto solicitado, verificar a integridade do ponto anteriormente trabalhado: diff, alterações intervenientes, critérios de aceitação e regressões pertinentes. Essa verificação precede a implementação seguinte.
4. **Falha na validação anterior:** não gerar commit de conclusão nem iniciar o ponto seguinte. Identificar a regressão e concluir apenas o trabalho necessário no ponto anterior, preservando alterações do usuário.
5. **Fechamento do ponto anterior:** após validação bem-sucedida, registrar evidências, atualizar seu status para `[x] Concluído` e gerar o commit semântico correspondente. A atualização documental deve integrar o mesmo commit, evitando um ponto concluído sem evidência versionada. Se o commit falhar, não considerar o fechamento concluído nem avançar.
6. **Escopo do commit:** incluir somente arquivos pertencentes ao ponto anterior e a atualização correspondente deste plano. Revisar os arquivos preparados; não usar inclusão indiscriminada de mudanças preexistentes ou de terceiros. Não fazer push automaticamente.
7. **Início do ponto solicitado:** somente depois do fechamento anterior, confirmar dependências e marcar `[ ] Em Progresso`. Implementar, executar os testes pertinentes e registrar o resultado.
8. **Fim da implementação de um ponto:** apresentar alterações, validações, limitações e riscos. Manter `[ ] Em Progresso`, com observação de que aguarda a validação de passagem e o commit no próximo comando. Não iniciar outro ponto automaticamente.
9. **Interpretação de `Próximo ponto`:** fechar o ponto em andamento e seguir para o próximo ponto pendente da ordem abaixo. Se nenhum ponto tiver sido iniciado, começar pelo Ponto 01. Um ponto explicitamente solicitado não autoriza implementar dependências ainda pendentes; registrar o impedimento antes de avançar.
10. **Último ponto:** após sua implementação, aguardar comando de fechamento, `Próximo ponto` ou equivalente para validar e commitar. Nesse caso, encerrar o plano sem inventar nova etapa.
11. **Banco e ambientes:** testar alterações de schema/dados em ambiente local ou descartável apropriado. Não aplicar correções de dados, migrações ou deploy em produção por inferência. Não executar chamadas de negócio contra ambientes reais como teste; inclusive GETs podem possuir efeitos colaterais até a correção correspondente.
12. **Evidências:** registrar comandos, resultados, ambiente, cenários exercitados e verificações não realizadas. Compilação ou testes com mocks não substituem integração com PostgreSQL nem comprovam concorrência real.

### Convenção de status

- `[ ] Pendente`: implementação ainda não iniciada.
- `[ ] Em Progresso`: implementação iniciada, inclusive quando aguarda validação de passagem e commit.
- `[x] Concluído`: critérios atendidos, integridade verificada e alterações fechadas em commit.

### Registro a preencher durante cada ponto

- Diagnóstico confirmado ou revisado:
- Arquivos efetivamente alterados:
- Validações executadas e resultados:
- Limitações, riscos e verificações externas pendentes:
- Resultado da validação de passagem:
- Commit: consultar o histórico Git; registrar o hash após sua criação quando houver atualização posterior do plano.

## Ordem, prioridade e dependências

As falhas de autenticação vêm antes das mudanças estruturais por permitirem acesso indevido imediato. Em seguida, o plano estabelece schema, autorização e contratos numéricos antes de modificar os fluxos de estoque e suas projeções.

| Ponto | Tema | Prioridade | Dependências diretas |
|---|---|---|---|
| 01 | Autenticação e assinatura JWT | Crítica | Baseline inicial |
| 02 | Schema, migrações e integridade relacional | Crítica | 01 |
| 03 | Contexto de autorização e isolamento por fábrica/setor | Crítica | 02 |
| 04 | Contratos numéricos e validação de entrada | Crítica | 02, 03 |
| 05 | Unidades, categorias e cadastros de domínio | Alta | 02–04 |
| 06 | Entradas, saídas e saldos por prateleira | Crítica | 03–05 |
| 07 | Transferências e exclusões com saldo | Alta | 05, 06 |
| 08 | Casamento e disponibilidade de pares | Alta | 04–07 |
| 09 | Identidade e disponibilidade das requisições | Alta | 05, 06, 08 |
| 10 | Atendimento e cancelamento de requisições | Crítica | 03, 04, 06, 09 |
| 11 | Numeração e agrupamento de requisições | Alta | 02, 09, 10 |
| 12 | Importações e suporte ao setor CONSUMO | Alta | 04–11 |
| 13 | Histórico e snapshots imutáveis | Alta | 06–12 |
| 14 | Relatórios, filtros, datas e paginação | Alta | 09–13 |
| 15 | Indicadores e cálculos do dashboard | Alta | 08, 10, 12–14 |
| 16 | Gestão de usuários e sincronização da sessão | Alta | 01–03, 13 |
| 17 | Frontend, DTOs, estados e requisições concorrentes | Alta | 03–16 |
| 18 | Exportações CSV e streaming | Alta | 03, 13, 14, 17 |
| 19 | Configuração e implantação reproduzível | Alta | 01–18 |
| 20 | Regressão integrada e fechamento da integridade | Alta | 01–19 |

## Pontos de execução

### Ponto 01 - Corrigir autenticação local e verificação de JWT

- **Camada afetada:** Back-end e configuração de autenticação.
- **Achados:** C1, C2; parte de M24 e B5.
- **Diagnóstico/Análise técnica:** `backend/src/controllers/AuthController.ts` expõe emissão de token local sem validação de senha; `backend/src/routes.ts` registra essa rota publicamente. `backend/src/auth/verifyToken.ts` permite decodificar tokens com assinatura inválida quando o ambiente é desenvolvimento ou não está definido. Examinar também `backend/src/config/dotenv.ts`, `backend/src/auth/tenant.ts`, os testes de autenticação e o contrato consumido por `frontend/src/stores/auth.js`.
- **Solução proposta:** confirmar os consumidores do login local; eliminar emissão baseada somente em identificador e unidade. Manter autenticação mediante comprovação válida pelo mecanismo oficial, desabilitando o caminho local inseguro caso ele não possua função legítima. Rejeitar assinatura inválida em todos os ambientes, remover segredo alternativo embutido e validar claims obrigatórias. Definir a precedência de cookie/Bearer de forma compatível com renovação de sessão. Preservar o contrato de sincronização de usuário autenticado e as regras legítimas de troca de fábrica.
- **Tratamentos de borda e compatibilidade:** token expirado, ausente, malformado, sem identidade, assinatura incorreta, cookie antigo com Bearer válido, indisponibilidade do provedor e configuração ausente. Não substituir o bypass por outro fallback permissivo nem presumir o contrato de um serviço externo não inspecionado.
- **Critérios de validação/teste:** demonstrar que `/auth/login` local não emite credenciais a partir apenas de usuário/unidade; testar assinatura incorreta com `NODE_ENV` de produção, desenvolvimento e ausente; validar token legítimo e respostas 401/403 adequadas. Usar provedor simulado para testes locais e registrar separadamente eventual verificação externa.
- **Commit previsto:** `fix(auth): exige identidade validada e assinatura JWT valida`.
- **Status:** [x] Concluído

### Ponto 02 - Reconciliar schema Prisma, migrações e integridade relacional

- **Camada afetada:** Banco de Dados e Back-end/ORM.
- **Achados:** C6; base estrutural de C5, M9 e M12.
- **Diagnóstico/Análise técnica:** comparar `backend/prisma/schema.prisma` com todo o diretório `backend/prisma/migrations`, o cliente gerado e `backend/src/prisma.ts`. A auditoria identificou ausência de migrações para campos/tabelas de auditoria, `enableRequisitions`, snapshots, cor de requisição, enum CONSUMO, decimais e relações opcionais de histórico. Migrações e schema divergem também em exclusão em cascata versus preservação de histórico.
- **Solução proposta:** inventariar diferenças e criar migrações incrementais, sem reescrever migrações aplicadas. Definir `NUMERIC/DECIMAL(18,3)`, política explícita para conversão de dados existentes, nulabilidade, FKs e índices coerentes com os acessos. Preservar o isolamento entre fábrica e item mesmo quando o histórico admite referência nula; uma FK composta não equivale a filtro de leitura. Planejar constraints de não negatividade e limites de atendimento considerando registros de auditoria com quantidade zero. Separar diagnóstico/backfill de alterações destrutivas ou de correções sem origem comprovável.
- **Tratamentos de borda e compatibilidade:** dados negativos, casas excedentes, duplicidades, referências órfãs e históricos antigos sem snapshots. Não inventar snapshots a partir de dados atuais como se fossem originais. Validar conversão e preservação dos registros antes de impor constraints. Alterações estruturais posteriores específicas dos Pontos 05 e 11 terão suas próprias migrações.
- **Critérios de validação/teste:** reconstruir banco descartável apenas pelas migrações; validar atualização a partir de baseline representativa; comparar schema resultante com Prisma; verificar tipos, precisão, defaults, enums, FKs, índices e tabelas de auditoria. Demonstrar retenção de histórico e rejeição de vínculos entre fábricas. Registrar explicitamente se o banco instalado não foi inspecionado.
- **Commit previsto:** `fix(db): alinha migrations ao schema e preserva integridade relacional`.
- **Status:** [x] Concluído

### Ponto 03 - Centralizar autorização por usuário, fábrica, setor e recurso

- **Camada afetada:** Back-end, rotas e contexto ORM.
- **Achados:** C3, M14, M15 e M16; isolamento descrito na auditoria.
- **Diagnóstico/Análise técnica:** `backend/src/middlewares/roleMiddleware.ts` consulta o perfil local, mas controladores continuam lendo claims em `req.user`. Revisar `backend/src/types/express.d.ts`, `backend/src/auth/tenant.ts`, `backend/src/prisma.ts`, `backend/src/routes.ts` e controladores de estoque, casamento, importação, configurações e requisições. Lotes e importações não autorizam cada item; guards podem confiar no setor enviado em vez do recurso persistido.
- **Solução proposta:** definir um contexto autenticado efetivo com identidade, papel local, setor, fábrica e privilégio global. Reutilizá-lo em todas as decisões. Conferir setor de cada recurso e de cada linha de lote/CSV, normalizando aliases. Aplicar autor/perfil/setor no cancelamento, leitura e exportação conforme a matriz de acesso. Separar consulta de listas de domínio de administração de configurações para permitir os formulários dos líderes. Completar a proteção das operações ORM não interceptadas e auditar SQL bruto e uso de cliente sem tenant.
- **Tratamentos de borda e compatibilidade:** papel alterado após emissão do token, usuário removido, setor nulo, token sem setor local, administrador global, fábrica inativa, lote misto, ID de outro setor e ID de outra fábrica. Registrar a política vigente de admin local versus global antes de alterá-la.
- **Critérios de validação/teste:** matriz real de rotas para leitor, movimentador, líder, admin_setor e admin; dois setores e duas fábricas; payload com setor falso; lote misto; importação com setor por linha; alterações de configurações por ID fora do setor. Líder deve carregar listas necessárias sem adquirir permissão de administrar configurações. Consulta/atualização por ID de outra fábrica deve ser negada.
- **Commit previsto:** `fix(authz): centraliza contexto e aplica permissoes por recurso`.
- **Status:** [x] Concluído

### Ponto 04 - Uniformizar precisão decimal e validar payloads críticos

- **Camada afetada:** Back-end e contratos de API.
- **Achados:** C4, M9; frações de pares/requisições da Seção 2.
- **Diagnóstico/Análise técnica:** `backend/src/types/stock.dto.ts` aceita quantidades incompatíveis com algumas regras físicas; `backend/src/controllers/RequisitionController.ts` ignora o DTO de atendimento. `backend/src/utils/decimalHelper.ts` converte via Number, permite infinito e trata Decimal de maneira diferente de string. Revisar validadores de movimento, cadastro legado e serialização dos controladores.
- **Solução proposta:** aplicar o DTO de atendimento imediatamente neste ponto; definir representação decimal exata de entrada/cálculo/saída, com política explícita de escala e magnitude. Manter aritmética em Decimal ou representação inteira escalada apropriada. Rejeitar negativos, zero onde proibido, valores não finitos, escala excedente e frações em setores discretos. Definir respostas de quantidade de forma explícita, preservando temporariamente consumidores compatíveis até o Ponto 17. Não transformar entrada inválida em saldo zero.
- **Tratamentos de borda e compatibilidade:** `null`, `undefined`, string vazia, booleanos, arrays, strings numéricas, separadores locais, `0.00001`, limites de `Decimal(18,3)`, expoentes e quantidades acima da precisão segura de Number. Quantidade zero continua possível em eventos de configuração e onde a regra de cadastro a permitir explicitamente.
- **Critérios de validação/teste:** POST de atendimento rejeita `-2`, zero, quantidade ausente e tipos indevidos sem alterar saldo; string numérica autorizada é normalizada sem concatenação. Casamento de 0,5 par é rejeitado. Casos de arredondamento/escala são determinísticos para string e Decimal. Validar ida e volta entre DTO, cálculo, DB e JSON nos limites adotados.
- **Commit previsto:** `fix(validation): uniformiza decimais e valida quantidades de atendimento`.
- **Status:** [ ] Em Progresso

### Ponto 05 - Normalizar unidades e preservar vínculos de domínio

- **Camada afetada:** Banco de Dados, Back-end e contratos de configuração.
- **Achados:** M6, M17 e M18; base de M8 e M13.
- **Diagnóstico/Análise técnica:** `backend/src/controllers/SettingsController.ts` cria unidades durante GET, usa símbolos com caixa inconsistente e renomeia categorias sem propagar vínculos textuais. `backend/src/services/StockItemService.ts`, `backend/src/controllers/MaterialController.ts` e `backend/src/import/materialImport.ts` podem alterar unidade de material com saldo. `CategoryConfig`, `UnitConfig` e vínculos por texto exigem decisão de identidade canônica.
- **Solução proposta:** estabelecer unidade canônica e aliases inequívocos; verificar duplicidades antes de consolidar. Manter referências estáveis para configuração, com migração/backfill quando necessário, sem reescrever snapshots. Bloquear troca de unidade com saldo sem conversão expressamente definida e auditada; não converter kg em m² por inferência. Fazer valer categoria, unidade ativa, trava de unidade e localização permitida no backend. Retirar escrita dos GETs e provisionar defaults em operação explícita idempotente.
- **Tratamentos de borda e compatibilidade:** `M2/M²`, `UN/UND`, `kg/KG`, unidades desativadas ainda referenciadas, categoria renomeada/excluída, prateleira geral, entrada do mesmo código com unidade diferente e colisões na normalização. Preservar consumidores de nomes/símbolos durante a transição do contrato.
- **Critérios de validação/teste:** consultar unidades não grava dados; reenviar mesmo código com unidade incompatível é rejeitado sem somar saldos; renomear categoria preserva vínculo e contagem; unidade desativada não entra em cadastro novo; joins de indicadores não duplicam itens. Exercitar símbolos equivalentes e conflitos de backfill em banco descartável.
- **Commit previsto:** `fix(catalog): normaliza unidades e preserva vinculos de configuracao`.
- **Status:** [ ] Pendente

### Ponto 06 - Tornar entradas e baixas atômicas por item e prateleira

- **Camada afetada:** Back-end e Banco de Dados.
- **Achados:** C5 e M1; integridade física das fórmulas de entrada/saída.
- **Diagnóstico/Análise técnica:** `backend/src/services/StockMovementService.ts` combina leitura de saldo e atualização sem condição; aplica `Math.max(0, ...)` em prateleiras e pode ignorar vínculos inexistentes. Comparar com os decrementos condicionais de `backend/src/controllers/MovementController.ts` e com a entrada em lote de `backend/src/services/StockItemService.ts`.
- **Solução proposta:** escolher estratégia concorrente consistente — atualização condicional, bloqueio ou isolamento com tratamento de conflitos — e aplicá-la a saldo total, localização e histórico na mesma transação. Usar incrementos/decrementos exatos, conferir existência e fábrica/setor da localização e rejeitar baixa sem saldo local. Definir escolha explícita de origem; se houver distribuição automática, torná-la determinística e auditada. Identificar divergências preexistentes sem corrigi-las por truncamento silencioso.
- **Tratamentos de borda e compatibilidade:** duas baixas simultâneas, entrada durante saída, último saldo, item sem localização, vínculo nulo legado, prateleira com saldo insuficiente, falha ao gravar histórico e repetição de requisição. Preservar contratos da rota legada e da unificada.
- **Critérios de validação/teste:** PostgreSQL com saldo 100 e baixas concorrentes de 60 e 50 deve aceitar apenas o total disponível; duas entradas devem somar integralmente. No cenário total 10 e prateleiras 2/8, saída de 5 da primeira deve falhar ou seguir distribuição explicitamente definida. Verificar `saldoTotal = soma(saldosLocais)` antes/depois e rollback integral quando o histórico falhar.
- **Commit previsto:** `fix(stock): garante baixas atomicas e saldo consistente por prateleira`.
- **Status:** [ ] Pendente

### Ponto 07 - Preservar estoque e rastreabilidade em transferências e exclusões

- **Camada afetada:** Back-end e Banco de Dados.
- **Achados:** M2 e lógica de transferência da Seção 2; continuidade de M1.
- **Diagnóstico/Análise técnica:** `backend/src/services/StockMovementService.ts` transfere entre setores alterando/copiando campos sem garantir o modelo do destino; CORTE permanece em Material. `backend/src/controllers/SettingsController.ts` permite excluir prateleira com vínculos e remove alocações. Examinar também exclusões em `MaterialController.ts` e `StockItemController.ts`.
- **Solução proposta:** preservar quantidade em transferências internas e validar compatibilidade do componente/unidade/setor em transferências externas. Bloquear combinações sem regra de conversão definida; não fabricar campos obrigatórios do destino. Impedir exclusão de localização com saldo, salvo fluxo explícito de realocação atômica. Preservar snapshots de origem/destino e tratamento de conflito nas exclusões serializáveis.
- **Tratamentos de borda e compatibilidade:** origem igual ao destino, destino de outra fábrica, transferência parcial/total, localização geral, aliases de setor, item incompatível com destino e transferência/exclusão concorrente com baixa. Não permitir que privilégio admin dispense invariantes físicos.
- **Critérios de validação/teste:** soma dos saldos preservada; transferência rejeitada não modifica tabelas; histórico identifica origem/destino efetivos. Exclusão de prateleira com saldo não perde distribuição; exclusão de item zerado mantém histórico; conflitos concorrentes têm resposta controlada. Testar especificamente CORTE ↔ demais setores segundo a política definida.
- **Commit previsto:** `fix(stock): preserva integridade em transferencias e exclusoes`.
- **Status:** [ ] Pendente

### Ponto 08 - Corrigir agrupamento e execução do casamento de pares

- **Camada afetada:** Back-end, Banco de Dados e consumo específico no Front-end.
- **Achados:** M5, M8; partes de C5/M1 relativas a casamento.
- **Diagnóstico/Análise técnica:** `backend/src/services/MountingPairService.ts` retorna combinações de lotes e calcula mínimos que podem compartilhar saldo. Execução debita apenas a primeira prateleira. `frontend/src/pages/MountingMatchingPairs.vue` soma essas combinações como disponibilidade física.
- **Solução proposta:** agrupar por fábrica, setor canônico, produto, tipo, cor e grade; calcular `min(somaE, somaD)` por grupo homogêneo. Diferenciar combinação de lotes de total físico disponível. Definir representação única de PAR e alocação determinística entre lotes/prateleiras; atualizar o contrato específico da tela se necessário. Reutilizar primitivas atômicas e decimais já corrigidas, validando setor real e quantidade inteira.
- **Tratamentos de borda e compatibilidade:** múltiplos lotes E/D, um lado ausente, tipos diferentes, aliases de setor, campos vazios, lotes em várias prateleiras e duas execuções simultâneas. Preservar a regra existente de retirada para produção, sem criar estoque de par pronto sem requisito de negócio.
- **Critérios de validação/teste:** E=10+10 e D=10 devem gerar 10 pares físicos; variantes incompatíveis nunca casam; quantidade fracionada é rejeitada; baixa de q pares reduz exatamente q de cada lado. Verificar saldos locais, histórico e atualização da tela após concorrência.
- **Commit previsto:** `fix(pairs): calcula disponibilidade sem duplicacao e baixa pares atomicamente`.
- **Status:** [ ] Pendente

### Ponto 09 - Unificar identidade, consulta e disponibilidade das requisições

- **Camada afetada:** Back-end, contratos de API e Banco de Dados se necessário.
- **Achados:** M3, M4; diferenças de normalização de M8.
- **Diagnóstico/Análise técnica:** `backend/src/services/RequisitionService.ts` usa SKU/modelo/descrição como alternativas OR e agrega variantes; atendimento seleciona um lote suficiente. `backend/src/services/StockItemService.ts` agrupa sugestões por código e limita o universo antes de agregá-lo. Revisar os DTOs e o payload de `frontend/src/pages/Requisitions.vue`.
- **Solução proposta:** definir identidade de material/variante com prioridade inequívoca para identificadores explícitos e dimensões necessárias por setor. Usar o mesmo seletor elegível na disponibilidade e no atendimento. Expor disponibilidade por variante e permitir alocação entre lotes compatíveis; documentar se a consulta é apenas informativa e não reserva estoque. Preservar requisições antigas com tratamento explícito de identificação incompleta, sem escolher silenciosamente outro produto.
- **Tratamentos de borda e compatibilidade:** descrição genérica, SKU válido com descrição divergente, grade/cor ausentes, EVA versus borracha, cabedal versus sola processada, estoque fracionado do CORTE, PAR e consultas sem filtros. Sugestões não devem anunciar saldo total calculado sobre apenas os primeiros 50 registros.
- **Critérios de validação/teste:** disponibilidade de dois lotes de 5 permite planejar atendimento de 8; SKU explícito não inclui material diferente por descrição; pares não misturam variantes; autocomplete identifica cor/grade/tipo corretos. Conferir equivalência entre itens elegíveis da consulta e da baixa.
- **Commit previsto:** `fix(requisitions): unifica identidade e disponibilidade por variante`.
- **Status:** [ ] Pendente

### Ponto 10 - Garantir atendimento, atendimento parcial e cancelamento consistentes

- **Camada afetada:** Back-end e Banco de Dados.
- **Achados:** C5, M1, M4 e M14; consolidação de C4 corrigido no Ponto 04.
- **Diagnóstico/Análise técnica:** `backend/src/services/RequisitionService.ts` atualiza atendimento acumulado após leitura sem proteção concorrente, debita localização simplificada e cancela por ID após leitura isolada de status. `backend/src/controllers/RequisitionController.ts` deve usar o contexto efetivo e erros de domínio consistentes.
- **Solução proposta:** realizar validação da pendência, seleção/alocação de lotes, baixas locais/totais, histórico e atualização de status em transação protegida. Usar aritmética exata e preservar `0 <= atendido <= solicitado`. Cancelar por condição de status e permissão, sem sobrescrever atendimento concorrente. Definir tratamento de repetição de atendimento e impedir dupla baixa decorrente de reenvio identificado. Revisar contagem de pendências para contemplar saldo ainda pendente de atendimento parcial conforme definição explícita.
- **Tratamentos de borda e compatibilidade:** atendimento exato, parcial, excessivo, estoque alterado desde consulta, vários lotes, par sem um lado, falha no histórico, cancelamento versus atendimento e nova tentativa após timeout. Não reabrir ou estornar automaticamente requisição cancelada.
- **Critérios de validação/teste:** testar transições PENDENTE → PARCIAL → TOTAL e cancelamento permitido; impedir negativos, concatenação, excesso e dupla baixa; executar disputa real em PostgreSQL entre dois atendimentos e entre atendimento/cancelamento. Somatório histórico deve corresponder ao atendido e ao saldo físico reduzido.
- **Commit previsto:** `fix(requisitions): torna atendimento e cancelamento transacionais`.
- **Status:** [ ] Pendente

### Ponto 11 - Garantir código único por requisição e agrupamento de itens

- **Camada afetada:** Banco de Dados e Back-end.
- **Achados:** código sequencial analisado na Seção 2.
- **Diagnóstico/Análise técnica:** `backend/src/services/RequisitionService.ts` gera código por contagem anual de linhas; vários itens compartilham o código no modelo `MaterialRequisition`, que possui índice não único. Concorrência pode fundir visualmente requisições independentes.
- **Solução proposta:** separar a identidade do pedido de seus itens, por cabeçalho ou mecanismo equivalente que permita vários itens legítimos no mesmo código. Usar contador transacional por fábrica/ano ou sequência adequada. Garantir unicidade do pedido no banco sem adicionar uma constraint que proíba os itens de um mesmo lote. Planejar migração de códigos existentes e tratar colisões históricas ambíguas sem agrupamento arbitrário.
- **Tratamentos de borda e compatibilidade:** criação simultânea, virada do ano/fuso de referência, rollback, exclusões históricas, lotes com vários itens e códigos duplicados preexistentes. Manter IDs de item e contratos de atendimento estáveis durante a transição.
- **Critérios de validação/teste:** criar pedidos concorrentes e confirmar códigos distintos; itens do mesmo pedido compartilham identificação; falha transacional não produz pedido parcialmente criado; consultas, cancelamento e relatório continuam distinguindo pedido e item.
- **Commit previsto:** `fix(requisitions): garante numeracao concorrente e agrupamento de pedidos`.
- **Status:** [ ] Pendente

### Ponto 12 - Unificar importações, cadastro legado e suporte a CONSUMO

- **Camada afetada:** Back-end, Banco de Dados e integração setorial do Front-end.
- **Achados:** M7, M8 e M19; continuidade da autorização de importação em C3.
- **Diagnóstico/Análise técnica:** revisar `backend/src/import/csvParser.ts`, `backend/src/import/materialImport.ts`, `backend/src/controllers/ImportController.ts`, `backend/src/controllers/MaterialController.ts`, `backend/src/services/StockItemService.ts`, DTOs e seletores em `frontend/src/stores/stockStore.ts`/formulários. `/materials/bulk` contorna prateleiras/histórico; CONSUMO tem caminhos incompletos; parser legado pode fixar quantidade em zero.
- **Solução proposta:** fazer cadastro e importação reutilizarem regras de domínio e persistência já corrigidas. Validar dados obrigatórios sem converter ausências em `UNDEFINED`; normalizar cor, lado, unidade e setor de forma uniforme. Concluir persistência, consulta, movimentação fracionada e exposição do setor CONSUMO conforme o suporte já previsto no produto. Determinar a semântica da planilha legada antes de alterar quantidade; recusar layout ambíguo ou apresentar validação clara. Definir limites de lote e comportamento de reimportação para evitar duplicação acidental.
- **Tratamentos de borda e compatibilidade:** CSV vazio, BOM, aspas, quebra interna, coluna ausente, separadores numéricos ambíguos, setor desconhecido, lote misto, PAR, unidade incompatível e linha inválida no final do lote. Não considerar nome de arquivo `.csv` suficiente para validar conteúdo.
- **Critérios de validação/teste:** comparar resultados equivalentes de API/CSV; nenhuma linha persiste quando um lote atômico falha; cada saldo criado tem alocação e histórico; CONSUMO mantém código/descrição, aparece na busca e permite frações autorizadas; importação de outro setor por linha continua negada. Exercitar reenvio e planilhas legadas representativas.
- **Commit previsto:** `fix(import): unifica validacao e completa fluxo de consumo`.
- **Status:** [ ] Pendente

### Ponto 13 - Preservar snapshots e unificar o histórico de operações

- **Camada afetada:** Back-end, Banco de Dados e contrato de histórico.
- **Achados:** M10, M12; rastreabilidade de M2 e M19.
- **Diagnóstico/Análise técnica:** `backend/src/services/StockMovementService.ts`, `backend/src/controllers/MovementController.ts`, `backend/src/controllers/ReportController.ts` e serviços de requisição priorizam cadastro atual em partes do histórico. CORTE grava em duas fontes e pode omitir SAIDA_REQUISICAO quando filtrado. Verificar snapshots em todos os caminhos de criação/alteração/exclusão.
- **Solução proposta:** definir representação histórica canônica, priorizando snapshot e usando cadastro atual apenas como fallback explicitamente legado. Unificar leitura de Movement/StockMovement por setor e tipo, evitando duplicação. Preservar origem/destino efetivos, identificador da requisição/operação e dimensões necessárias de variante. Manter datas e identidade originais; marcar informação histórica não recuperável em vez de inventá-la.
- **Tratamentos de borda e compatibilidade:** item/local renomeado ou excluído, referência nula, snapshot ausente em registro antigo, IDs iguais entre tabelas, alias de setor, atendimento de CORTE e transferências. Preservar paginação estável por data e desempate único.
- **Critérios de validação/teste:** renomear/excluir item ou local não muda a representação de eventos com snapshot; histórico CORTE inclui atendimento de requisição; total geral corresponde à união sem duplicatas; cada operação nova informa referências e snapshots suficientes para conciliação.
- **Commit previsto:** `fix(audit): preserva snapshots e unifica historico de estoque`.
- **Status:** [ ] Pendente

### Ponto 14 - Corrigir consultas de relatórios, períodos e paginação

- **Camada afetada:** Back-end e Front-end de relatórios.
- **Achados:** M10, M11 e parte de M22.
- **Diagnóstico/Análise técnica:** `backend/src/controllers/ReportController.ts` sobrescreve filtros OR, exclui tipos relevantes, usa enums inválidos como sentinela e limita silenciosamente consultas sem período. `frontend/src/pages/Reports.vue` envia datas ISO que o backend reinterpreta no fuso local.
- **Solução proposta:** criar montagem única de filtros validada e compartilhada entre consulta/exportação; combinar dimensões por AND, preservando OR interno. Incluir todos os tipos de movimentação pertinentes. Adotar período com fuso explícito e intervalo consistente, preferencialmente início inclusivo/fim exclusivo. Implementar paginação/contagem e agregações do universo filtrado, sem truncamento disfarçado de total. Preservar aliases documentados durante a transição.
- **Tratamentos de borda e compatibilidade:** início maior que fim, datas inválidas/incompletas, último milissegundo do dia, mudança de fuso, todos os registros, zero resultados, página além do limite, `limit=0`, setores inválidos, filtro de operador junto de busca e grande volume.
- **Critérios de validação/teste:** dataset com mais de 500 registros por fonte; totais não dependem da página; consulta e exportação selecionam o mesmo conjunto; busca não elimina filtro de operador; validar fronteiras de dia em America/Bahia com processo em outro fuso. Requisições de filtro inválido retornam 400, não erro de enum/500.
- **Commit previsto:** `fix(reports): unifica filtros periodos e totais paginados`.
- **Status:** [ ] Pendente

### Ponto 15 - Corrigir significado e precisão dos indicadores

- **Camada afetada:** Back-end e Front-end/dashboard.
- **Achados:** M5, M13, M17; estoque mínimo, giro e atendimento da Seção 2.
- **Diagnóstico/Análise técnica:** `backend/src/controllers/DashboardController.ts`, `backend/src/controllers/MaterialController.ts`, `backend/src/controllers/ReportController.ts` e `frontend/src/pages/Dashboard.vue` misturam contagens, volumes, refugos e unidades. Mapas frontend ainda usam EXPEDICAO sem sempre reconhecer DISTRIBUICAO. Joins textuais de unidades podem duplicar linhas.
- **Solução proposta:** documentar numerador, denominador, unidade, período e significado de cada KPI antes de corrigir consultas. Separar quantidade de eventos de quantidade física; agrupar por grandeza/unidade canônica; diferenciar reaproveitamento e perda; não esconder inconsistência por limite artificial de 100%. Reutilizar cálculo correto de pares; usar minStock e última movimentação relevante. Distinguir atendimento parcial/total e pedido/item. Alinhar mapas e rótulos de setores, inclusive CONSUMO quando cabível.
- **Tratamentos de borda e compatibilidade:** denominador zero, estoque inicial, saída de saldo anterior ao período, ausência de minStock útil, materiais sem movimento, eventos de configuração, múltiplas unidades e pares versus pés. Conversões só entre grandezas compatíveis com fator conhecido.
- **Critérios de validação/teste:** uma entrada de 100 e saída de 1 não pode ser anunciada como 100% de reaproveitamento físico; kg e m² não compõem um volume único; 20 pés não são rotulados automaticamente como 20 pares. Verificar pares multi-lote, estoque mínimo por item, giro por movimento, DISTRIBUICAO, rankings sem duplicação e igualdade entre payload e tela.
- **Commit previsto:** `fix(analytics): corrige grandezas e significado dos indicadores`.
- **Status:** [ ] Pendente

### Ponto 16 - Garantir edição concorrente de usuários e sessão coerente

- **Camada afetada:** Back-end, Banco de Dados e Front-end/autenticação.
- **Achados:** M20 e B4; parte de B1.
- **Diagnóstico/Análise técnica:** `backend/src/services/UserService.ts` compara expectedRole na leitura, mas atualiza apenas por ID. `frontend/src/services/interceptors/interceptor.ts` atualiza armazenamento sem sincronizar Pinia/setor. Revisar `frontend/src/stores/auth.js`, `frontend/src/pages/Users.vue`, middleware e sincronização em AuthController.
- **Solução proposta:** implementar concorrência otimista na própria escrita, cobrindo papel e setor por versão ou condição equivalente; registrar auditoria na mesma transação. Unificar construção/atualização/limpeza da sessão entre login, restore, refresh e troca de unidade, refletindo perfil/setor efetivos em memória e armazenamento. Confirmar que remoção ou redução de privilégio passa a valer conforme a política definida no Ponto 03.
- **Tratamentos de borda e compatibilidade:** dois admins editando setor com mesmo papel, tentativa de promoção indevida, usuário removido durante sessão, refresh paralelo, resposta sem token, mudança de unidade e falha de sincronização. Não incluir credenciais ou tokens nos logs de auditoria.
- **Critérios de validação/teste:** segunda edição baseada em versão antiga retorna 409; uma alteração gera auditoria coerente; refresh concorrente atualiza todos os consumidores e cabeçalhos; redução de papel/setor passa a restringir interface e API; troca de unidade não mantém permissões ou dados indevidos da anterior.
- **Commit previsto:** `fix(users): protege edicao concorrente e sincroniza sessao efetiva`.
- **Status:** [ ] Pendente

### Ponto 17 - Alinhar DTOs do frontend e estados de interação

- **Camada afetada:** Front-end e integração com API.
- **Achados:** M16, M20, M21, B1 e B2; contrato decimal de M9.
- **Diagnóstico/Análise técnica:** revisar `frontend/src/services/httpClient.ts`, `frontend/src/services/interceptors/interceptor.ts`, `frontend/src/stores/stockStore.ts`, `frontend/src/composables/useApi.js`, `frontend/src/main.js`, router, formulários e páginas. Há propriedades inexistentes de auth, uso disseminado de any, tipos de quantidade/setor divergentes, loading compartilhado, ausência de timeout e respostas antigas aplicadas sem controle.
- **Solução proposta:** tipar contratos relevantes e tratar explicitamente decimais e nulabilidade; usar propriedades reais da sessão e matriz efetiva de acesso. Separar carregamentos por operação, definir timeout, controlar cancelamento/ordem de respostas e evitar sobreposição de buscas/consultas de disponibilidade. Diferenciar erro de rede, ausência de saldo, falta de permissão, conflito e validação. Disponibilizar feedback na inicialização e nos selects. Rejeitar colagem numérica inválida sem transformar 1,5 em 15.
- **Tratamentos de borda e compatibilidade:** usuário sem setor, administrador com setor atribuído, 401/403/409/422/429/5xx, troca rápida de setor/fábrica, requisição antiga após logout, falha no refresh e salvamento bem-sucedido com recarga subsequente malsucedida. Preservar dados digitados em falhas recuperáveis.
- **Critérios de validação/teste:** verificar em tela perfis e listas autorizadas; atrasar duas respostas e confirmar que prevalece a mais recente; erro de disponibilidade não aparece como saldo zero confirmado; timeout libera loading com feedback; testar formatos decimais, colagem, nulos e navegação. Executar checagem de tipos adequada a Vue, além de sintaxe/build.
- **Commit previsto:** `fix(frontend): alinha contratos permissoes e estados assincronos`.
- **Status:** [ ] Pendente

### Ponto 18 - Garantir exportações completas, seguras e verificáveis

- **Camada afetada:** Back-end e Front-end/exportações.
- **Achados:** M22, M23 e B3.
- **Diagnóstico/Análise técnica:** `backend/src/controllers/ReportController.ts` escreve CSV sem tratar contrapressão e encerra normalmente após algumas falhas. `frontend/src/pages/StockMovementHistory.vue` exporta apenas a página carregada; `frontend/src/utils/export.js` não neutraliza fórmulas. Revisar o download em `frontend/src/pages/Reports.vue`.
- **Solução proposta:** usar filtros/autorização já corrigidos e explicitar exportação completa versus página atual. Padronizar neutralização de fórmulas, aspas, delimitadores, quebras e formatação decimal. Tratar contrapressão e desconexão; falhas após início do envio devem ser distinguíveis de arquivo completo. Definir estratégia de consistência durante exportação concorrente e manter cursor com tipo coerente, inclusive IDs de requisição em string.
- **Tratamentos de borda e compatibilidade:** arquivo vazio, grande volume, cliente lento, falha de DB após primeiro lote, cancelamento de download, células iniciadas por fórmula/caracteres de controle, acentos, aspas, UUID e mudanças de dados durante paginação. Não prometer streaming incremental no navegador quando Axios mantém um Blob completo em memória.
- **Critérios de validação/teste:** mais de 500 linhas exportadas sem perdas/duplicatas; total igual ao universo filtrado; falha induzida não gera notificação de sucesso; cliente lento respeita contrapressão; leitor não exporta por chamada direta; CSV abre com quantidades/acentos corretos e conteúdo textual não executável como fórmula.
- **Commit previsto:** `fix(export): preserva completude e seguranca dos arquivos CSV`.
- **Status:** [ ] Pendente

### Ponto 19 - Alinhar configuração, conectividade e roteiro de implantação

- **Camada afetada:** Configuração de Back-end/Front-end e implantação.
- **Achados:** M24; limites de conectividade da Seção 1.
- **Diagnóstico/Análise técnica:** comparar `DEPLOY_PRODUCAO.md`, READMEs, `.env.example`, `backend/src/config/dotenv.ts`, `backend/prisma.config.ts`, `backend/src/prisma.ts`, `backend/src/server.ts`, `backend/ecosystem.config.cjs`, `frontend/vite.config.ts` e scripts package.json. Confirmar nomes de variáveis, portas, prefixos, schema, CORS e nome PM2; proxies do Vite não acompanham automaticamente o bundle estático.
- **Solução proposta:** documentar configuração executável e validação antecipada coerentes; corrigir exemplos de chave, CORS e ambiente; definir encaminhamento de APIs e fallback da SPA em produção. Revisar lifecycle do pool/adapter e readiness, evitando encerramento duplicado ou estado de saúde enganoso. Descrever instalação reproduzível pelo lockfile, migrações, build, inicialização, verificação e estratégia de recuperação compatível com as mudanças. Alterar exemplos, não divulgar ou substituir segredos reais.
- **Tratamentos de borda e compatibilidade:** variável ausente, URL inválida, DB indisponível, processo em diretório diferente, porta ocupada, frontend em subcaminho, acesso direto a rota Vue, CORS não autorizado, HTTPS e cookie do serviço externo. Não afirmar TLS/cookies corretos sem verificar o ambiente correspondente.
- **Critérios de validação/teste:** inicialização com configuração válida e falhas claras quando inválida; prontidão reflete DB disponível/indisponível; rotas/proxies funcionam no ambiente de teste; SPA abre em `/sobra_corte/` e rotas internas; encerramento libera recursos sem erro. Revisar roteiro reproduzindo-o em ambiente apropriado, sem deploy automático em produção.
- **Commit previsto:** `fix(config): alinha ambiente proxies e implantacao reproduzivel`.
- **Status:** [ ] Pendente

### Ponto 20 - Validar regressão integrada e encerrar a auditoria de integridade

- **Camada afetada:** Front-end, Back-end e Banco de Dados/testes.
- **Achados:** B5 e confirmação integrada de todos os demais.
- **Diagnóstico/Análise técnica:** parte dos testes de `backend/tests` simula regras isoladas e não percorre os serviços reais. Os resultados da auditoria original não comprovaram autenticação externa, schema instalado ou concorrência PostgreSQL. Revisar testes existentes, novos testes de cada ponto e matriz de cobertura deste plano.
- **Solução proposta:** consolidar testes de integração usando PostgreSQL descartável e middleware/controladores/serviços reais. Cobrir jornadas de fábrica/setor, estoque, importação, requisição, casamento, histórico, relatório e exportação. Substituir simulações enganosas por testes adequados ao risco, mantendo unitários úteis. Atualizar documentação de validação e registrar achados residuais sem ampliar o escopo para funcionalidades novas.
- **Tratamentos de borda e compatibilidade:** instalação limpa e atualização, concorrência real, rollback, permissões alteradas, tenant distinto, dados legados, saldo distribuído, precisão, grande volume, falha de rede e falha após persistência. Não marcar como resolvido um cenário que depende de ambiente externo ainda não verificado.
- **Critérios de validação/teste:** executar matriz mínima abaixo; conferir integridade referencial e aritmética com consultas de leitura; demonstrar equivalência de tela/API/DB/CSV. Todos os pontos devem ter evidências, commits e limitações explicitadas. Se houver regressão de ponto anterior, registrar a origem e corrigir dentro do protocolo antes do fechamento final.
- **Commit previsto:** `test(integration): valida integridade ponta a ponta e concorrencia`.
- **Status:** [ ] Pendente

## Matriz mínima de aceitação integrada

| Área | Cenário obrigatório | Resultado esperado |
|---|---|---|
| Autenticação | Identificador conhecido sem prova de identidade; JWT inválido | Nenhum token ou acesso indevido |
| Autorização | Cinco perfis, dois setores, duas fábricas | Acesso estritamente conforme matriz de permissões |
| Revogação | Alterar papel/setor de sessão existente | API e interface refletem a política efetiva |
| Schema | Instalação limpa e atualização de baseline | Estrutura reproduzível, sem perda de histórico |
| Precisão | Frações válidas, inválidas e limites numéricos | Resultado exato ou rejeição explícita sem persistência parcial |
| Estoque | Entrada, saída, refugo e falha no histórico | Saldo total/local e histórico consistentes, com rollback |
| Concorrência | Duas baixas disputando o mesmo saldo | Não há negativo, perda de atualização ou dupla baixa |
| Transferência | Interna, intersetorial permitida e incompatível | Quantidade preservada; operação inválida rejeitada |
| Exclusão | Item zerado e prateleira com saldo | Histórico preservado; distribuição física não desaparece |
| Pares | Vários lotes E/D e variantes diferentes | Sem dupla contagem ou casamento incompatível |
| Requisições | Disponibilidade distribuída, parcial, total, cancelamento | Consulta e atendimento usam os mesmos critérios |
| Numeração | Criação simultânea com múltiplos itens | Pedidos distintos não compartilham código acidentalmente |
| Importação | API/CSV equivalentes, reenvio e linha inválida | Mesmas regras, autorização por linha e atomicidade definida |
| CONSUMO | Cadastro, pesquisa e baixa fracionada | Identidade e saldo preservados ponta a ponta |
| Histórico | Renomear/excluir cadastro após movimento | Snapshot original preservado |
| Relatórios | Busca + operador, período, mais de 500 registros | Sem filtros perdidos, truncamento oculto ou datas deslocadas |
| Dashboard | Unidades distintas, refugos, minStock e giro | Indicadores com unidade e semântica verificáveis |
| Frontend | Timeout, respostas fora de ordem e falha de saldo | Sem dados obsoletos aplicados ou erro tratado como estoque zero |
| Exportação | Cliente lento, erro no segundo lote e células de fórmula | Completude verificável e conteúdo seguro |
| Implantação | Variáveis, proxies, SPA e readiness | Configuração documentada corresponde à executável |

## Rastreabilidade dos achados

| Achado | Ponto(s) responsáveis |
|---|---|
| C1 — Login local sem identidade | 01 |
| C2 — Assinatura JWT ignorada | 01, 19 |
| C3 — Fontes de autorização divergentes | 03, 12, 16 |
| C4 — Atendimento sem validação | 04, 10 |
| C5 — Concorrência de saldos | 02, 06, 08, 10, 20 |
| C6 — Migrações divergentes | 02, 19, 20 |
| M1 — Total e prateleiras divergentes | 06, 07, 08, 10 |
| M2 — Exclusão de prateleira com saldo | 07, 13 |
| M3 — Identidade incorreta de material | 09 |
| M4 — Disponibilidade versus atendimento | 09, 10 |
| M5 — Pares superestimados | 08, 15 |
| M6 — Unidade alterada sem conversão | 05, 12 |
| M7 — CONSUMO incompleto | 12, 15, 17 |
| M8 — Representação e normalização divergentes | 05, 08, 09, 12 |
| M9 — Precisão e contrato decimal | 02, 04, 17 |
| M10 — Baixas omitidas | 13, 14 |
| M11 — Universo/filtros de relatório | 14 |
| M12 — Snapshot substituído pelo cadastro atual | 02, 13 |
| M13 — Indicadores incompatíveis | 15 |
| M14 — Cancelamento/exportação sem autorização equivalente | 03, 10, 18 |
| M15 — Configuração de outro setor | 03 |
| M16 — Listas negadas ao líder | 03, 17 |
| M17 — Vínculos textuais frágeis | 05, 15 |
| M18 — GET com escrita | 05 |
| M19 — Importação alternativa sem integridade | 12 |
| M20 — Sessão desatualizada | 01, 16, 17 |
| M21 — Estados e respostas assíncronas | 17 |
| M22 — Datas e streaming | 14, 18 |
| M23 — Fórmulas em CSV | 18 |
| M24 — Implantação divergente | 01, 19 |
| B1 — Propriedades inexistentes de auth | 16, 17 |
| B2 — Colagem altera quantidade | 17 |
| B3 — Exportação limitada à página | 18 |
| B4 — Concorrência de edição de usuário | 16 |
| B5 — Testes não comprovam integração | 01–20, com fechamento no 20 |
| Seção 2 — Código por contagem anual | 11 |
| Seção 2 — Estoque mínimo, sem giro e taxa de atendimento | 10, 15 |
| Seção 2 — Frações de pares e escala decimal | 04, 08 |
| Seção 2 — Transferência incompatível entre setores | 07 |

## Situação inicial

- Planejamento criado; nenhuma correção iniciada.
- Todos os 20 pontos estão pendentes.
- Próxima ação autorizável: comando do usuário para iniciar o **Ponto 01**.
- Nenhuma migração, alteração de dados, publicação ou commit de implementação realizado nesta etapa.
