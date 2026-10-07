# Validação do backup de produção — 07/10/2026

Resultado: **preparação aprovada e sete migrations aplicadas sem falhas ao banco
restaurado de testes**. A correção do atendimento fracionado está aplicada ao
código e validada com os serviços reais. A produção não foi alterada.
O deploy sem preparação falha neste backup; o procedimento exige o SQL abaixo.

## Migrations e preparação

O backup está em PostgreSQL 15.18, com as migrations até
`20260918130000_remove_consumo_sector`. Sete migrations estavam pendentes e foram aplicadas após a preparação.
As primeiras seis passam; `20261007120000_category_entry_rules` interrompe por
569 itens sem categoria correspondente. Não há conversão ou descarte automático.

| Unidade | Setor / classificação atual | Itens sem vínculo | Preparação proposta |
| --- | --- | ---: | --- |
| SEST | Distribuição / SOLA_PROCESSADA | 159 | Criar categoria SOLA_PROCESSADA, UN e lado/par |
| SEST | Distribuição / CABEDAL | 1 | Criar categoria CABEDAL, UN e lado/par |
| SEST | Pré-Fabricado / EVA | 4 | Categoria distinta EVA (PRÉ-FABRICADO), UN e lado/par |
| SEST | Montagem / tipo vazio, PE_PRONTO legado | 1 | Categoria PE PRONTO, UN e lado/par |
| SAJ | Corte / REFORÇO | 6 | Preservar nome e medida M² |
| SAJ | Corte / SOLADO INJ DIRETA | 5 | Preservar nome e medida M² |
| SAJ | Corte / EVA INJETADO | 1 | Preservar nome e medida M² |
| ITP | Corte / FILME | 129 | Categoria FILME separada da existente FILME TPU, M² |
| ITP | Peças Cortadas / tipo vazio, PECA_CORTADA legado | 263 | Vincular à categoria existente MOLDE / PEÇA, UN sem lado |

A categoria EVA já existe em Corte na SEST, e os nomes são únicos por unidade.
Reutilizá-la para Pré-Fabricado misturaria regras de medida. A separação proposta
mantém a categoria original e altera somente a categoria textual dos quatro itens
de Pré-Fabricado. As descrições específicas das 263 peças da ITP são preservadas;
a associação a MOLDE / PEÇA foi aprovada nesta rodada.

O [SQL de preparação aprovado](category-entry-preflight.sql.review) está em formato de revisão,
com verificações de esquema, unidades e contagens. Não é reparo genérico: um
backup diferente requer nova auditoria. Foi ensaiado antes das migrations em
um segundo clone: as sete foram aplicadas sem falha nem `migrate resolve`.
Após aprovação, o mesmo procedimento passou no banco restaurado de testes.
As migrations versionadas não foram modificadas.

## Comparação de dados

Comparação por registro e campo existente, incluindo chaves compostas:

| Dados | Antes | Depois | Resultado |
| --- | ---: | ---: | --- |
| Itens de estoque | 5.037 | 5.037 | Mesmos IDs, saldos, medidas, lados e descrições |
| Alocações por localização | 1.906 | 1.906 | Todos os vínculos e saldos idênticos |
| Localizações | 219 | 219 | Nenhuma removida ou alterada |
| Movimentos | 1.764 | 1.764 | Campos históricos existentes preservados |
| Requisições | 14 | 14 | Campos históricos existentes preservados |
| Categorias | 81 | 89 | Oito adicionadas; nenhuma removida |
| Vínculos localização/categoria | 109 | 148 | Vínculos anteriores preservados, 39 adicionados |
| Origens | 49 | 85 | Origens anteriores preservadas, 36 adicionadas pelas migrations |

Usuários, identidades, papéis, unidades e auditorias existentes também foram
preservados. A preparação altera `StockItem.type` em 268 itens: preenche 264 tipos
vazios e distingue os quatro EVA de Pré-Fabricado. Os demais tipos são mantidos.
Novos vínculos `categoryId` e novos campos de esquema são alterações previstas.

As regras derivam unidades de estoque quando existem. COURO da SEST passa de
configuração M para M², a medida efetivamente usada, sem converter saldos.
A consulta direta após a definição de unidades corrigiu a leitura anterior:
EVA e FERRAMENTAIS não têm itens; PALMILHA tem 22, EMBALAGEM tem 22 e QUIMICO
tem 43 itens, estes três em M². A contagem da auditoria de regras não foi
suficiente para concluir ausência de vínculos nessas categorias.

No banco de testes, foi aplicado EVA = M e FERRAMENTAIS = UN, confirmando
a ausência de vínculos antes da alteração. PALMILHA permanece M² conformesolicitado. Após autorização para transformar em KG, EMBALAGEM (22 itens)
e QUIMICO (43 itens) tiveram a unidade das categorias e dos itens corrigida
para KG, mantendo todos os demais campos. Ambos tinham saldo total zero.
Nenhuma requisição ou compatibilidade estava vinculada a esses itens.
A comparação confirmou alocações, movimentos e requisições intactos; os
snapshots históricos mantêm a unidade registrada no momento da movimentação.

## Continuidade da Distribuição

| Unidade / material | Itens | Saldo preservado |
| --- | ---: | --- |
| SEST / Sola Processada | 159 | 527 UN: 278 E e 249 D |
| SEST / Cabedal | 1 | 5 UN E |
| ITP / Cabedal | 8 | 10 UN: 8 E e 2 D |

Os serviços consultam todos esses itens e oferecem as origens correspondentes
para novas requisições. O casamento identifica 52 combinações na SEST e 2 na ITP.
Isso conta combinações, não a soma de pares físicos disponíveis.
As 14 requisições históricas puderam ter a disponibilidade consultada; isso não
significa que todas tenham saldo suficiente para atendimento.

## Regressão encontrada e corrigida

O atendimento usa `requestUnit || 'UN'`. Requisições históricas têm essa unidade
vazia; um atendimento de 0,5 M² é rejeitado como quantidade fracionada em unidade
discreta. O [patch aplicado](legacy-requisition-unit.patch) usa a unidade da origem
compatível quando a requisição não tem unidade explícita. O backend compilou
com sucesso e o teste com o código definitivo atendeu 0,5 M² de uma requisição
histórica, reduzindo o saldo de 1,5 para 1 M². As escritas de teste foram revertidas.

## Verificação executada

- Integridade dos registros originais nos clones; no banco restaurado atualizado,
  hashes confirmam preservação dos itens (descontadas as classificações aprovadas),
  alocações, movimentos e requisições.
- Auditoria final do banco restaurado: zero bloqueios e zero migrations falhas.
- Build do backend e testes de serviços/HTTP passaram com o código definitivo.
- Rotas autenticadas de estoque, configurações, dashboard, histórico,
  requisições, usuários e relatórios: HTTP 200; rotas legadas: HTTP 404.
- Operações de configuração, estoque, movimentos, auditoria e requisição
  verificadas em transação com rollback.
- Serviços reais nos cinco setores: entrada PAR cria E/D, nova requisição PAR,
  casamento, baixa e rejeição de entrada sem lado. Escritas revertidas.
- Testes de interface em cinco arquivos: entrada rápida, configurações,
  layout, modal de estoque e casamento de pares, sem falhas.

O teste HTTP anterior usava `limit=5`, que a API rejeita; foi corrigido para 50,
mantendo a exigência de HTTP 200. A auditoria agora informa pré-requisitos de
esquema quando executada no backup antigo, em vez de falhar sem contexto.

## Pendências para liberação

1. Validar visualmente a interface com os dados migrados; os testes automatizados
   não substituem a aceitação visual do usuário.
2. Para produção, repetir com backup atualizado, manutenção sem gravações e
   comparação antes/depois. A aprovação desta rodada foi para o banco de testes.

Os testes cobrem os dados deste backup e os fluxos indicados; não constituem
garantia sobre todas as combinações possíveis, futuras gravações ou infraestrutura.
