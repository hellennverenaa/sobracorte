# SobraCorte - API & Gerenciamento de Estoque (DASS)

Sistema backend para o controle de almoxarifado, movimentações de estoque, auditoria e geração de relatórios do projeto SobraCorte.

## 🛠️ Stack Tecnológica
- **Runtime:** Node.js + Express
- **Banco de Dados:** PostgreSQL
- **ORM:** Prisma
- **Segurança (SecOps):** Helmet, CORS, Express Rate Limit
- **Autenticação:** JWT (JSON Web Tokens)

---

## 💻 Como Rodar Localmente (Ambiente de Desenvolvimento)

Instruções para programadores que forem testar ou modificar o código localmente:

1. Clone o repositório e instale as dependências:
```bash
git clone [https://github.com/hellennverenaa/sobracorte.git](https://github.com/hellennverenaa/sobracorte.git)
cd sobracorte/backend
npm install
```

2. Crie um arquivo `.env` na raiz do backend. O mesmo nome é usado localmente e na VPS:
```env
DATABASE_URL="postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/sobracorte?schema=sobra_corte"
PRIVATE_KEY="mesma_chave_usada_pelo_dass_auth_service"
CORS_ORIGINS="http://localhost:3000"
PORT=3333
```

3. Aplique apenas as migrations versionadas e inicie o servidor:
```bash
npx prisma migrate deploy
npx prisma generate
npm run dev
```

---

## 📖 Documentação da API (Endpoints Principais)

A API segue a arquitetura REST. Todas as rotas de negócio são protegidas e exigem autenticação.
**Header obrigatório:** `Authorization: Bearer <seu_token_aqui>`

### 🔐 Autenticação & Usuários
* `POST /auth/check-user` - Sincroniza o usuário identificado pelo JWT.
* `GET /users` - Lista os usuários (Requer nível Admin).

### 📦 Materiais (Estoque)
* `GET /materials` - Lista todos os materiais.
* `POST /materials` - Cadastra um novo material, gerando a prateleira e saldo inicial.
* `PUT /materials/:id` - Atualiza dados de um material.
* `DELETE /materials/:id` - Exclui um material.

### 🔄 Movimentações & Relatórios
* `GET /movements` - Lista o histórico completo de entradas e saídas.
* `POST /movements` - Registra uma nova entrada (acúmulo) ou saída (uso/venda).
* `GET /stats` - Retorna os indicadores gerenciais (Top 5, Giro, etc).

---

## 🚀 Passo a Passo de Deploy (Equipe de Redes/Infraestrutura)

Instruções estritas para colocar a API no ar no servidor oficial de Produção da DASS.

### 1. Pré-requisitos
* Node.js (v18 ou superior)
* Banco de Dados PostgreSQL (versão 13+)
* PM2 instalado globalmente (`npm install -g pm2`)

### 2. Variáveis de Ambiente (Produção)
No servidor da DASS, crie o arquivo `.env` oficial na raiz do backend. A aplicação não seleciona arquivos por ambiente:
```env
DATABASE_URL="postgresql://usuario:senha@IP_DO_SERVIDOR:5432/sobracorte?schema=sobra_corte"
PRIVATE_KEY="mesma_chave_usada_pelo_dass_auth_service"
CORS_ORIGINS="http://ORIGEM_DO_FRONTEND"
PORT=3333
```

### 3. Migrations e Banco de Dados (Produção)
⚠️ **Atenção DBA:** aplique somente migrations versionadas e revisadas:
```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Configuração de Segurança (CORS)
Adicione origens extras na variável `CORS_ORIGINS`, separadas por vírgula e sem caminhos.

### 5. Iniciar Servidor (PM2)
```bash
npm run build
pm2 start dist/src/server.js --name "sobracorte-api"
pm2 save
pm2 startup
```
