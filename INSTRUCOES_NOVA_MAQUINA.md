# Guia de Implantação e Execução em Nova Máquina - SobraCorte

Este documento contém o passo a passo completo para configurar, instalar e executar as aplicações **Backend** e **Frontend** do projeto **SobraCorte** em um novo ambiente ou servidor.

---

## Table of Contents

1. [Pré-requisitos e Dependências](#1-pré-requisitos-e-dependências)
2. [Mapeamento de Portas e Serviços](#2-mapeamento-de-portas-e-serviços)
3. [Configuração do Banco de Dados (PostgreSQL)](#3-configuração-do-banco-de-dados-postgresql)
4. [Configuração e Execução do Backend](#4-configuração-e-execução-do-backend)
5. [Configuração e Execução do Frontend](#5-configuração-e-execução-do-frontend)
6. [Configuração de Rede e CORS](#6-configuração-de-rede-e-cors)
7. [Execução em Segundo Plano com PM2 (Produção)](#7-execução-em-segundo-plano-com-pm2-produção)
8. [Troubleshooting / Resolução de Problemas](#8-troubleshooting--resolução-de-problemas)

---

## 1. Pré-requisitos e Dependências

Antes de iniciar a instalação na nova máquina, certifique-se de que os seguintes softwares estão instalados:

| Dependência          | Versão Mínima / Recomendada       | Finalidade                                                                |
| :------------------- | :-------------------------------- | :------------------------------------------------------------------------ |
| **Node.js**          | `v18.x` LTS ou `v20.x` LTS        | Ambiente de execução para Frontend e Backend                              |
| **npm**              | `v9.x` ou superior (vem com Node) | Gerenciador de pacotes                                                    |
| **PostgreSQL**       | `v14.x` ou superior               | Banco de dados relacional                                                 |
| **Git**              | `v2.x` ou superior                | Clonagem e controle de versão do código                                   |
| **PM2** _(opcional)_ | `v5.x` (`npm install -g pm2`)     | Gerenciador de processos para manter a aplicação rodando em segundo plano |

> [!TIP]
> Para verificar se o Node.js e o npm estão instalados corretamente, execute no terminal:
>
> ```bash
> node -v
> npm -v
> ```

---

## 2. Mapeamento de Portas e Serviços

Certifique-se de que as portas abaixo estejam **liberadas no firewall** da nova máquina para tráfego de entrada e saída:

| Serviço                 | Porta Padrão | Descrição                                         | Protocolo |
| :---------------------- | :----------- | :------------------------------------------------ | :-------- |
| **Frontend Web**        | `3000`       | Interface do Usuário (Vite / Vue 3)               | HTTP      |
| **Backend API**         | `3333`       | Servidor Node.js / Express                        | HTTP      |
| **PostgreSQL**          | `5432`       | Banco de Dados Relacional                         | TCP       |
| **JSON Server** _(dev)_ | `3001`       | Mock server opcional (usado apenas em testes dev) | HTTP      |

---

## 3. Configuração do Banco de Dados (PostgreSQL)

O projeto utiliza **PostgreSQL** com suporte a múltiplos **schemas** (`sobra_corte`, `autenticacao`, `public`).

### Passo 1: Acessar o PostgreSQL

No terminal da máquina onde o PostgreSQL está rodando:

```bash
sudo -u postgres psql
```

### Passo 2: Criar o Banco e os Schemas

Execute os comandos SQL abaixo para criar o banco de dados e os schemas necessários:

```sql
-- 1. Criar o banco de dados
CREATE DATABASE sobracorte;

-- 2. Conectar ao banco recém-criado
\c sobracorte

-- 3. Criar os schemas obrigatórios utilizados pelo Prisma
CREATE SCHEMA IF NOT EXISTS sobra_corte;
CREATE SCHEMA IF NOT EXISTS autenticacao;
```

---

## 4. Configuração e Execução do Backend

### 1. Entrar na pasta do backend:

```bash
cd backend
```

### 2. Criar o arquivo `.env`:

Crie um arquivo chamado `.env` na raiz do diretório `backend/` com o seguinte conteúdo:

```env
# URL de conexão principal do PostgreSQL
DATABASE_URL="postgresql://usuario_postgres:senha_postgres@127.0.0.1:5432/sobracorte?schema=sobra_corte"

# URL para migrações do Prisma (opcional, pode ser igual à DATABASE_URL)
DB_URL="postgresql://usuario_postgres:senha_postgres@127.0.0.1:5432/sobracorte?schema=sobra_corte"

# Shadow Database usado em dev para migrações com segurança
SHADOW_DATABASE_URL="postgresql://usuario_postgres:senha_postgres@127.0.0.1:5432/sobracorte_shadow"

# Porta onde o Backend irá rodar
PORT=3333

# Chave secreta para assinatura dos tokens JWT de autenticação
PRIVATE_KEY="sua-chave-secreta-substitua-aqui"
```

> [!IMPORTANT]
> Lembre-se de substituir `usuario_postgres` e `senha_postgres` pelas credenciais reais do seu banco de dados.

### 3. Instalar as dependências:

```bash
npm install
```

### 4. Executar as Migrações do Prisma:

```bash
# Gera o cliente ORM do Prisma
npx prisma generate

# Aplica as tabelas no banco de dados sem apagar dados existentes (Modo Produção/Seguro)
npx prisma migrate deploy

# Opcional (apenas se quiser popular o banco com dados iniciais de teste):
npx prisma db seed
```

> [!WARNING]
> Nunca execute `npx prisma migrate dev` em ambiente de produção, pois ele pode solicitar o reset do banco e apagar dados de produção. Em ambiente novo/produção, utilize `npx prisma migrate deploy` ou `npx prisma db push`.

### 5. Iniciar o Backend:

- **Modo Desenvolvimento (com auto-reload):**

  ```bash
  npm run dev
  ```

- **Modo Produção (Compilado):**
  ```bash
  npm run build
  node dist/src/server.js
  ```

---

## 5. Configuração e Execução do Frontend

### 1. Entrar na pasta do frontend:

```bash
cd ../frontend
```

### 2. Criar o arquivo `.env`:

Crie um arquivo chamado `.env` na raiz da pasta `frontend/`:

```env
# Endereço da API Backend (substitua o IP pelo IP da máquina onde o backend está rodando)
VITE_BASE_API=http://<IP_DO_SERVIDOR_BACKEND>:3333
```

_Exemplo:_ `VITE_BASE_API=http://10.100.1.43:3333` ou `VITE_BASE_API=http://localhost:3333`

### 3. Instalar as dependências:

```bash
npm install
```

### 4. Iniciar o Frontend:

- **Modo Desenvolvimento:**

  ```bash
  npm run dev
  ```

  _O servidor iniciará acessível para a rede local na porta `3000` (`http://0.0.0.0:3000`)._

- **Modo Produção (Gerar build estático):**
  ```bash
  npm run build
  ```
  _Os arquivos prontos para produção serão gerados na pasta `frontend/sobra_corte/`. Você pode servi-los via Nginx, Apache ou com o pacote `serve`:_
  ```bash
  npx serve -s sobra_corte -l 3000
  ```

---

## 6. Configuração de Rede e CORS

No arquivo `backend/src/server.ts`, verifique se o IP ou domínio da nova máquina do frontend está liberado nas origens do **CORS**:

```typescript
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://<IP_DA_NOVA_MAQUINA>:3000", // Adicione o IP da máquina aqui
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Cache-Control",
      "Origin",
      "X-Requested-With",
    ],
    exposedHeaders: ["X-Total-Count"],
  }),
);
```

---

## 7. Execução em Segundo Plano com PM2 (Produção)

Para manter os serviços rodando em segundo plano e reiniciá-los automaticamente caso a máquina reinicie:

### 1. Instalar o PM2 globalmente:

```bash
npm install -g pm2
```

### 2. Iniciar o Backend no PM2:

```bash
cd backend
pm2 start dist/src/server.js --name "sobracorte-api"
```

### 3. Iniciar o Frontend no PM2:

```bash
cd ../frontend
pm2 start "npx serve -s sobra_corte -l 3000" --name "sobracorte-web"
```

### 4. Salvar o estado do PM2 para inicialização automática no boot do SO:

```bash
pm2 save
pm2 startup
```

---

## 8. Troubleshooting / Resolução de Problemas

| Sintoma                                              | Causa Provável                                           | Solução                                                                                                       |
| :--------------------------------------------------- | :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| `Error: Cannot find module '@prisma/client'`         | O cliente do Prisma não foi gerado.                      | Execute `npx prisma generate` dentro da pasta `backend`.                                                      |
| `ERR_CONNECTION_REFUSED` ao chamar a API no Frontend | Backend não está rodando ou IP/porta errados no `.env`.  | Verifique se a API responde em `http://<IP_BACKEND>:3333` e confirme o `VITE_BASE_API` no `.env` do frontend. |
| `CORS Error` no Console do Navegador                 | IP/origem do Frontend não está na whitelist do backend.  | Atualize a lista `origin` no arquivo `backend/src/server.ts` e reinicie a API.                                |
| Erro de permissão de schema no PostgreSQL            | O schema `sobra_corte` não foi criado manualmente antes. | Acesse o `psql` e rode `CREATE SCHEMA sobra_corte;`.                                                          |
