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
npm run test:stock-migration:db
npm run test:tenant:db
```

As auditorias `stock:integrity` e `identity:audit` são somente de verificação e requerem acesso explícito ao banco correspondente.

## Build e deploy

Use somente migrations versionadas:

```bash
npm ci
npx prisma migrate deploy
npm run build
```

O artefato do servidor é `dist/src/server.js`. O arquivo `ecosystem.config.cjs` contém a configuração PM2. Nunca substitua `prisma migrate deploy` por `prisma db push` em produção.
