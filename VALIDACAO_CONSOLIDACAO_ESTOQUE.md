# Validação da consolidação do estoque

Data: 18/09/2026.

## Resultado

Upgrade e validação técnica aprovados em uma cópia isolada do clone de produção. Nenhuma alteração foi aplicada em produção ou ao clone original.

O histórico original termina em `20260913000000_add_stable_auth_identity`. As 15 migrations pendentes foram aplicadas por `prisma migrate deploy` em aproximadamente 3,21 segundos, incluindo a inicialização do comando. Esse tempo foi medido localmente e não estima a duração em produção.

## Ambientes e recuperação

- Clone original: conexão local do `backend/.env`, banco `postgres`.
- Aceitação: `sobracorte_deploy_acceptance_20260918`, PostgreSQL 15.18, conexão local.
- Testes funcionais: `sobracorte_cycle7_20260918`, segunda cópia descartável do banco migrado.
- Ensaio de recuperação sem erros: `sobracorte_restore15_20260918`, restauração com ferramentas PostgreSQL 15.18 do container local `dass-postgres`.
- Backup anterior ao upgrade: `/tmp/sobracorte-validation-GIIsLw/clone-before.dump`, formato custom, acesso restrito ao proprietário.
- Backup compatível validado: `/tmp/sobracorte-validation-GIIsLw/clone-before-pg15.dump`, formato custom, acesso restrito ao proprietário.
- Comparações e scripts temporários: `/tmp/sobracorte-validation-GIIsLw/`.

O primeiro backup foi restaurado no banco de aceitação antes do upgrade. O cliente PostgreSQL 18 emitiu um erro ao executar somente `SET transaction_timeout = 0`, não suportado pelo servidor 15; a restauração prosseguiu e encerrou com aviso. Essa pendência foi resolvida em um segundo ensaio: novo backup usando `pg_dump 15.18`, restaurado em outro banco com `pg_restore 15.18 --exit-on-error --single-transaction --no-owner --no-privileges`. Backup e restauração terminaram com status zero, sem avisos ou erros.

A comparação completa das tabelas do schema `sobra_corte`, incluindo `_prisma_migrations`, preservou contagens e hashes SHA-256 de todas as linhas. Os valores `last_value` e `is_called` de todas as sequences desse schema também coincidem com o clone original. Evidências em `/tmp/sobracorte-validation-GIIsLw/restore15.json`. Ownership e permissões não foram restaurados nesse ensaio; os privilégios do usuário da aplicação precisam ser conferidos no ambiente de produção. Os backups temporários contêm dados do clone e não devem ser versionados ou compartilhados como relatório.

## Preservação dos dados

| Estrutura | Antes | Depois |
| --- | ---: | ---: |
| Material → StockItem | 3.430 | 3.430 |
| MaterialLocation → StockItemLocation | 163 | 163 |
| Movement → StockMovement | 203 | 203 |
| MaterialDeletionAudit | 2 | 2 |
| RoleChangeAudit | 5 | 5 |

Hashes SHA-256 de projeções equivalentes, ordenadas por ID, foram iguais antes/depois. A comparação cobre identificadores, unidade fabril, atributos do item, quantidades, datas, snapshots dos movimentos, operador, origem e localização histórica conforme a direção do movimento. Os motivos históricos foram comparados separadamente e preservados. Categoria/unidade relacionais foram comparadas com os textos correspondentes no schema final; quantidades foram normalizadas para evitar diferenças apenas de representação decimal.

Saldos por unidade fabril preservados: unidade 1 = `852.030`; unidade 2 = `0.000`. Esses valores são apenas comparação por tenant, não um indicador que combine unidades de medida.

Os OIDs das três tabelas originais e das sequences existentes foram preservados, comprovando renomeação dos mesmos objetos físicos. Novas sequences de identidade/RBAC foram adicionadas. Todos os itens históricos foram classificados como `CORTE/MATERIA_PRIMA`. Não restaram tabelas `Material`, `MaterialLocation`, `Movement` ou `StockMigrationCheckpoint` no banco de aceitação.

Uma comparação adicional após os smoke tests confirmou a preservação dos dados de estoque e auditoria; as escritas desse smoke foram revertidas. Sequences podem avançar mesmo em transações revertidas, como ocorre normalmente no PostgreSQL.

## Checks executados

- Geração do Prisma Client e build do backend aprovados.
- `prisma migrate status`: banco atualizado.
- `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code`: nenhuma diferença detectada.
- Auditorias `stock:integrity` e `identity:audit` aprovadas antes da inclusão dos dados sintéticos funcionais.
- 18 testes de integração PostgreSQL aprovados, sem skips: estoque, concorrência, rollback, requisições, CSV dos seis setores, paginação, snapshots, identidade/RBAC e isolamento multi-tenant.
- 143 testes restantes do backend aprovados, sem skips.
- 13 arquivos de testes do frontend aprovados, sem skips; build do frontend aprovado.
- Smoke HTTP aprovado para readiness, unidade, inventário, configurações, dashboard, histórico, requisições, usuários e relatórios; APIs removidas retornaram 404.
- Escritas transacionais de estoque, localização, movimento, auditoria de papel e requisição aprovadas e revertidas.
- Os três tipos de auditoria de configuração aceitam quantidade zero; entrada de estoque com quantidade zero foi rejeitada.
- Criação, edição e exclusão de categoria pela API aprovadas na segunda cópia, com as três auditorias de quantidade zero mantidas.
- Ensaio de backup/restauração PostgreSQL 15 aprovado sem erros ou avisos, com comparação completa de dados e estados das sequences do schema `sobra_corte`.

## Pendência do histórico

Quatro migrations já aplicadas no clone original possuem checksums diferentes dos arquivos atuais:

- `20260327174728_init`;
- `0_init`;
- `20260407000000_sincronizacao_user_usuarios`;
- `20260807_sync_settings_schema`.

A diferença já existe antes da consolidação e não corresponde apenas a finais de linha LF/CRLF dos arquivos atuais. A investigação cobriu os arquivos SQL do histórico Git, reflog e blobs não referenciados, comparando bytes originais e variantes de encoding, BOM e quebra de linha. Três checksums foram explicados:

| Migration | Evidência histórica que reproduz o checksum |
| --- | --- |
| `20260327174728_init` | Blob `8d43597affe3e6237aef6d502c660a25b843bd15`, bytes exatos. O arquivo atual foi neutralizado no saneamento do histórico. |
| `0_init` | Blob `caab06ee8b8cf93408b5140afe03890a1cbc33ce`, leitura UTF-8 e normalização LF. Há arquivos antigos em UTF-16 no histórico. |
| `20260407000000_sincronizacao_user_usuarios` | Blob `0d39fbba00e127aec3676fdb62812ca106031839`, UTF-8, LF e newline final. O saneamento removeu criação e vínculo com o schema externo de autenticação. |

Os commits `8f3fa54` e `2fcbd52` documentam alterações de encoding e saneamento desses arquivos. As versões históricas foram usadas somente para investigação; não foram reinstaladas, pois incluem comportamento antigo, como criação no schema `public` e acoplamento com autenticação externa.

Resta uma pendência documental: não foi localizado SQL que reproduza o checksum de `20260807_sync_settings_schema`. O arquivo atual é um marcador `SELECT 1`; sua inclusão no Git registra que as alterações de schema foram versionadas em `20260807193000_align_runtime_schema`. É necessário obter o `migration.sql` original no artefato ou checkout usado no deploy que registrou essa migration, para compará-lo com o checksum do clone. Um dump do banco contém o checksum, mas não o SQL original aplicado.

Nenhum checksum ou migration histórica foi alterado para ocultar diferenças. As migrations novas aplicadas na aceitação correspondem aos arquivos atuais. O deploy passou e o schema final não tem drift em relação ao Prisma. Evidências da investigação em `/tmp/sobracorte-validation-GIIsLw/checksum-history.json`.

## Procedimento de produção e rollback

1. Obter e revisar o SQL original de `20260807_sync_settings_schema`, cuja correspondência histórica ainda não foi identificada. Manter documentadas as três divergências já explicadas; não reescrever checksums ou marcar migrations como aplicadas para esconder diferenças.
2. Confirmar que produção continua no mesmo histórico validado e não recebeu a estratégia paralela. Mudanças posteriores ao clone exigem nova conferência dos dados e migrations relevantes.
3. Preparar o build, as ferramentas PostgreSQL compatíveis, a janela de manutenção e o artefato anterior da aplicação. Confirmar os destinos das conexões antes de qualquer operação.
4. Suspender as escritas e parar os processos que usam o schema antigo, pois a renomeação não é compatível com esse runtime.
5. Gerar um backup atual com `pg_dump` em formato custom, com acesso restrito, usando a conexão de produção configurada de forma segura. Restaurá-lo em um banco separado e conferir integridade antes de prosseguir.
6. Com autorização explícita para produção, executar `npm run db:deploy`, iniciar a versão nova e repetir auditorias e smoke tests. Liberar as escritas somente após aprovação.
7. Em caso de falha, manter as escritas suspensas. Restaurar o backup em outro banco, validar sua integridade e iniciar o artefato anterior apontando para esse banco. A troca da conexão é uma operação de produção e exige autorização. Não executar uma renomeação inversa improvisada ou sobrescrever o banco com falha sem confirmação.

O rollback descrito foi preparado como procedimento; não houve troca de conexão de produção ou restauração destrutiva. Se escritas forem liberadas após o deploy, voltar ao backup anterior descartaria essas novas operações. Nesse cenário, a recuperação exige decisão explícita sobre os dados posteriores ao backup.
