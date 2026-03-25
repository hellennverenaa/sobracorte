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

2. Crie um arquivo `.env` na raiz do backend com os dados do seu PostgreSQL local:
```env
DATABASE_URL="postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/sobracorte?schema=public"
JWT_SECRET="sua_chave_secreta_local"
PORT=3333
```

3. Rode as migrações (cria as tabelas no seu PC) e inicie o servidor:
```bash
npx prisma migrate dev
npm run dev
```

---

## 📖 Documentação da API (Endpoints Principais)

A API segue a arquitetura REST. Todas as rotas (exceto o login) são protegidas e exigem autenticação.
**Header obrigatório:** `Authorization: Bearer <seu_token_aqui>`

### 🔐 Autenticação & Usuários
* `POST /login` - Autentica o usuário e retorna o Token JWT.
* `GET /users` - Lista os usuários (Requer nível Admin).
* `POST /users` - Cria um novo usuário.

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
No servidor da DASS, crie o arquivo `.env` oficial na raiz do backend:
```env
DATABASE_URL="postgresql://usuario:senha@IP_DO_SERVIDOR:5432/sobracorte?schema=public"
JWT_SECRET="chave_super_secreta_gerada_pela_infra"
PORT=3333
```

### 3. Migrations e Banco de Dados (Produção)
⚠️ **Atenção DBA:** Não utilize `migrate dev` em produção. Utilize o comando de deploy para aplicar a estrutura com segurança:
```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Configuração de Segurança (CORS)
No arquivo `src/server.ts`, verifique a configuração do CORS. A origem (`origin`) permitida deve ser atualizada para o IP ou Domínio interno onde o Frontend (Vue.js) ficará hospedado.

### 5. Iniciar Servidor (PM2)
```bash
npm run build
pm2 start dist/server.js --name "sobracorte-api"
pm2 save
pm2 startup
```