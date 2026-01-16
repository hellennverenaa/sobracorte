# SobraCorte - Sistema de Gerenciamento de Materiais

Sistema completo para gerenciamento de sobras de materiais do Pavilhão do Corte Automático.

## 🚀 Funcionalidades

### Autenticação
- ✅ Registro de novos usuários (operadores)
- ✅ Login com JWT
- ✅ Proteção de rotas
- ✅ Sistema de perfis e permissões

### Gerenciamento de Materiais
- ✅ Listagem de materiais com filtros (tipo, busca)
- ✅ Criação de novos materiais (admin)
- ✅ Edição de materiais existentes (admin)
- ✅ Exclusão de materiais (admin)
- ✅ Alertas de estoque baixo (< 10 unidades)

### Movimentação
- ✅ Registro de ENTRADA (sobra retornando)
- ✅ Registro de SAÍDA (reuso)
- ✅ Atualização automática do estoque
- ✅ Histórico de movimentações

### Dashboard
- ✅ Estatísticas em tempo real
- ✅ Total de materiais
- ✅ Contagem de estoque baixo
- ✅ Movimentações do dia
- ✅ Total de entradas e saídas

### Perfil e Permissões 👤 NOVO!
- ✅ Visualização de perfil do usuário
- ✅ Gerenciamento de usuários (admin)
- ✅ Promover usuários para admin
- ✅ Rebaixar usuários para operador
- ✅ Lista completa de usuários (admin)
- ✅ Interface visual moderna para gerenciamento

## 📊 Estrutura do Banco de Dados

### Tabela: Users (gerenciada pelo Supabase Auth)
- id
- nome
- email
- role (admin, operador)
- created_at

### Tabela: Materials (KV Store)
- id
- codigo_barras
- nome
- tipo (Tecido, Papel, Plástico, Couro, Espuma, Metal, etc.)
- cor
- quantidade_atual
- unidade_medida (kg, m, m², m³, un)
- localizacao_pavilhao
- data_cadastro

### Tabela: Transactions (KV Store)
- id
- type (ENTRADA ou SAIDA)
- quantidade
- data_hora
- material_id
- material_nome
- user_id
- user_nome

## 🎯 Como Usar

### 1. Primeiro Acesso

1. **Registre-se** na tela de cadastro:
   - Nome completo
   - Email
   - Senha (mínimo 6 caracteres)

2. **Popular o Banco de Dados**:
   - Após o login, você verá um card azul no Dashboard
   - Clique em "Popular Banco de Dados"
   - Aguarde a criação de 50 materiais de exemplo
   - Clique em "Recarregar Página" para ver os dados

### 2. Consultar Materiais

- Acesse "Materiais" no menu
- Use a busca para filtrar por nome ou código de barras
- Filtre por tipo de material (Tecido, Papel, Plástico, etc.)
- Clique em "Editar" ou "Excluir" para gerenciar

### 3. Adicionar Novo Material

- Na página "Materiais", clique em "Novo Material"
- Preencha os campos:
  - Código de Barras (obrigatório)
  - Nome (obrigatório)
  - Tipo (obrigatório)
  - Cor
  - Quantidade (obrigatório)
  - Unidade de Medida (obrigatório)
  - Localização no Pavilhão

### 4. Registrar Movimentação

- Acesse "Movimentação" no menu
- Escolha o tipo:
  - **ENTRADA**: Material retornando ao estoque (sobra)
  - **SAÍDA**: Material sendo retirado (reuso)
- Selecione o material
- Informe a quantidade
- Confirme a operação

**IMPORTANTE**: O sistema valida automaticamente se há estoque suficiente para saídas.

### 5. Acompanhar Estatísticas

- O Dashboard mostra em tempo real:
  - Total de materiais cadastrados
  - Materiais com estoque baixo (< 10 unidades)
  - Movimentações realizadas hoje
  - Total de entradas e saídas registradas

### 6. Gerenciar Perfil e Usuários 👤 NOVO!

- Acesse \"Perfil\" no menu
- **Todos os usuários podem:**
  - Visualizar seu próprio perfil
  - Ver nível de acesso atual (Admin ou Operador)
  - Consultar status da conta
  - Ler descrição de permissões do seu nível

- **Apenas Administradores podem:**
  - Ver lista completa de todos os usuários
  - Promover usuários para Administrador
  - Rebaixar usuários para Operador
  - Gerenciar permissões do sistema

Para mais detalhes, consulte **[PROFILE_MANAGEMENT.md](./PROFILE_MANAGEMENT.md)**

## 🎨 Design

- **Tema**: Industrial e moderno
- **Cores**: 
  - Azul: Ações principais
  - Verde: Entradas
  - Vermelho: Saídas e exclusões
  - Amarelo: Alertas
- **Responsivo**: Funciona em desktop, tablet e mobile

## 🔐 Segurança

- Autenticação JWT via Supabase
- Rotas protegidas
- Tokens armazenados localmente
- Validação de estoque em saídas

## 📦 Tipos de Materiais Suportados

1. Tecido
2. Papel
3. Plástico
4. Couro
5. Espuma
6. Isolante
7. Metal
8. Borracha
9. Compósito
10. Acessório

## 📏 Unidades de Medida

- kg (quilogramas)
- m (metros lineares)
- m² (metros quadrados)
- m³ (metros cúbicos)
- un (unidades)

## 🔧 Tecnologias Utilizadas

### Frontend
- React 18
- TypeScript
- React Router
- Tailwind CSS
- Lucide Icons

### Backend
- Supabase Edge Functions
- Hono (Web Framework)
- Supabase Auth (JWT)
- Supabase KV Store (Banco de Dados)

## 📝 Credenciais de Teste

Após registrar sua conta, você pode criar múltiplos usuários:

**Exemplo de Usuário Operador:**
- Nome: João Silva
- Email: joao@pavilhao.com
- Senha: senha123
- Role: operador

**Exemplo de Usuário Admin:**
- Nome: Maria Santos
- Email: maria@pavilhao.com
- Senha: senha123
- Role: admin

## 🚨 Avisos e Validações

- ⚠️ Estoque baixo: Alerta quando quantidade < 10
- ❌ Saída bloqueada: Não permite saída maior que estoque
- ✅ Confirmação: Pede confirmação antes de deletar material

## 📱 Responsividade

O sistema é totalmente responsivo e otimizado para:
- Desktop (1920px+)
- Laptop (1280px+)
- Tablet (768px+)
- Mobile (320px+)

## 🎯 Casos de Uso

### Cenário 1: Sobra de Corte
1. Operador corta tecido e sobram 2.5kg
2. Acessa "Movimentação"
3. Seleciona "ENTRADA"
4. Escolhe o material
5. Informa 2.5kg
6. Confirma

### Cenário 2: Reuso de Material
1. Projeto precisa de sobras
2. Operador consulta materiais disponíveis
3. Encontra o material adequado
4. Acessa "Movimentação"
5. Seleciona "SAÍDA"
6. Informa quantidade
7. Confirma

### Cenário 3: Inventário
1. Gerente acessa Dashboard
2. Visualiza total de materiais
3. Identifica materiais com estoque baixo
4. Acessa lista de materiais
5. Filtra por tipo
6. Atualiza quantidades se necessário

## 👥 Administração

O sistema possui dois níveis de acesso:

- **Operador**: Acesso básico às funcionalidades de consulta, cadastro e movimentação
- **Admin**: Acesso completo, incluindo gerenciamento de usuários e permissões

### Como criar o primeiro Admin

Durante o registro, especifique o role como "admin":

```javascript
{
  "nome": "Admin Master",
  "email": "admin@empresa.com",
  "password": "senha-segura",
  "role": "admin"
}
```

### Como promover um usuário para Admin

Consulte o **[ADMIN_GUIDE.md](./ADMIN_GUIDE.md)** para instruções detalhadas sobre:
- Como listar todos os usuários
- Como alterar o role de um usuário
- Como usar as rotas administrativas
- Exemplos práticos via Console ou Interface

## 📖 Arquivos de Documentação

Este projeto inclui documentação completa:

- **[README.md](./README.md)** - Visão geral e guia de uso
- **[ADMIN_GUIDE.md](./ADMIN_GUIDE.md)** - Guia de administração e gerenciamento de usuários
- **[PROFILE_MANAGEMENT.md](./PROFILE_MANAGEMENT.md)** - Sistema de perfil e permissões de usuários
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Documentação completa da API REST
- **[QUICK_START.md](./QUICK_START.md)** - Guia rápido de início
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Resolução de problemas comuns
- **[VUE_CONVERSION_GUIDE.md](./VUE_CONVERSION_GUIDE.md)** - Guia de conversão para Vue.js 3
- **[EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)** - Resumo executivo do projeto
- **[CHANGELOG.md](./CHANGELOG.md)** - Histórico de alterações

---

**Desenvolvido para o Pavilhão do Corte Automático**