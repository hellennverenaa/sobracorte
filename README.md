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

Crie um arquivo `.env` na pasta `backend/` contendo a string de conexão com o PostgreSQL:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/sobra_corte?schema=sobra_corte"
PORT=3333
```

### 3. Instalar Dependências

#### Backend:

```bash
cd backend
npm install
```

#### Frontend:

```bash
cd ../frontend
npm install
```

### 4. Gerar o Cliente do Prisma

```bash
cd ../backend
npx prisma generate
```

### 5. Executar em Modo de Desenvolvimento

#### Executar Backend:

```bash
cd backend
npm run dev
# Servidor rodando em http://localhost:3333
```

#### Executar Frontend:

```bash
cd frontend
npm run dev
# Aplicação rodando em http://localhost:5173/sobra_corte/
```

---

## Implantação e Deploy em Produção

Para instruções detalhadas de implantação no servidor da fábrica DASS, consulte o manual dedicado:

📖 **[GUIA_DEPLOY_PRODUCAO.md](file:///home/hellen/Documentos/PROJETOS/sobracorte/GUIA_DEPLOY_PRODUCAO.md)**

### Comando Seguro de Migração em Produção:

```bash
cd backend
export DATABASE_URL="postgresql://usuario:senha@ip_servidor:5432/sobra_corte?schema=sobra_corte"
npx prisma migrate deploy
npx prisma generate
```

> [!CAUTION]
> **É ESTRITAMENTE PROIBIDO** utilizar `npx prisma db push` em ambiente de produção. Utilize sempre `npx prisma migrate deploy`.
