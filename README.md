# SobraCorte

Sistema corporativo do Grupo Dass para gestão de sobras de produção, inventário multissetorial, movimentações, requisições e rastreabilidade por unidade fabril.

## Visão geral

O repositório contém duas aplicações:

- `backend`: API REST em Node.js, TypeScript, Express, Prisma e PostgreSQL;
- `frontend`: SPA em Vue 3, Pinia, Vue Router, Vite e Tailwind CSS.

O sistema atende os setores de Corte, Apoio, Pré-Fabricado, Distribuição, Expedição e Montagem. O estoque unificado usa `StockItem`, `StockItemLocation` e `StockMovement`. As tabelas legadas de materiais e movimentos permanecem no esquema para compatibilidade e reconciliação durante a migração.

## Funcionalidades

- dashboard com indicadores por setor e unidade de medida;
- inventário com busca, filtros, localizações e movimentações;
- entradas, saídas, transferências, refugo e casamento de pares;
- requisições de reposição, atendimento parcial ou total e cancelamento;
- relatórios paginados e exportação CSV de inventário, movimentos e requisições;
- gestão de categorias, unidades de medida, localizações e origens;
- importação de estoque por CSV;
- gestão de usuários, papéis, setores e auditoria de alterações;
- isolamento de dados por unidade fabril.

## Arquitetura

### Backend

A API é organizada em rotas, controllers e serviços. As rotas de negócio exigem JWT emitido pelo serviço de autenticação da Dass.

O tenant ativo é determinado pela unidade do token ou pelo header `X-Dass-Unit`. Apenas administradores globais configurados podem acessar uma unidade diferente da unidade nativa. Uma extensão do Prisma injeta `factoryUnitId` nas operações dos modelos isolados e rejeita consultas fora de um contexto de tenant.

O backend também aplica Helmet, CORS, rate limiting, limites de payload, health checks, snapshots históricos e encerramento gracioso do servidor e do pool PostgreSQL.

### Frontend

A SPA restaura a sessão antes da montagem, protege rotas por papel e setor e envia automaticamente o token e a unidade ativa à API. Em uma resposta `401`, o cliente tenta renovar a sessão uma vez, sincroniza o usuário local e repete a requisição original.

As rotas principais são:

| Caminho | Módulo |
| --- | --- |
| `/` | Dashboard |
| `/inventory` | Inventário e movimentações |
| `/mounting-pairs` | Casamento de pares |
| `/requisitions` | Requisições |
| `/stock-history` | Histórico de estoque |
| `/reports` | Relatórios |
| `/users` | Gestão de usuários |
| `/settings` | Configurações |

`/materials` e `/movement` existem somente como redirecionamentos de compatibilidade no frontend.

## Papéis e acesso

| Papel | Acesso principal |
| --- | --- |
| `leitor` | Consulta dashboard, inventário, histórico, pares e requisições habilitadas |
| `movimentador` | Acesso de leitura e registro de movimentos no setor atribuído |
| `lider` | Movimentos, criação em lote e relatórios do setor atribuído |
| `admin_setor` | Gestão operacional e configurações do setor atribuído |
| `admin` | Administração completa da unidade, incluindo usuários |

Administradores globais têm acesso administrativo às unidades autorizadas pela configuração. O backend é a autoridade final de acesso; as proteções do frontend servem apenas à navegação e à experiência do usuário.

## Requisitos

- Node.js `20.19+`, `22.12+` ou `24+`;
- PostgreSQL 13 ou superior;
- serviço de autenticação Dass e API Gateway disponíveis para o fluxo integrado.

## Configuração local

Instale as dependências e crie os arquivos de ambiente:

```bash
npm --prefix backend ci
npm --prefix frontend ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

As variáveis obrigatórias estão documentadas nos arquivos `.env.example`. `GLOBAL_ADMIN_IDENTITIES` aceita uma lista separada por vírgulas no formato `UNIDADE:MATRICULA`. `VITE_GATEWAY_URL` é opcional e usa `http://127.0.0.1:2399` por padrão no desenvolvimento.

## Banco de dados

Aplique somente as migrations versionadas:

```bash
npm run db:deploy
```

Não use `prisma db push` em produção. Scripts de backfill, reconciliação e integridade do estoque estão disponíveis no `backend/package.json` e devem seguir o procedimento de migração do ambiente.

## Desenvolvimento

Com o serviço de autenticação e o gateway ativos:

```bash
npm run dev:backend
npm run dev:frontend
```

Portas padrão: autenticação `2400`, gateway `2399`, backend `3333` e frontend `3000`.

## Validação

```bash
npm test
npm --prefix frontend test
npm run build
```

Os testes que dependem de PostgreSQL possuem comandos específicos no `backend/package.json` e requerem um banco de teste preparado.

## Produção

Antes de iniciar uma nova versão do backend:

```bash
npm --prefix backend ci
npm run db:deploy
npm --prefix backend run build
```

O processo PM2 pode ser iniciado com `backend/ecosystem.config.cjs`. Consulte também o [README do backend](backend/README.md) e o [guia de segurança](backend/SECURITY.md).
