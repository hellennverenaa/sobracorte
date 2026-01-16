# API Documentation - SobraCorte

API RESTful completa para o sistema de gerenciamento de materiais.

**Base URL**: `https://{projectId}.supabase.co/functions/v1/make-server-ed830bfb`

---

## 🔐 Autenticação

Todas as rotas protegidas requerem o header:
```
Authorization: Bearer {access_token}
```

Rotas públicas usam:
```
Authorization: Bearer {publicAnonKey}
```

---

## 📍 Endpoints

### 1. Health Check

**GET** `/health`

Verifica se o servidor está online.

**Response:**
```json
{
  "status": "ok"
}
```

---

### 2. Autenticação

#### 2.1 Registrar Usuário

**POST** `/auth/register`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {publicAnonKey}
```

**Body:**
```json
{
  "nome": "João Silva",
  "email": "joao@example.com",
  "password": "senha123",
  "role": "operador" // opcional, padrão: "operador"
}
```

**Response (201):**
```json
{
  "message": "Usuário cadastrado com sucesso",
  "user": {
    "id": "uuid",
    "nome": "João Silva",
    "email": "joao@example.com",
    "role": "operador"
  }
}
```

**Errors:**
- `400`: Campos obrigatórios faltando
- `400`: Email já cadastrado

---

#### 2.2 Login

**POST** `/auth/login`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {publicAnonKey}
```

**Body:**
```json
{
  "email": "joao@example.com",
  "password": "senha123"
}
```

**Response (200):**
```json
{
  "message": "Login realizado com sucesso",
  "access_token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "nome": "João Silva",
    "email": "joao@example.com",
    "role": "operador"
  }
}
```

**Errors:**
- `400`: Campos obrigatórios faltando
- `401`: Credenciais inválidas

---

#### 2.3 Obter Usuário Atual

**GET** `/auth/me`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "nome": "João Silva",
    "email": "joao@example.com",
    "role": "operador"
  }
}
```

**Errors:**
- `401`: Token não fornecido
- `401`: Token inválido

---

### 3. Materiais

#### 3.1 Listar Materiais

**GET** `/materials`

**Headers:**
```
Authorization: Bearer {publicAnonKey}
```

**Query Parameters:**
- `tipo` (opcional): Filtrar por tipo (Tecido, Papel, Plástico, etc.)
- `cor` (opcional): Filtrar por cor
- `search` (opcional): Buscar por nome ou código de barras

**Exemplo:**
```
GET /materials?tipo=Tecido&search=jeans
```

**Response (200):**
```json
{
  "materials": [
    {
      "id": "uuid",
      "codigo_barras": "TEC001",
      "nome": "Retalho Jeans Índigo",
      "tipo": "Tecido",
      "cor": "Azul",
      "quantidade_atual": 15.5,
      "unidade_medida": "kg",
      "localizacao_pavilhao": "A1",
      "data_cadastro": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

#### 3.2 Obter Material por ID

**GET** `/materials/:id`

**Headers:**
```
Authorization: Bearer {publicAnonKey}
```

**Response (200):**
```json
{
  "material": {
    "id": "uuid",
    "codigo_barras": "TEC001",
    "nome": "Retalho Jeans Índigo",
    "tipo": "Tecido",
    "cor": "Azul",
    "quantidade_atual": 15.5,
    "unidade_medida": "kg",
    "localizacao_pavilhao": "A1",
    "data_cadastro": "2025-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `404`: Material não encontrado

---

#### 3.3 Criar Material

**POST** `/materials`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Body:**
```json
{
  "codigo_barras": "TEC050",
  "nome": "Novo Material",
  "tipo": "Tecido",
  "cor": "Verde",
  "quantidade_atual": 10.5,
  "unidade_medida": "kg",
  "localizacao_pavilhao": "B2"
}
```

**Campos Obrigatórios:**
- `codigo_barras`
- `nome`
- `tipo`
- `quantidade_atual`
- `unidade_medida`

**Campos Opcionais:**
- `cor`
- `localizacao_pavilhao`

**Response (201):**
```json
{
  "message": "Material criado com sucesso",
  "material": {
    "id": "uuid",
    "codigo_barras": "TEC050",
    "nome": "Novo Material",
    "tipo": "Tecido",
    "cor": "Verde",
    "quantidade_atual": 10.5,
    "unidade_medida": "kg",
    "localizacao_pavilhao": "B2",
    "data_cadastro": "2025-01-15T12:00:00.000Z"
  }
}
```

**Errors:**
- `400`: Campos obrigatórios faltando
- `401`: Não autorizado

---

#### 3.4 Atualizar Material

**PUT** `/materials/:id`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Body:**
```json
{
  "nome": "Nome Atualizado",
  "quantidade_atual": 20.0,
  "cor": "Azul Claro"
}
```

**Nota:** Apenas os campos enviados serão atualizados.

**Response (200):**
```json
{
  "message": "Material atualizado com sucesso",
  "material": {
    "id": "uuid",
    "codigo_barras": "TEC050",
    "nome": "Nome Atualizado",
    "tipo": "Tecido",
    "cor": "Azul Claro",
    "quantidade_atual": 20.0,
    "unidade_medida": "kg",
    "localizacao_pavilhao": "B2",
    "data_cadastro": "2025-01-15T12:00:00.000Z"
  }
}
```

**Errors:**
- `401`: Não autorizado
- `404`: Material não encontrado

---

#### 3.5 Deletar Material

**DELETE** `/materials/:id`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200):**
```json
{
  "message": "Material deletado com sucesso"
}
```

**Errors:**
- `401`: Não autorizado
- `404`: Material não encontrado

---

### 4. Transações (Movimentações)

#### 4.1 Registrar Movimentação

**POST** `/transactions`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Body:**
```json
{
  "material_id": "uuid",
  "type": "ENTRADA",
  "quantidade": 5.5
}
```

**Campos:**
- `material_id`: ID do material
- `type`: "ENTRADA" ou "SAIDA"
- `quantidade`: Quantidade (número positivo)

**Regras:**
- Para ENTRADA: adiciona à quantidade atual
- Para SAIDA: subtrai da quantidade atual
- Não permite saída maior que o estoque disponível

**Response (201):**
```json
{
  "message": "Movimentação registrada com sucesso",
  "transaction": {
    "id": "uuid",
    "type": "ENTRADA",
    "quantidade": 5.5,
    "data_hora": "2025-01-15T14:30:00.000Z",
    "material_id": "uuid",
    "material_nome": "Retalho Jeans Índigo",
    "user_id": "uuid",
    "user_nome": "João Silva"
  },
  "material": {
    "id": "uuid",
    "codigo_barras": "TEC001",
    "nome": "Retalho Jeans Índigo",
    "tipo": "Tecido",
    "cor": "Azul",
    "quantidade_atual": 21.0,
    "unidade_medida": "kg",
    "localizacao_pavilhao": "A1",
    "data_cadastro": "2025-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `400`: Campos obrigatórios faltando
- `400`: Type inválido (deve ser ENTRADA ou SAIDA)
- `400`: Quantidade deve ser maior que zero
- `400`: Estoque insuficiente para saída
- `401`: Não autorizado
- `404`: Material não encontrado

---

#### 4.2 Listar Transações

**GET** `/transactions`

**Headers:**
```
Authorization: Bearer {publicAnonKey}
```

**Query Parameters:**
- `limit` (opcional): Número máximo de resultados (padrão: 100)
- `material_id` (opcional): Filtrar por material específico

**Exemplo:**
```
GET /transactions?limit=20&material_id=uuid
```

**Response (200):**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "ENTRADA",
      "quantidade": 5.5,
      "data_hora": "2025-01-15T14:30:00.000Z",
      "material_id": "uuid",
      "material_nome": "Retalho Jeans Índigo",
      "user_id": "uuid",
      "user_nome": "João Silva"
    }
  ]
}
```

**Nota:** Resultados ordenados por data (mais recentes primeiro).

---

### 5. Estatísticas

#### 5.1 Obter Estatísticas do Dashboard

**GET** `/stats`

**Headers:**
```
Authorization: Bearer {publicAnonKey}
```

**Response (200):**
```json
{
  "total_materials": 50,
  "low_stock_count": 5,
  "today_transactions": 12,
  "total_entradas": 150,
  "total_saidas": 87
}
```

**Campos:**
- `total_materials`: Total de materiais cadastrados
- `low_stock_count`: Materiais com estoque < 10
- `today_transactions`: Movimentações realizadas hoje
- `total_entradas`: Total histórico de entradas
- `total_saidas`: Total histórico de saídas

---

### 6. Seed (Popular Banco de Dados)

#### 6.1 Popular com Dados de Exemplo

**POST** `/seed`

**Headers:**
```
Authorization: Bearer {publicAnonKey}
```

**Response (201):**
```json
{
  "message": "50 materiais criados com sucesso",
  "materials": [...]
}
```

---

### 7. Administração

#### 7.1 Listar Todos os Usuários

**GET** `/admin/users`

**Requer:** Token de usuário com role `admin`

**Headers:**
```
X-Access-Token: {access_token}
```
ou
```
Authorization: Bearer {access_token}
```

**Response (200):**
```json
{
  "users": [
    {
      "id": "uuid",
      "nome": "João Silva",
      "email": "joao@example.com",
      "role": "operador",
      "created_at": "2026-01-16T10:30:00.000Z"
    },
    {
      "id": "uuid2",
      "nome": "Maria Admin",
      "email": "maria@example.com",
      "role": "admin",
      "created_at": "2026-01-15T08:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `401`: Token não fornecido
- `401`: Não autorizado (token inválido)
- `403`: Apenas administradores podem listar usuários

---

#### 7.2 Alterar Role de Usuário

**PUT** `/admin/users/:userId/role`

**Requer:** Token de usuário com role `admin`

**Headers:**
```
Content-Type: application/json
X-Access-Token: {access_token}
```
ou
```
Authorization: Bearer {access_token}
```

**URL Parameters:**
- `userId`: ID do usuário que terá o role alterado

**Body:**
```json
{
  "role": "admin"  // "admin" ou "operador"
}
```

**Response (200):**
```json
{
  "message": "Role atualizado com sucesso",
  "user": {
    "id": "uuid",
    "role": "admin",
    "nome": "João Silva"
  }
}
```

**Errors:**
- `400`: Role inválido (deve ser 'operador' ou 'admin')
- `401`: Token não fornecido
- `401`: Não autorizado (token inválido)
- `403`: Apenas administradores podem alterar roles

**Exemplo de uso:**
```javascript
// Promover usuário para admin
const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Access-Token': adminToken
  },
  body: JSON.stringify({ role: 'admin' })
});
```

---

## 📊 Tipos de Materiais

1. **Tecido**
2. **Papel**
3. **Plástico**
4. **Couro**
5. **Espuma**
6. **Isolante**
7. **Metal**
8. **Borracha**
9. **Compósito**
10. **Acessório**

---

## 📏 Unidades de Medida

1. **kg** - Quilogramas
2. **m** - Metros lineares
3. **m²** - Metros quadrados
4. **m³** - Metros cúbicos
5. **un** - Unidades

---

## 🔄 Fluxo de Autenticação

1. Usuário faz POST em `/auth/register` (primeira vez)
2. Sistema cria usuário no Supabase Auth
3. Sistema armazena dados complementares no KV Store
4. Usuário faz POST em `/auth/login`
5. Sistema retorna `access_token` (JWT)
6. Frontend armazena token no localStorage
7. Todas as requisições subsequentes incluem token no header
8. Token é validado via `supabase.auth.getUser()`

---

## 🔒 Segurança

### Rotas Públicas (publicAnonKey)
- GET `/health`
- POST `/auth/register`
- POST `/auth/login`
- GET `/materials`
- GET `/materials/:id`
- GET `/transactions`
- GET `/stats`
- POST `/seed`

### Rotas Protegidas (access_token)
- GET `/auth/me`
- POST `/materials`
- PUT `/materials/:id`
- DELETE `/materials/:id`
- POST `/transactions`
- GET `/admin/users`
- PUT `/admin/users/:userId/role`

---

## ⚠️ Códigos de Erro HTTP

| Código | Significado |
|--------|-------------|
| 200 | OK - Sucesso |
| 201 | Created - Recurso criado |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado |
| 404 | Not Found - Recurso não encontrado |
| 500 | Internal Server Error - Erro no servidor |

---

## 📝 Exemplos de Uso com cURL

### Registrar Usuário
```bash
curl -X POST https://PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ANON_KEY" \
  -d '{
    "nome": "João Silva",
    "email": "joao@example.com",
    "password": "senha123"
  }'
```

### Login
```bash
curl -X POST https://PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/auth/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ANON_KEY" \
  -d '{
    "email": "joao@example.com",
    "password": "senha123"
  }'
```

### Criar Material
```bash
curl -X POST https://PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/materials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "codigo_barras": "TEC050",
    "nome": "Novo Material",
    "tipo": "Tecido",
    "cor": "Verde",
    "quantidade_atual": 10.5,
    "unidade_medida": "kg",
    "localizacao_pavilhao": "B2"
  }'
```

### Registrar Movimentação
```bash
curl -X POST https://PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "material_id": "MATERIAL_UUID",
    "type": "ENTRADA",
    "quantidade": 5.5
  }'
```

### Listar Materiais com Filtros
```bash
curl -X GET "https://PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/materials?tipo=Tecido&search=jeans" \
  -H "Authorization: Bearer ANON_KEY"
```

---

## 🧪 Testando a API

Você pode usar ferramentas como:
- **Postman**: Importe a coleção de endpoints
- **Insomnia**: Configure os endpoints manualmente
- **cURL**: Use os exemplos acima
- **Frontend**: A aplicação React já consome toda a API

---

**Desenvolvido para o Sistema SobraCorte**