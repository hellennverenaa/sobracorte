# Ensaio dinâmico do backup atualizado — 08/10/2026

O banco local `postgres`, no container `dass-postgres`, foi mantido no estado 2.0.
O ensaio final é `sobracorte_deploy_acceptance_dynamic_clean_20261008`.
Não houve acesso nem alteração em produção. O `.env` não foi modificado.

## Resultado

A preparação dinâmica e as sete migrations pendentes foram aplicadas em uma
restauração nova, sem falhas e sem `migrate resolve`. Nenhuma migration versionada
foi alterada. A preparação foi repetida antes do deploy no primeiro ensaio:
nenhuma categoria ou alteração adicional foi proposta.

O procedimento usa os dados existentes, sem IDs de fábricas/itens nem contagens
fixas. Neste backup, criou sete categorias e alterou `type` em 268 itens:
263 itens de Apoio classificados como PECA_CORTADA receberam MOLDE / PEÇA;
um item de Montagem classificado como PE_PRONTO recebeu PE PRONTO; quatro itens
EVA de Pré-Fabricado receberam categoria distinta da EVA de Corte. As novas
categorias derivam dos tipos presentes e do escopo de setor, não de uma lista
específica de fábricas. Esses números são resultados, não condições de execução.

| Entidade | Antes | Depois |
| --- | ---: | ---: |
| Itens | 5.030 | 5.030 |
| Alocações | 1.887 | 1.887 |
| Movimentos | 1.685 | 1.685 |
| Requisições | 14 | 14 |
| Localizações | 211 | 211 |
| Categorias | 81 | 88 |
| Vínculos localização/categoria | 128 | 164 |
| Origens | 49 | 85 |

A comparação verificou os campos antigos por registro, preservando quantidades,
medidas, lados, descrições, IDs e alocações. Classificações `type`/`componentType`
foram verificadas contra os efeitos previstos. Registros antigos de usuários,
identidades, papéis, fábricas, auditorias, origens e vínculos foram preservados.
O histórico antigo de migrations também foi mantido, incluindo tentativas já
marcadas como revertidas. Categorias existentes mantiveram nomes e setores;
unidade padrão e bloqueio foram adequados pela migration de regras.

## Verificações

- Build do backend concluído.
- Quatro testes da preparação passaram, incluindo colisões, repetibilidade,
  ambiguidades e precisão de quantidades discretas acima do limite de Number.
- Auditoria de categorias no primeiro ensaio migrado: zero bloqueios e zero
  migrations falhas. Comparação por registro no ensaio limpo também passou.
- Serviços reais no primeiro ensaio: entradas PAR, requisições PAR, casamento,
  rejeição sem lado e atendimento histórico de 0,5 M² passaram em transação
  revertida. Consulta das 14 requisições históricas passou. As combinações de
  pares disponíveis foram 53 na SEST e duas na ITP.
- No ensaio limpo, todas as migrations novas estão aplicadas com seus checksums
  corretos. Não foi realizada aceitação visual do frontend nesta rodada.
- Validação HTTP no ensaio limpo: 17 endpoints de saúde, estoque, configurações,
  dashboard, requisições, usuários e relatórios retornaram HTTP 200; rotas legadas
  retornaram 404. Escritas de estoque, alocações, movimentos, auditoria e requisição
  passaram com rollback; entrada de quantidade zero foi rejeitada.
- Build do frontend concluído e os cinco arquivos de testes de componentes de
  entrada rápida, configurações, layout, detalhes e pares passaram. Isso não
  substitui aceitação visual ou validação do provedor externo de login.

## Problemas encontrados

O primeiro deploy parou com `P3015` porque duas pastas locais vazias, não
versionadas, estavam no diretório de migrations:
`20261007110000_prepare_legacy_category_entries` e
`20261007130000_sest_category_units`. Foram removidas somente essas pastas vazias.
A preparação agora verifica arquivos SQL ausentes antes de acessar o banco.
O segundo ensaio, restaurado desde o backup original, passou sem interrupção.

Quatro migrations antigas possuem checksum no banco diferente do arquivo local:

- `20260327174728_init`;
- `0_init`;
- `20260407000000_sincronizacao_user_usuarios`;
- `20260807_sync_settings_schema`.

As divergências já existem na comparação com a branch 2.0; não foram introduzidas
por este upgrade. O verificador retorna `2` e as registra, embora os registros
tenham sido preservados e o deploy tenha concluído. Não foram apagados registros,
reescritos checksums ou neutralizadas verificações para fazer o relatório passar.
Investigar os arquivos originalmente executados e o histórico operacional antes
da liberação de produção; `migrate status` não elimina essa pendência histórica.

### Investigação da proveniência

O documento `backend/prisma/UPGRADE_PRODUCAO.md` do commit `888bf64` já registrava
exatamente as quatro divergências em setembro, orientando não inventar SQL nem
editar checksums para ocultá-las. Pode ser consultado sem modificar o checkout:

```bash
git show 888bf64:backend/prisma/UPGRADE_PRODUCAO.md
```

O commit `8f3fa54` alterou migrations históricas para isolar schemas, remover o
acoplamento com autenticação e corrigir encoding. O checksum de
`20260327174728_init` no backup corresponde exatamente ao arquivo no commit
`22e641d`. O checksum de `20260407000000_sincronizacao_user_usuarios` corresponde
ao conteúdo no commit `2fcbd52` com finais de linha LF e uma quebra final.
Não foram encontrados os bytes exatos de `0_init` e do marcador
`20260807_sync_settings_schema` nas versões locais consultadas.

A divergência é histórica e sua existência já estava documentada antes deste
upgrade. Mantê-la explícita, sem reexecutar migrations antigas ou editar a tabela
do Prisma. A reconstrução desde banco vazio não foi certificada por este ensaio.
O código de saída `2` do verificador continua sinalizando a divergência; não deve
ser confundido com perda de registros nem silenciosamente tratado como sucesso.

### Alinhamento da declaração Prisma

`migrate diff` encontrou drift de declaração em `RequisitionStockCompatibility`:
o default de `updatedAt` e os nomes de uma foreign key e dois índices diferiam
entre o schema Prisma e o SQL já executado. O `schema.prisma` passou a declarar
o default existente e os nomes físicos via `map`, incluindo o nome da foreign key
truncado pelo PostgreSQL ao limite de 63 bytes. Nenhuma tabela, índice, constraint
ou registro precisou ser alterado; as migrations existentes foram preservadas.
Após o alinhamento, o backend compilou e `migrate diff --from-config-datasource
--to-schema prisma/schema.prisma --exit-code` retornou `No difference detected`
com código zero no ensaio limpo.

## Limpeza e próxima aplicação

Os oito bancos antigos de testes sem conexões ativas e o ensaio intermediário
foram removidos conforme autorização do usuário. Restaram somente `postgres`
e `sobracorte_deploy_acceptance_dynamic_clean_20261008`, além dos templates
internos do PostgreSQL. O status final do Prisma indica banco atualizado.

Seguir [o roteiro](UPGRADE_FROM_2_0.md), revisar as regras de classificação e as
configurações finais, resolver/documentar a divergência histórica e realizar a
aceitação visual. Em produção, backup atualizado e janela sem gravações continuam
necessários. O plano deve ser recalculado nessa janela: novos registros compatíveis
são tratados pelas regras; casos novos ambíguos interrompem o procedimento.
O sucesso neste clone não é autorização para aplicar em produção.
