# SobraCorte — Sistema Corporativo de Gestão de Resíduos, Inventário e Planejamento (Grupo Dass)

Sistema corporativo de alta performance voltado ao controle de estoque de materiais, sobras de produção, inventário de insumos de corte/dublagem, rastreabilidade de movimentações e planejamento das linhas de calçados/vestuário do **Grupo Dass**.

---

## Tecnologias Utilizadas

### Backend

- **Node.js & TypeScript / Express**: API RESTful arquitetada em controllers e rotas modulares.
- **Prisma ORM**: Modelagem de dados relacional com suporte a múltiplos schemas PostgreSQL (`sobra_corte`, `autenticacao`, `public`).
- **PostgreSQL**: Banco de dados relacional com índices de performance otimizados para consultas de grande volume.
- **Axios / Multer**: Processamento de arquivos multipart (upload e validação de planilhas CSV).

### Frontend

- **Vue 3 (Composition API / `<script setup>`)**: Interface reativa, modular e de alta performance.
- **Pinia**: Gerenciamento de estado global de autenticação e sessão do usuário.
- **Vue Router**: Navegação SPA com guardiões de rotas (_Navigation Guards_) baseados em papéis de acesso.
- **Tailwind CSS**: Estilização moderna, design corporativo sóbrio, utilitários responsivos e micro-animações.
- **Lucide Icons (`lucide-vue-next`)**: Conjunto de ícones SVG limpos e corporativos.

---

## Módulos do Sistema

1. **Dashboard**: Indicadores em tempo real, saldo total de materiais, alertas de estoque crítico, gráfico de distribuição por categoria e top acúmulos.
2. **Materiais**: Catálogo completo com busca reativa, filtros por categoria, visualização de detalhes, controle de saldo e modal de cadastro/edição (com suporte a trava de unidade por categoria).
3. **Movimentação**: Registro de entradas e saídas de sobras com identificação da origem (Consumo, Dublagem, etc.) e operador.
4. **Relatórios**: Central de geração de relatórios filtrados por período, tipo de material e movimentação, com exportação para CSV/Excel e impressão otimizada em PDF.
5. **Gestão de Usuários**: Painel administrativo para atribuição e atualização de níveis de acesso (RBAC).
6. **Configurações**:
   - **Categorias de Material**: Gerenciamento com definição de Unidade Padrão e Trava de Unidade.
   - **Unidades de Medida**: CRUD dinâmico via API (`GET /settings/units`).
   - **Localizações**: Cadastro de prateleiras e caixotes vinculados relacionalmente às categorias.
   - **Origens de Sobra**: Gerenciamento das origens de movimentação.
   - **Importação CSV**: Importação em lote com orientações visuais, modelo baixável UTF-8 BOM e validação amigável de erros.

---

## Controle de Acesso Baseado em Papéis (RBAC Matrix)

O sistema enforca o controle de acesso tanto na barra lateral reativa ([Layout.vue](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/components/Layout.vue)) quanto no guardião de rotas do Vue Router ([router/index.js](file:///home/hellen/Documentos/PROJETOS/sobracorte/frontend/src/router/index.js)):

| Nível / Cargo    | Dashboard (`/`) | Materiais (`/materials`) | Movimentação (`/movement`) | Relatórios (`/reports`) | Usuários (`/users`) | Configurações (`/settings`) |
| :--------------- | :-------------: | :----------------------: | :------------------------: | :---------------------: | :-----------------: | :-------------------------: |
| **Leitor**       |  ✅ Visualiza   |    ✅ Apenas Leitura     |        ❌ Bloqueado        |      ❌ Bloqueado       |    ❌ Bloqueado     |        ❌ Bloqueado         |
| **Movimentador** |  ✅ Visualiza   |    ✅ Apenas Leitura     |   ✅ Lança Movimentação    |      ❌ Bloqueado       |    ❌ Bloqueado     |        ❌ Bloqueado         |
| **Líder**        |  ✅ Visualiza   | ✅ Criar/Editar/Excluir  |   ✅ Lança Movimentação    |   ✅ Gera Relatórios    |    ❌ Bloqueado     |        ❌ Bloqueado         |
| **Admin Master** | ✅ Acesso Total |     ✅ Acesso Total      |      ✅ Acesso Total       |     ✅ Acesso Total     | ✅ Gestão Completa  |     ✅ Painel Completo      |

---

## Instruções para Configuração e Execução Local

### 1. Clonar o Repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd sobracorte
```

### 2. Configurar Variáveis de Ambiente

O projeto usa sempre o arquivo `.env`, tanto localmente quanto na VPS. Crie `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=sobra_corte"
PORT=3333
PRIVATE_KEY="mesmo JWT_SECRET configurado no dass_auth_service"
CORS_ORIGINS="http://localhost:3000"
GLOBAL_ADMIN_REGISTRATIONS="12345,67890"
```

`GLOBAL_ADMIN_REGISTRATIONS` aceita matrículas inteiras positivas sem duplicatas. Use uma string vazia quando não houver administradores globais.

Crie também `frontend/.env`:

```env
VITE_AUTH_API_URL="http://localhost:2399/api"
VITE_SOBRACORTE_API_URL="http://localhost:2399/api/sobracorte"
VITE_PORTAL_UNIX_URL="http://10.100.1.43/unix/"
VITE_DEV_PORT=3000
```

Na VPS, mantenha os mesmos nomes de arquivo e altere somente os valores. As variáveis do frontend são incorporadas ao bundle durante `npm run build`.

### 3. Instalar Dependências

Na raiz do `sobracorte`:

```bash
npm install
npm --prefix backend ci
npm --prefix frontend ci
```

### 4. Preparar o banco local

```bash
npm run db:deploy
```

Esse comando aplica somente migrations SQL versionadas. O `build` gera o cliente Prisma automaticamente.

### 5. Executar em Modo de Desenvolvimento

Com o `dass_auth_service` e o `api-gateway` do ambiente já ativos, execute apenas:

```bash
npm run dev:backend
npm run dev:frontend
```

O auth existente fica em `2400`, o gateway em `2399`, o backend em `3333` e o frontend em `3000`. O navegador acessa `/api/auth` e `/api/sobracorte` pelo gateway existente.

---

## Implantação e Deploy em Produção

Para detalhes do backend e das variáveis obrigatórias, consulte o [README do backend](backend/README.md).

### Comando Seguro de Migração em Produção:

```bash
cd backend
export DATABASE_URL="postgresql://usuario:senha@ip_servidor:5432/sobra_corte?schema=sobra_corte"
npx prisma migrate deploy
npx prisma generate
```

> [!CAUTION]
> Em produção e no ambiente de testes, aplique somente as migrations versionadas com `npx prisma migrate deploy`.
