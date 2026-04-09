# 🛡️ Módulo de Segurança, Autenticação e RBAC - SobraCorte

Este documento detalha a implementação da arquitetura de segurança, controle de acesso baseado em funções (RBAC) e persistência de usuários do sistema **SobraCorte**. 

O objetivo desta feature foi substituir o mock estático de usuários por um sistema de autenticação real integrado à API da DASS, garantindo blindagem tanto no Frontend (UI) quanto no Backend (API).

---

## 👥 Matriz de Acesso (Níveis e Permissões)

O sistema adota o princípio de **Default Deny** (Negação Padrão). Qualquer usuário não mapeado ou sem privilégios explícitos cai na categoria `leitor`.

| Nível de Acesso | Cargos RH Equivalentes | Permissões no Sistema |
| :--- | :--- | :--- |
| **Admin** | Master (Hellen, Paulo, Hendrius, Midian, Cleonice) | Acesso absoluto. Pode alterar níveis de acesso manuais de outros usuários na aba Gestão. |
| **Líder** | Gerente, Coordenador, Analista, Líder | Cadastrar, editar e excluir materiais. Movimentar estoque. Baixar relatórios. |
| **Movimentador**| Assistente, Auxiliar | **Apenas** realizar entrada e saída (movimentações) de materiais no estoque. |
| **Leitor** | Multi Operador, Armazenista, etc. | **Apenas** visualizar listagens e relatórios em tela. Ações de edição bloqueadas. |

---

## 🛠️ O que foi desenvolvido?

### 1. Banco de Dados (PostgreSQL + Prisma)
* **Modelagem `User`:** Criação da tabela de persistência de usuários no `schema.prisma`.
* **Alta Performance:** Implementação de índices B-Tree (`@@index`) nas colunas `usuario` e `email` para garantir buscas em tempo real (< 1ms) durante a validação de rotas.
* **Sobrescrita Segura:** A tabela permite que a regra padrão do RH da fábrica seja sobrescrita por uma decisão manual de um **Admin** através da interface, gravando a alteração permanentemente.

### 2. Backend (Node.js + Express)
* **Upsert Inteligente (`AuthController`):** A API agora intercepta o Token gerado pelo servidor da DASS, descriptografa o payload e realiza um *Upsert* (Insert or Update) atômico no PostgreSQL. Novos funcionários logados são automaticamente registrados na base do SobraCorte.
* **Cérebro de Cargos:** Algoritmo que lê a string da função (`funcao`) do funcionário vinda do RH e atribui o nível de acesso correto (RBAC) no momento do primeiro cadastro.
* **Middlewares de Segurança (`authMiddleware`):**
  * `checkAuth`: Verifica a validade do Token, busca o usuário no banco de dados local e injeta a sessão na requisição.
  * `requireRole`: Intercepta requisições não autorizadas (ex: requisições feitas via Postman ou injeção de script) e bloqueia com erro `403 Forbidden` caso o nível do usuário não permita a ação.

### 3. Frontend (Vue.js + Pinia)
* **Store de Autenticação (`auth.js`):** Armazena o estado global do usuário e fornece a função `can(action)` para validação de privilégios.
* **Blindagem de UI (`Materials.vue`):** Ocultação reativa de botões vitais (Novo Material, Editar, Excluir, Importar CSV) utilizando diretivas `v-if="authStore.can('...')"` baseadas no perfil logado.

---

## 🚀 Fluxo de Autenticação

1. O usuário digita as credenciais na tela de Login.
2. O Backend envia a requisição para a API de Autenticação da DASS.
3. Se aprovado, a API da DASS devolve um Token JWT com os dados do RH.
4. O Backend lê o Token, analisa o cargo, e salva/atualiza o usuário na tabela `User` local (mantendo os privilégios editados por Admins).
5. O Backend devolve o usuário formatado para o Frontend.
6. O Frontend ajusta a interface (mostra/esconde botões) com base na propriedade `role`.

---

## ⚙️ Comandos de Manutenção (DevOps)

Caso seja necessário recriar o ambiente ou realizar novas migrações, a ordem correta para deploy em produção (Servidor DASS) sem perda de dados é:

```bash
# 1. Puxar alterações do repositório
git pull origin main

# 2. Aplicar alterações no banco de dados cirurgicamente
npx prisma migrate deploy

# 3. Atualizar motor de tipagem do Node.js
npx prisma generate

# 4. Reiniciar serviço da API
pm2 restart sobracorte-api