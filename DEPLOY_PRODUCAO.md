# Guia de Deploy em Produção — SobraCorte v3.0 (Multi-Setor)

Este documento descreve o roteiro oficial de atualização e manutenção do **SobraCorte** no servidor de produção para a versão **v3.0 (Multi-Setor)**.

---

## 1. Pré-requisitos e Variáveis de Ambiente (`.env`)

Certifique-se de que o arquivo `.env` na pasta `backend/` contenha todas as variáveis obrigatórias configuradas para o ambiente de produção:

```env
# Banco de Dados (PostgreSQL) - Obrigatório apontar para o schema correto
DATABASE_URL="postgresql://usuario:senha@host:5432/nome_banco?schema=sobra_corte"

# Configurações do Servidor
PORT=3000
NODE_ENV=production

# Segurança e Autenticação
JWT_SECRET="sua_chave_secreta_jwt_longa_e_segura"
DASS_AUTH_API_URL="https://url-da-api-de-autenticacao-dass.com"
```

> [!IMPORTANT]
>
> - A `DATABASE_URL` deve incluir o parâmetro `?schema=sobra_corte`.
> - Defina `NODE_ENV=production` para desativar logs de debug e habilitar flags de segurança em cookies e middlewares.

---

## 2. Passo a Passo de Atualização

### Passo 1: Atualizar o Repositório Git

Na raiz do projeto no servidor:

```bash
git checkout main
git pull origin main
```

---

### Passo 2: Backend & Banco de Dados

Acesse a pasta do backend, instale as dependências com lockfile estrito, execute as migrações, o seed inicial e gere a build:

```bash
cd backend
npm install --frozen-lockfile
npx prisma migrate deploy
npm run build
```

> [!NOTE]
>
> - `npx prisma migrate deploy`: Aplica apenas migrações pendentes de forma segura, sem reiniciar nem recriar tabelas existentes.
> - `npx prisma db seed`: Operação idempotente que garante o provisionamento e integridade dos dados base (incluindo a unidade de Ivoti / SEST) sem duplicar registros.
> - O script `npm run build` executa o `prisma generate`, a compilação do TypeScript e a cópia dos artefatos para `dist/`.

---

### Passo 3: Frontend

Acesse a pasta do frontend, instale as dependências e gere o bundle de produção:

```bash
cd ../frontend
npm install --frozen-lockfile
npm run build
```

---

### Passo 4: Reiniciar Gerenciador de Processos (PM2)

Reinicie o processo da API no PM2 e verifique a saúde da aplicação:

```bash
pm2 restart sobracorte-api
pm2 status
```

_(Opcional: verificar logs de inicialização)_

```bash
pm2 logs sobracorte-api --lines 50
```

---

## 3. Checklist Pós-Deploy

Após a conclusão dos passos acima, execute as seguintes validações no ambiente de produção:

- [ ] **Autenticação e Unidade SEST:** Fazer login com usuário operacional e validar se o carregamento da unidade/setor **SEST** ocorre normalmente.
- [ ] **Permissões Admin Master:** Validar se usuários com perfil Admin Master conseguem alternar e acessar plantas/unidades diferentes.
- [ ] **Emissão de Relatórios:** Acessar o módulo de relatórios e testar a exportação/emissão no período padrão pré-selecionado ("Últimos 30 Dias").
- [ ] **Monitoramento de Logs:** Confirmar ausência de erros 500 no log do PM2 (`pm2 logs sobracorte-api --err`).
