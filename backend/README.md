# SobraCorte API

API REST do SobraCorte para inventário multissetorial, movimentações, requisições, relatórios, configurações e controle de acesso por unidade fabril.

## Stack

- Node.js e TypeScript;
- Express 5;
- PostgreSQL;
- Prisma 7 com adapter `pg`;
- JWT, Helmet, CORS e rate limiting;
- Multer para importações CSV.

## Execução local

Na raiz do repositório:

```bash
npm --prefix backend ci
cp backend/.env.example backend/.env
npm run db:deploy
npm run dev:backend
```

O backend exige `PORT`, `DATABASE_URL`, `PRIVATE_KEY` e `CORS_ORIGINS`. Consulte `.env.example` para os ajustes opcionais do pool e para `GLOBAL_ADMIN_IDENTITIES`.

## Autenticação e tenant

As rotas de negócio exigem `Authorization: Bearer <token>`. O token deve conter uma unidade e uma matrícula válidas. O header opcional `X-Dass-Unit` seleciona a unidade ativa e só pode divergir da unidade nativa para administradores globais autorizados.

O papel e o setor efetivos vêm do vínculo local entre identidade e unidade. Claims externos não concedem permissões locais. Consultas Prisma em modelos multi-tenant recebem automaticamente o filtro `factoryUnitId` e falham quando executadas sem contexto de tenant.

## Endpoints principais

Todos os endpoints abaixo, exceto health checks, catálogo de unidades e login, exigem autenticação.

### Infraestrutura e sessão

- `GET /health`, `/health/live` e `/health/ready`;
- `GET /factory-units`;
- `GET /factory-unit/current`;
- `PATCH /factory-unit/current/settings`;
- `POST /auth/login`;
- `POST /auth/check-user`.

### Inventário e movimentos

- `POST /inventory/batch`;
- `GET /inventory/search`;
- `GET /inventory/search-suggestions`;
- `GET /inventory/combinations`;
- `DELETE /inventory/stock-items/:id`;
- `POST /inventory/movements`;
- `GET /inventory/movements/history`;
- `GET /inventory/mounting/matching-pairs`;
- `POST /inventory/mounting/execute-match`.

### Requisições

- `POST /requisitions` e `/requisitions/check-availability`;
- `GET /requisitions` e `/requisitions/pending-count`;
- `POST /requisitions/:id/fulfill`;
- `PATCH /requisitions/:id/cancel`.

O módulo pode ser desativado por unidade fabril.

### Dashboard e relatórios

- `GET /dashboard/summary`;
- `GET /reports/inventory` e `/reports/inventory/export`;
- `GET /reports/movements` e `/reports/movements/export`;
- `GET /reports/requisitions` e `/reports/requisitions/export`.

### Administração

- `GET /users` e `/users/audit`;
- `PUT /users/:id` e `DELETE /users/:id`;
- `/settings/categories`, `/settings/units`, `/settings/locations` e `/settings/origins`;
- `POST /import/csv`.

As permissões específicas de cada operação estão declaradas em `src/routes.ts` e são aplicadas no backend.

## Scripts e validação

```bash
npm run dev
npm test
npm run build
npm run test:identity:db
npm run test:stock-functional:db
npm run test:tenant:db
```

As auditorias `stock:integrity` e `identity:audit` são somente de verificação e requerem acesso explícito ao banco correspondente.

### Provisionamento de fábricas

O seed é executado pela configuração vigente do Prisma e só cria fábricas oficiais
ausentes. Ele preserva fábricas e configurações existentes, não copia `SEST` e
registra as configurações novas como auditorias de domínio:

```bash
npm --prefix backend exec -- prisma db seed
```

Após o build, uma fábrica não oficial pode ser criada com o mesmo catálogo fixo:

```bash
npm run factory:create -- NOVA "Nome da Fábrica"
```

O código existente é recusado. Em produção, o comando exige `--allow-production`
e autorização operacional específica. A auditoria somente leitura do catálogo e
do uso de `KG`/`G` pode ser executada com:

```bash
npm run factory:catalog:audit
```

### Cadastro externo classificado como legado pela migração

Cadastros antigos sem `authOrigin`/`authUserId` foram migrados como `LEGADO/<login>`.
Isso não comprova que a conta veio de um provedor legado: um cadastro criado pelo
DASS Identidades também pode ter perdido esses metadados no armazenamento antigo.
O login `EXTERNO/<id>` então cria outro vínculo, pois origens diferentes não podem
herdar permissões automaticamente por login ou matrícula.

Após confirmar no provedor que ambos representam a mesma conta, simule a
reconciliação (IDs são de **vínculos**, não necessariamente de identidades):

```bash
cd backend
node scripts/reconcile-external-identity.cjs 2 19 21
```

O exemplo corresponde ao caso confirmado de SAJ. Configure `DATABASE_URL` para
o clone de teste primeiro. A simulação executa e reverte a transação. O script
recusa origens, unidades, matrículas, cadastro original ou permissões incompatíveis.
Preserva o vínculo original e as auditorias, remove apenas o vínculo redundante,
atualiza a origem no cadastro original e registra a operação. A identidade migrada
fica sem vínculo como evidência. Não altera senhas nem dados no DASS Identidades.
O cadastro original deve existir; não execute em instalações que já o removeram.
A auditoria `identity:audit` aponta `multiple_bound_identities_for_login` quando
há mais de uma identidade vinculada ao mesmo login na unidade. Esse alerta exige
revisão; não autoriza unir contas de origens distintas.

Somente após validar o clone, obter backup e autorizar a alteração no banco de
destino, repita com `--apply`. Não use esse procedimento para contas realmente
distintas. As migrations já aplicadas não devem ser reescritas.

### Identidade legada migrada pelo login

O login histórico da SEST emite `LEGADO/<autenticacao.usuarios.id>`. Versões
anteriores da migração de identidade podiam registrar esses usuários como
`LEGADO/<login>`. O primeiro login agora corrige essa chave preservando o vínculo
e as permissões, sem criar uma segunda linha.

Se uma versão anterior já materializou os dois vínculos, confirme no provedor
legado que login e matrícula representam a mesma conta e simule a reconciliação
em um clone. Os argumentos são IDs de unidade e de vínculos:

```bash
cd backend
npm run identity:reconcile:legacy -- 1 4 22
```

A simulação sempre executa rollback. Depois de backup, validação do clone e
autorização operacional explícita, aplique no banco de destino com `--apply`.
O script recusa unidade, origem, ID numérico, login, matrícula ou permissões
incompatíveis; preserva o vínculo migrado e sua auditoria e remove somente o
vínculo redundante.

Para corrigir em lote todos os cadastros SEST validados contra
`autenticacao.usuarios`, incluindo a consolidação segura de duplicidades com
permissões idênticas, execute primeiro a simulação no clone:

```bash
npm run identity:backfill:legacy
```

O comando informa somente contagens e faz rollback. O uso de `--apply` está
sujeito às mesmas exigências de backup, clone validado e autorização operacional.

## Build e deploy

Use somente migrations versionadas:

```bash
npm ci
npx prisma migrate deploy
npm run build
```

O artefato do servidor é `dist/src/server.js`. O arquivo `ecosystem.config.cjs` contém a configuração PM2. Nunca substitua `prisma migrate deploy` por `prisma db push` em produção.
