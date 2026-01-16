# 👤 Sistema de Perfil e Gerenciamento de Permissões

## 📋 Visão Geral

O **SobraCorte** agora possui um sistema completo de gerenciamento de perfil de usuários com controle de permissões baseado em níveis de acesso. Administradores podem promover ou rebaixar outros usuários através de uma interface visual intuitiva.

---

## 🎯 Funcionalidades Implementadas

### ✅ Para Todos os Usuários

1. **Visualização de Perfil**
   - Nome completo
   - Email cadastrado
   - Nível de acesso atual (Admin ou Operador)
   - Status da conta

2. **Informações sobre Permissões**
   - Descrição detalhada do nível de acesso atual
   - Lista de funcionalidades disponíveis para o seu nível

### ✅ Para Administradores

1. **Painel de Gerenciamento de Usuários**
   - Listagem de todos os usuários do sistema
   - Visualização de nome, email e nível atual
   - Identificação visual de administradores (ícone de coroa 👑)
   - Destaque visual do próprio perfil

2. **Gerenciamento de Permissões**
   - **Promover para Admin:** Concede privilégios administrativos
   - **Rebaixar para Operador:** Remove privilégios administrativos
   - Confirmação antes de alteração
   - Feedback visual durante atualização
   - Notificações de sucesso/erro

3. **Privilégios de Administrador**
   - Gerenciar todos os materiais e movimentações
   - Promover ou rebaixar usuários
   - Visualizar e modificar todos os dados do sistema
   - Acesso total a relatórios e estatísticas

---

## 🔐 Níveis de Acesso

### 👤 Operador (Padrão)

**Permissões:**
- ✅ Visualizar materiais cadastrados
- ✅ Registrar entradas e saídas
- ✅ Consultar dashboard e estatísticas
- ✅ Ver próprio perfil

**Restrições:**
- ❌ Não pode cadastrar novos materiais
- ❌ Não pode deletar materiais
- ❌ Não pode gerenciar usuários
- ❌ Não pode alterar permissões

### 👑 Administrador

**Permissões:**
- ✅ Todas as permissões de Operador
- ✅ Cadastrar novos materiais
- ✅ Editar materiais existentes
- ✅ Deletar materiais
- ✅ Visualizar lista completa de usuários
- ✅ Promover usuários para Admin
- ✅ Rebaixar usuários para Operador
- ✅ Acesso total ao sistema

---

## 🚀 Como Usar

### Acessar a Página de Perfil

1. Faça login no sistema
2. Clique na aba **"Perfil"** no menu de navegação
3. Você verá seu perfil e informações de acesso

### Gerenciar Usuários (Somente Admin)

1. Acesse a página de **Perfil**
2. Role até a seção **"Gerenciamento de Usuários"**
3. Veja a lista completa de usuários do sistema

#### Promover um Usuário para Admin

1. Localize o usuário na tabela
2. Clique no botão **"Promover Admin"** (botão amarelo com ícone de coroa)
3. Confirme a ação no diálogo
4. Aguarde a confirmação de sucesso

#### Rebaixar um Admin para Operador

1. Localize o usuário na tabela
2. Clique no botão **"Rebaixar Operador"** (botão cinza)
3. Confirme a ação no diálogo
4. Aguarde a confirmação de sucesso

---

## 🔧 Aspectos Técnicos

### Arquitetura

#### Frontend (`/pages/Profile.tsx`)

```typescript
- Componente React com gerenciamento de estado
- Autenticação via AuthContext
- Comunicação com API do servidor
- Interface responsiva e moderna
- Feedback visual em tempo real
```

#### Backend (`/supabase/functions/server/index.tsx`)

**Endpoints:**

1. **GET** `/make-server-ed830bfb/admin/users`
   - Lista todos os usuários (somente admin)
   - Retorna: array de usuários com id, nome, email, role
   - Autenticação: X-Access-Token ou Authorization Bearer

2. **PUT** `/make-server-ed830bfb/admin/users/:userId/role`
   - Atualiza role de um usuário (somente admin)
   - Body: `{ "role": "admin" | "operador" }`
   - Atualiza: Supabase Auth metadata + KV store
   - Autenticação: X-Access-Token ou Authorization Bearer

### Segurança

1. **Verificação de Autenticação**
   - Todo acesso valida token JWT via Supabase Auth
   - Tokens são verificados antes de qualquer operação

2. **Controle de Autorização**
   - Verificação de role antes de operações administrativas
   - Apenas admins podem acessar endpoints de gerenciamento
   - Proteção contra escalação de privilégios

3. **Validação de Dados**
   - Validação de roles (somente "admin" ou "operador")
   - Verificação de existência do usuário
   - Feedback claro de erros

---

## 📊 Fluxo de Dados

```
┌─────────────┐
│   USUÁRIO   │
└──────┬──────┘
       │
       │ (Clica em "Promover Admin")
       ▼
┌─────────────────┐
│  Profile.tsx    │
│  - updateUser   │
│    Role()       │
└────────┬────────┘
         │
         │ PUT /admin/users/:userId/role
         │ { role: "admin" }
         │ Headers: X-Access-Token
         ▼
┌─────────────────────────┐
│  Supabase Edge Function │
│  /make-server-ed830bfb  │
└───────┬─────────────────┘
        │
        │ 1. Verificar token
        │ 2. Verificar se user é admin
        │ 3. Atualizar role
        ▼
┌──────────────────┐
│  Supabase Auth   │
│  + KV Store      │
└──────────────────┘
```

---

## 🎨 Interface Visual

### Cards de Perfil

- **Card do Usuário Atual**
  - Gradiente azul no cabeçalho
  - Ícone de usuário grande
  - Nome e email destacados
  - Badge de nível de acesso
  - Informações de privilégios (se admin)

### Tabela de Usuários (Admin)

- **Colunas:**
  - Usuário (nome + ícone de role)
  - Email
  - Nível Atual (badge colorido)
  - Ações (botões de gerenciamento)

- **Código de Cores:**
  - 🟡 Amarelo: Administrador
  - ⚪ Cinza: Operador
  - 🔵 Azul: Próprio perfil (destaque)

- **Estados Visuais:**
  - Hover: Linha fica cinza claro
  - Atualização: Botão mostra "Atualizando..." e fica desabilitado
  - Próprio perfil: Não mostra botões de ação

---

## ⚙️ Configuração e Manutenção

### Criar Primeiro Admin

Se você não tem nenhum admin no sistema ainda, use um dos métodos do **ADMIN_GUIDE.md**:

**Método 1: Via Console do Navegador**
```javascript
// Use o script helper disponível em /admin-console-helper.js
```

**Método 2: Via Supabase Dashboard**
```sql
-- Execute no SQL Editor do Supabase
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'seu-email@exemplo.com';
```

### Logs e Debug

O sistema possui logging extensivo:

```javascript
console.log('=== UPDATE USER ROLE ENDPOINT CALLED ===');
console.log('Admin attempting to change user role...');
console.log('✅ User role updated successfully');
```

Verifique o console do navegador e os logs do Supabase Edge Functions para debug.

---

## 🐛 Solução de Problemas

### Erro 401 - Não Autorizado

**Causa:** Token inválido ou expirado

**Solução:**
1. Faça logout e login novamente
2. Verifique se o token está sendo enviado corretamente
3. Confirme que você está autenticado

### Erro 403 - Acesso Negado

**Causa:** Usuário não é admin

**Solução:**
1. Confirme que sua conta tem role "admin"
2. Peça a um admin existente para promovê-lo
3. Use os métodos manuais para criar o primeiro admin

### Botão de Atualização Não Funciona

**Causa:** Possível erro de rede ou validação

**Solução:**
1. Abra o console do navegador (F12)
2. Veja a mensagem de erro específica
3. Verifique se o backend está respondendo
4. Confirme que você tem permissão de admin

### Lista de Usuários Vazia

**Causa:** Nenhum usuário cadastrado ou erro ao carregar

**Solução:**
1. Cadastre usuários através da página de registro
2. Verifique o console para erros de API
3. Confirme que o endpoint `/admin/users` está funcionando

---

## 📝 Exemplo de Uso Completo

### Cenário: Novo Sistema

1. **Cadastro Inicial**
   ```
   - Primeiro usuário se registra
   - Por padrão, recebe role "operador"
   ```

2. **Promover Primeiro Admin**
   ```
   - Use script do console ou SQL para tornar admin
   - Ver ADMIN_GUIDE.md para instruções
   ```

3. **Admin Promove Outros Usuários**
   ```
   - Admin faz login
   - Vai para aba "Perfil"
   - Vê lista de usuários
   - Clica em "Promover Admin" para outros usuários
   ```

4. **Gerenciamento Contínuo**
   ```
   - Admins podem promover/rebaixar conforme necessário
   - Operadores veem apenas seu próprio perfil
   - Sistema mantém controle de acesso sempre atualizado
   ```

---

## 🔄 Integração com Outras Partes do Sistema

### Dashboard
- Estatísticas acessíveis a todos
- Admins veem dados completos

### Materiais
- Operadores: Visualização apenas
- Admins: Criar, editar, deletar

### Movimentação
- Todos: Registrar entradas/saídas
- Histórico completo visível

### Perfil
- Todos: Ver próprio perfil
- Admins: Gerenciar todos os usuários

---

## 🚀 Melhorias Futuras Sugeridas

- [ ] Histórico de mudanças de permissões
- [ ] Logs de auditoria de ações administrativas
- [ ] Múltiplos níveis de acesso (supervisor, gerente, etc)
- [ ] Desativação temporária de usuários
- [ ] Perfil com foto de usuário
- [ ] Email de notificação ao mudar permissão
- [ ] Filtros e busca na lista de usuários
- [ ] Exportação de lista de usuários

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Consulte este guia e o **ADMIN_GUIDE.md**
2. Verifique os logs no console do navegador
3. Revise a documentação da API em **API_DOCUMENTATION.md**
4. Consulte o guia de troubleshooting em **TROUBLESHOOTING.md**

---

**✅ Sistema de Perfil e Permissões - SobraCorte v2.0**

*Desenvolvido com React, TypeScript, Supabase e muito ❤️*
