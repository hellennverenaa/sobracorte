# Aceitação funcional pela interface — 08/10/2026

**Resultado: foram encontrados bloqueadores de uso. Nenhuma correção foi
aplicada nesta etapa. A implementação depende do OK do responsável.**

## Ambiente e método

- Chromium 139 real, headless, interface compilada, API Express e PostgreSQL
  reais. Os cliques, preenchimentos, validações nativas, downloads e gravações
  ocorreram pelo frontend; não foram substituídos por mocks de componentes.
- Banco separado `sobracorte_user_acceptance_20261008`, copiado do clone já
  migrado. Backup original e clone de migrations foram preservados.
- Unidade `QA_USER_20261008`, cinco identidades sintéticas: Admin, Admin de
  Setor/Corte, Líder/Corte, Movimentador/Corte e Leitor sem setor.
- Provedor externo de autenticação simulado com sessões sintéticas assinadas
  localmente. A API validou JWT, identidade e permissões reais. Chamadas do
  navegador fora do servidor local foram bloqueadas. Login real no provedor
  externo não é considerado aprovado por este ensaio.
- Cenários executados sobre o checkout `84ded15` com as correções locais da
  etapa anterior já presentes no build. Não corresponde à validação da release
  atualmente instalada em produção.
- 45 combinações de tela/perfil: Dashboard, Estoque, Pares, Requisições,
  Histórico, Relatórios, Usuários, Configurações e Perfil, com cinco perfis.
  Redirecionamentos de telas não autorizadas foram registrados como restrições,
  sem confundi-los com falhas de carregamento.
- Dados de entrada e casos adicionais produziram 81 itens sintéticos: oito
  cadastros válidos pela entrada rápida, 71 itens adicionais para paginação e
  pares, e dois materiais por CSV. Quantidades de 0,001 a 1.000,999, códigos
  distintos, acentos, caracteres delimitadores, variantes e lados E/D.

## Problemas reproduzidos

### UA-01 — P1: Dashboard e Requisições falham para Admin de Setor

**Reprodução:** entrar como Admin de Setor com setor CORTE; abrir Dashboard,
Requisições ou consultar o contador de pendências do menu.

**Observado:** HTTP 500 em `/dashboard/summary`, `/requisitions` e
`/requisitions/pending-count`. Dashboard e inbox mostram erro interno. O caso
foi reproduzido sem depender de uma requisição específica.

**Esperado:** dados limitados ao setor/subsetores permitidos, com resposta válida.

**Causa evidenciada:** `backend/src/auth/subsectorAccess.ts:126` interpola
`${alias}` como parâmetro Prisma dentro de `${alias}."factoryUnitId"`, em vez
de construir uma referência SQL de coluna. PostgreSQL retornou `42809`:
`column notation .factoryUnitId applied to type unknown, which is not a composite type`.
O helper é usado por Dashboard e pelo filtro de estoque das Requisições.

**Impacto:** impede consultas operacionais de um perfil principal. Admin Master
passou porque seu caminho não aplica esse fragmento do filtro.

Evidências: [Dashboard](sobracorte-qa-sector-dashboard.png),
[Requisições](sobracorte-qa-sector-requisitions.png),
[45 consultas e erros HTTP](sobracorte-qa-pages.json).

### UA-02 — P1: cadastro de subsetor acentuado conflita com a migration

**Reprodução:** Configurações → Subsetores → CORTE → nome `QA Serigrafia Café`
→ Criar subsetor.

**Observado:** HTTP 500 e mensagem genérica. O banco rejeita a criação por
`SubsectorConfig_normalized_name_check` (`23514`). Não cria o registro.

**Esperado:** aceitar um nome normal em português e salvar uma chave normalizada
compatível com a regra do banco.

**Causa evidenciada:** `SubsectorController.ts` remove diacríticos e transforma
caracteres não alfanuméricos em `_`. A constraint de
`20261005120000_add_subsector_inventory_scope/migration.sql` normaliza espaços
e hífens, mas mantém acentos. `QA_SERIGRAFIA_CAFE` diverge do resultado exigido
para o nome `QA Serigrafia Café`.

**Controle:** `QASERIGRAFIA` foi criado, arquivado e reativado pela interface.
Outros caracteres removidos pelo JavaScript também merecem regressão na
correção; não foram todos ensaiados.

Evidência: [erro de subsetor](sobracorte-qa-subsector-error.png).

### UA-03 — P2: origem anunciada como opcional bloqueia a entrada

**Reprodução:** Estoque → Nova Entrada Rápida → preencher categoria,
identificador, descrição, quantidade e prateleira → deixar Motivo/Origem vazio
→ Gravar Entrada.

**Observado:** select inválido na validação nativa do navegador:
`Please select an item in the list.` A gravação não chega à API.

**Esperado:** campo opcional permitir vazio ou ter regra e texto coerentes.

**Causa evidenciada:** `SectorFormInput.vue:869` aplica `required` ao select,
enquanto rótulo e opção vazia informam que ele é opcional. O problema apareceu
nos formulários dos cinco setores. Ao escolher OUTROS, as oito entradas válidas
passaram. Os cenários inválidos de quantidade/duplicidade também foram
ensaiados com uma origem explícita, evitando esse bloqueio intermediário.

### UA-04 — P2: Leitor recebe formulário de solicitação sem categorias

**Reprodução:** entrar como Leitor sem setor → Requisições → Nova Solicitação.

**Observado:** botão habilitado e formulário aberto, porém as categorias ficam
vazias; `/settings/categories` retorna HTTP 403. O usuário não consegue concluir
o caminho apresentado.

**Esperado:** apresentar apenas ações disponíveis ou carregar os catálogos
necessários se esse perfil puder solicitar. A decisão sobre autorização deve
ser confirmada antes da correção; este relatório não propõe ampliar permissões.

**Evidência de código:** o botão Nova Solicitação não possui condição por perfil;
a consulta de categorias exige setor via `assignedStockSector`. O Leitor sem
setor pode consultar a inbox e o estoque, mas essa consulta de domínio falha.

### UA-05 — P3: atendimento de material contínuo mostra “Unidades”

**Reprodução:** solicitar 0,125 M² de SINTETICO e abrir Atender.

**Observado:** saldo disponível usa M² corretamente, mas o rótulo do campo diz
`QUANTIDADE A ATENDER / BAIXAR (UNIDADES)`.

**Esperado:** exibir a unidade efetiva da requisição, ou Pares para PAR.

**Causa evidenciada:** `Requisitions.vue:1939` escolhe apenas Pares Completos ou
Unidades. A baixa de 0,125 M² passou; o defeito é de orientação na interface,
não de truncamento de saldo no cenário ensaiado.

## Fluxos executados e resultados

| Fluxo | Cenário executado | Resultado |
| --- | --- | --- |
| Dashboard | Atualização, filtros e cinco perfis | P1 para Admin de Setor; demais consultas abriram |
| Entrada rápida | SINTETICO, LINHA/KG, COURO/M, MOLDE/PEÇA, EVA, SOLA_PROCESSADA, CABEDAL, PE PRONTO | Oito entradas aprovadas com origem preenchida |
| Entrada inválida | Zero, negativo e identidade já cadastrada | Rejeitados; nenhum item indevido persistido |
| Estoque | Buscar, filtros, detalhes, próxima/anterior com 79 itens antes do CSV | Consultas e paginação passaram |
| Movimentação | Entrada 0,125; saída 0,25; transferência 0,5; saída 9.999 | Válidas passaram; excesso foi impedido |
| Exclusão de item | Material com saldo positivo | Botão bloqueado, indicando exigência de estoque zerado |
| Pares | Montagem com 5 E + 5 D, casar 2 | Restaram 3 E + 3 D; interface passou a oferecer 3 pares |
| Requisição | Busca de material, selecionar sobra, incluir e enviar 0,125 M² | Cadastro aprovado |
| Atendimento | Baixa da requisição de 0,125 M² | Atendida; saldo do material passou a 1 M² |
| Configurações / categorias | Criar categoria QA, abrir edição, cancelar e excluir | Passou |
| Configurações / locais | Criar local acentuado, editar nome, salvar e excluir local vazio | Passou |
| Configurações / origens | Criar e excluir origem QA | Passou |
| Configurações / subsetores | Nome acentuado; nome simples; arquivar/reativar | P1 no acentuado; controle simples passou |
| Importação | UTF-8, `;` entre aspas, 0,123 e 2,5, prévia e confirmação | Dois materiais gravados |
| Importação inválida | Quantidade `abc` | Rejeitada com linha, coluna e motivo; nenhum registro importado |
| Histórico | Consultar, buscar e exportar CSV | Arquivo gerado com registros sintéticos |
| Relatórios | Consultar, aplicar/limpar filtros, CSV de movimentos e requisições, imprimir | Downloads gerados; PDF de impressão gerado no navegador |
| Usuários | Alterar Líder QA para Movimentador e consultar auditoria | Papel atualizado; auditoria exibiu ator, matrícula, antes/depois |
| Acesso | URLs de telas sem permissão com cinco perfis | Redirecionamentos registrados; não são aprovação de todos os controles da API |
| Perfil | Abrir com cinco perfis | Informações renderizadas |
| Layout móvel | 390 × 844, abrir/fechar menu | Menu respondeu; largura do documento ficou em 390 px |

Após entradas, movimentações, casamento e atendimento, conferência somente de
leitura da unidade QA encontrou **zero saldos negativos, zero divergências entre
saldo total e alocações e zero itens de testes inválidos persistidos**. O material
QA-SIN-01 tinha saldo 1 M², alocado em 0,375 + 0,625 M². Essa conferência ocorreu
antes do segundo cenário de requisição destinado ao teste de cancelamento.
O roteiro adicional de cancelamento não concluiu: o controle do navegador ficou
sem resposta e foi interrompido. Os serviços HTTP locais continuavam disponíveis.
Esse caso fica **não aprovado**, sem atribuir o travamento ao aplicativo sem
reprodução independente. Cancelamento precisa de um novo ensaio.

Dados dos cenários: [entradas](sobracorte-qa-entries.json),
[ações de estoque/pares/paginação](sobracorte-qa-actions.json),
[CSV inválido](sobracorte-qa-csv-invalid.json),
[auditoria de usuário](sobracorte-qa-user-role.json).
Planilhas reproduzíveis: [válida](sobracorte-qa-valid.csv),
[inválida](sobracorte-qa-invalid.csv).

## Limites de cobertura e decisão

Não declarar “todos os botões aprovados” nem liberação de produção com base
nesta rodada. Navegar por uma tela não valida automaticamente todas as suas
ações. Bloqueios UA-01/UA-02 impedem aceitação completa dos fluxos afetados.

Ficam fora da aprovação: login/logout no provedor externo real; troca de fábrica
como administrador global; alteração de configurações de outra fábrica;
concorrência entre sessões de usuários; carga prolongada; navegadores distintos
de Chromium; impressora física; todos os cenários de requisição multi-itens,
atendimento parcial e compatibilidade entre setores; exclusão de material zerado
com histórico; todos os modos SELECTED de categoria/localização/subsetor.

As bibliotecas necessárias ao Chromium foram extraídas em `/tmp`, sem instalar
dependências no sistema/projeto. Scripts temporários de ensaio também ficam em
`/tmp`. Nenhum token ou credencial foi incluído nestas evidências. Não houve
migration, deploy ou mudança de produção nesta etapa. As alterações de código
existentes da etapa anterior foram preservadas, sem novas correções.

**Correção sugerida para revisão:** priorizar UA-01 e UA-02, depois UA-03/UA-04,
e ajustar o rótulo UA-05. Aguardar OK para implementar. Repetir os cenários reais
que falharam após a correção; não considerar somente mocks ou build suficientes.


## Atualização após aprovação

Os cinco achados foram corrigidos após o OK do usuário. Consulte [FIX_VALIDATION.md](FIX_VALIDATION.md) para resultados e evidências da revalidação. As observações acima registram o estado anterior às correções.
