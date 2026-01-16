# Guia de Administração - SobraCorte

## 📋 Visão Geral

Este guia explica como gerenciar usuários e permissões no sistema SobraCorte, incluindo como alterar o nível de acesso de usuários.

## 🔐 Níveis de Acesso

O sistema possui dois níveis de acesso:

- **`operador`** - Usuário padrão com acesso básico às funcionalidades
- **`admin`** - Administrador com acesso completo, incluindo gerenciamento de usuários

## 🛠️ Rotas Administrativas

### 1. Listar Todos os Usuários

**Endpoint:** `GET /admin/users`

**Requer:** Token de admin

**Exemplo de uso:**
```javascript
const response = await fetch(`${API_URL}/admin/users`, {
  method: 'GET',
  headers: {
    'X-Access-Token': adminToken // ou 'Authorization': `Bearer ${adminToken}`
  }
});

const data = await response.json();
console.log(data.users);
```

**Resposta de sucesso:**
```json
{
  "users": [
    {
      "id": "uuid-do-usuario",
      "nome": "João Silva",
      "email": "joao@example.com",
      "role": "operador",
      "created_at": "2026-01-16T10:30:00.000Z"
    },
    {
      "id": "uuid-do-admin",
      "nome": "Maria Admin",
      "email": "maria@example.com",
      "role": "admin",
      "created_at": "2026-01-15T08:00:00.000Z"
    }
  ]
}
```

---

### 2. Alterar Role de um Usuário

**Endpoint:** `PUT /admin/users/:userId/role`

**Requer:** Token de admin

**Parâmetros:**
- `:userId` - ID do usuário que terá o role alterado
- `role` - Novo role (`operador` ou `admin`)

**Exemplo de uso:**
```javascript
const userId = 'uuid-do-usuario-para-promover';

const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Access-Token': adminToken
  },
  body: JSON.stringify({ role: 'admin' })
});

const data = await response.json();
console.log(data.message); // "Role atualizado com sucesso"
```

**Resposta de sucesso:**
```json
{
  "message": "Role atualizado com sucesso",
  "user": {
    "id": "uuid-do-usuario",
    "role": "admin",
    "nome": "João Silva"
  }
}
```

---

## 📝 Como Mudar um Usuário de Operador para Admin

### Opção 1: Via Console do Navegador (Recomendado)

#### Método A: Usando o Admin Helper Script (Mais Fácil) ⭐

1. **Abra o arquivo `/admin-console-helper.js`** do projeto
2. **Copie todo o conteúdo do arquivo**
3. **Abra o Console do navegador** (F12 → Console)
4. **Cole o script no console e pressione Enter**
5. **O helper será carregado automaticamente** e mostrará suas informações

Agora você pode usar comandos simples:

```javascript
// Ver funções disponíveis
ajuda()

// Ver seus dados
meusDados()

// Listar todos os usuários (veja nome, email, role, ID)
listarUsuarios()

// Promover usuário para admin usando o email
promoverPorEmail("joao@empresa.com")

// Rebaixar usuário para operador usando o email
rebaixarPorEmail("maria@empresa.com")
```

**Exemplo completo:**
```javascript
// 1. Ver quem você é
meusDados()

// 2. Ver todos os usuários
listarUsuarios()

// 3. Promover João
promoverPorEmail("joao@empresa.com")

// 4. Confirmar
listarUsuarios()
```

---

#### Método B: Comandos Manuais (Console)

1. **Faça login com um usuário admin**
2. **Abra o Console do navegador** (F12 → Console)
3. **Liste todos os usuários para encontrar o ID:**

```javascript
// Obter o token do localStorage
const token = localStorage.getItem('sobracorte_token');

// Listar todos os usuários
fetch('https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/admin/users', {
  headers: { 'X-Access-Token': token }
})
.then(r => r.json())
.then(data => {
  console.table(data.users);
});
```

4. **Copie o ID do usuário que deseja promover**

5. **Execute o comando para alterar o role:**

```javascript
const userId = 'COLE_O_ID_AQUI'; // substitua pelo ID do usuário

fetch(`https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/admin/users/${userId}/role`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Access-Token': token
  },
  body: JSON.stringify({ role: 'admin' })
})
.then(r => r.json())
.then(data => {
  console.log('✅', data.message);
  console.log('Usuário atualizado:', data.user);
});
```

---

### Opção 2: Via Interface (Criar Tela de Administração)

Você pode criar uma página administrativa na aplicação React:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function AdminUsersPage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState([]);
  const API_URL = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb';

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/users`, {
        headers: { 'X-Access-Token': token }
      });
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const changeUserRole = async (userId, newRole) => {
    try {
      const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': token
        },
        body: JSON.stringify({ role: newRole })
      });
      
      const data = await response.json();
      alert(data.message);
      loadUsers(); // Recarregar lista
    } catch (error) {
      console.error('Erro ao alterar role:', error);
      alert('Erro ao alterar permissão do usuário');
    }
  };

  // Verificar se o usuário atual é admin
  if (user?.role !== 'admin') {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Gerenciar Usuários</h1>
      
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Nome</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Role</th>
            <th className="p-2 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.nome}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">
                <span className={`px-2 py-1 rounded ${
                  u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {u.role}
                </span>
              </td>
              <td className="p-2">
                {u.role === 'operador' ? (
                  <button 
                    onClick={() => changeUserRole(u.id, 'admin')}
                    className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                  >
                    Promover para Admin
                  </button>
                ) : (
                  <button 
                    onClick={() => changeUserRole(u.id, 'operador')}
                    className="bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600"
                  >
                    Rebaixar para Operador
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 🎯 Exemplo Prático Completo

### Cenário: Promover "joao@empresa.com" para admin

```javascript
// 1. Login como admin
const loginResponse = await fetch('https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/auth/login', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  },
  body: JSON.stringify({
    email: 'admin@empresa.com',
    password: 'senha-admin'
  })
});

const { access_token } = await loginResponse.json();

// 2. Listar usuários e encontrar o ID
const usersResponse = await fetch('https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/admin/users', {
  headers: { 'X-Access-Token': access_token }
});

const { users } = await usersResponse.json();
const joao = users.find(u => u.email === 'joao@empresa.com');

console.log('ID do João:', joao.id);

// 3. Promover para admin
const updateResponse = await fetch(`https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/admin/users/${joao.id}/role`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Access-Token': access_token
  },
  body: JSON.stringify({ role: 'admin' })
});

const result = await updateResponse.json();
console.log(result); // { message: "Role atualizado com sucesso", ... }
```

---

## ⚠️ Importante

### Segurança
- **Apenas usuários com role `admin` podem acessar estas rotas**
- As rotas verificam automaticamente se o usuário solicitante é admin
- Não é possível se auto-promover; precisa de outro admin

### Primeiro Admin
- **O primeiro admin precisa ser criado manualmente** durante o registro
- Use a rota `/auth/register` com o parâmetro `role: 'admin'`:

```javascript
await fetch('https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  },
  body: JSON.stringify({
    nome: 'Administrador Master',
    email: 'admin@empresa.com',
    password: 'senha-segura-123',
    role: 'admin' // <-- Importante!
  })
});
```

### Persistência
- As alterações são salvas em **dois lugares**:
  1. **Supabase Auth** (`user_metadata.role`)
  2. **KV Store** (tabela chave-valor)
- Isso garante consistência mesmo após logout/login

---

## 🔄 Fluxo de Autenticação

```
1. Usuário faz login → recebe access_token
2. Sistema verifica o role no user_metadata
3. Se role = 'admin' → acesso às rotas administrativas
4. Se role = 'operador' → apenas funcionalidades básicas
```

---

## 📞 Suporte

Para mais informações, consulte:
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Documentação completa da API
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Resolução de problemas
- [README.md](./README.md) - Documentação geral do projeto