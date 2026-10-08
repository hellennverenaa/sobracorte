# Deploy manual: banco 2.0 para a versão atual

Este procedimento usa as regras dinâmicas ensaiadas no backup atualizado.
Execute cada etapa separadamente e avance apenas se o resultado esperado ocorrer.
Não executa reset, seed, db push nem reescreve migrations antigas.

## 1. Preparar o pacote antes da manutenção

A release precisa incluir as sete migrations novas, o `schema.prisma` alinhado e
os scripts `prepare-category-upgrade.cjs`, `audit-category-entry.cjs` e
`verify-category-upgrade.cjs`. Os arquivos novos desta sessão ainda precisam ser
incluídos no pacote/commit de release; não basta publicar o commit antigo da branch.
Preserve os `.env` de produção. Variáveis exportadas no ambiente têm precedência
sobre o `.env`, inclusive `DATABASE_URL`.

Na raiz da release:

```bash
npm --prefix backend ci
npm --prefix frontend ci
npm run build
```

Resultado esperado: backend e frontend compilados. O frontend sai em
`frontend/sobra_corte/`; mantenha as URLs/configurações vigentes de produção.

## 2. Abrir manutenção e obter backup

Bloqueie o acesso operacional e todas as gravações, incluindo processos externos
que possam movimentar o estoque. Consulte `pm2 list` e confirme o nome real da API.
O `backend/ecosystem.config.cjs` define `sobra-corte`; se esse for o nome instalado:

```bash
pm2 stop sobra-corte
```

Obtenha backup atualizado pelo procedimento operacional existente e confirme sua
restauração. Guarde a release anterior, o banco original e os logs. Não copie
senhas para comandos/logs. Mantenha a manutenção até terminar a validação.

## 3. Confirmar o banco e simular a preparação

Na pasta `backend`, com `DATABASE_URL` efetiva apontando para produção e para
`schema=sobra_corte`, prepare um diretório protegido para os relatórios:

```bash
umask 077
DEPLOY_REPORT_DIR=$(mktemp -d /tmp/sobracorte-deploy.XXXXXX)
npx prisma migrate status
node scripts/prepare-category-upgrade.cjs > "$DEPLOY_REPORT_DIR/preparation-plan.json"
```

`migrate status` pode retornar código diferente de zero por migrations pendentes;
nesse caso, a lista pendente deve ser a esperada. Migration falha, desconhecida ou
histórico diferente exige diagnóstico. O script de preparação deve retornar zero,
mostrar `mode: simulation`, o nome correto do banco e `blockers: []`. Ele exige o
esquema 2.0, anterior à primeira migration de outubro. Se qualquer uma dessas
migrations já foi aplicada, não improvisar: usar procedimento de recuperação para
o estado real do banco.

Revise categorias a criar e mudanças de classificação. Os totais podem diferir do
clone porque produção continuou sendo movimentada. Casos novos ambíguos bloqueiam
o processo; não substituir regras por uma lista fixa de IDs.

## 4. Aplicar a preparação

Substitua `NOME_REAL_DO_BANCO` pelo nome exibido na simulação. O argumento confirma
o destino configurado; não muda a conexão.

```bash
node scripts/prepare-category-upgrade.cjs --apply --confirm-database=NOME_REAL_DO_BANCO > "$DEPLOY_REPORT_DIR/preparation-applied.json"
```

Resultado esperado: código zero e `mode: applied`. A aplicação recalcula o plano,
usa transação e locks, acrescenta categorias e altera somente `StockItem.type`
quando necessário. Não altera quantidades, medidas, lados, IDs ou histórico.
Se falhar ou retornar bloqueios, pare; não aplique migrations em seguida.

## 5. Aplicar as migrations versionadas

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Resultado esperado: deploy concluído e status atualizado. Não executar `migrate dev`,
`db push`, `migrate reset`, seed ou scripts de reset de fábricas neste procedimento.
As quatro divergências antigas de checksum já investigadas devem permanecer
registradas; não atualizar checksums nem marcar migrations incompletas como aplicadas.

## 6. Validar banco atualizado

```bash
node scripts/audit-category-entry.cjs > "$DEPLOY_REPORT_DIR/category-after.json"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Resultado esperado: auditoria com código zero e `blocked: 0`; diff com código zero
e `No difference detected`. Compare saldos por fábrica/setor/medida e registros
com o backup da mesma janela, não com os totais do clone antigo.

Para comparação por registro, restaure o backup pré-deploy em um banco isolado no
mesmo servidor. O verificador é somente de leitura; os argumentos identificam
origem preservada e produção atualizada:

```bash
node scripts/verify-category-upgrade.cjs BANCO_BACKUP NOME_REAL_DO_BANCO > "$DEPLOY_REPORT_DIR/verification.json"
```

O verificador retorna `2` diante dos checksums antigos diferentes, mesmo com
registros preservados. Revise o JSON: todos os resultados devem estar preservados,
as migrations completas e as divergências limitadas às quatro já documentadas.
Código `1`, registros divergentes ou divergências novas exigem investigação.
Se o banco original não estiver disponível para comparação, a preservação completa
por registro fica sem verificação; contagens/somas sozinhas não a substituem.

## 7. Publicar as aplicações e verificar

Publique `frontend/sobra_corte/` no destino de hospedagem atualmente usado. Não
foi identificado um caminho de hospedagem no repositório; não presumir um.
Com a release nova instalada e o nome PM2 confirmado:

```bash
pm2 restart sobra-corte
pm2 logs sobra-corte --lines 50 --nostream
```

Mantendo o bloqueio operacional, valide health ready, login real, unidade ativa,
dashboard, inventário, históricos, relatórios e requisições. Em SEST/Distribuição,
confirme que CABEDAL e SOLA_PROCESSADA aparecem no novo cadastro com unidade UN e
modo lado/par e que o estoque antigo mantém vínculos e saldos. Testes de escrita
automatizados desta entrega são exclusivos de clones, não de produção.

## 8. Liberar uso e guardar evidências

Libere gravações somente após a validação. Guarde os relatórios de
`DEPLOY_REPORT_DIR`, os logs e o backup em armazenamento operacional protegido;
`/tmp` não é arquivo permanente. Monitore os primeiros cadastros e movimentos.

## Se houver falha

Mantenha a manutenção e preserve o erro. As primeiras seis migrations novas não
têm transação explícita: podem exigir recuperação de passos parciais. A última tem
`BEGIN/COMMIT`; confirme a reversão antes de qualquer `resolve --rolled-back`.
`resolve` altera o histórico e não desfaz o banco. Não usar `--applied` para pular
erro. Voltar apenas o código não desfaz a evolução do banco; escolha correção
adiante ou restauração do backup após verificar o estado real e ensaiar a recuperação.

Referência do ensaio e da proveniência histórica:
[PRODUCTION_UPGRADE_2026-10-08.md](PRODUCTION_UPGRADE_2026-10-08.md).
