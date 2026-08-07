# Guia de Integração - `dass_auth_service` (Unix Multi-Unidade)

Este documento foi preparado para a equipe de **T.I. / Infraestrutura** para orientar a vinculação e automação do backend com o novo modelo **Multi-Unidade** do sistema **Sobras DASS**.

---

## Onde estão as alterações no Frontend?

Todas as modificações de autenticação e seleção de unidade estão concentradas nos seguintes arquivos:

1. **`frontend/src/stores/auth.js`**
   - Contém a **Store Pinia** responsável pelas chamadas HTTP de autenticação e busca dinâmica de unidades via **Axios**.
   - Possui blocos de comentário em destaque facilitando a localização da integração backend.

2. **`frontend/src/pages/Login.vue`**
   - Tela de Login refatorada para exibir o label **"Usuário Unix"**, o dropdown dinâmico de **Unidades DASS** e os redirecionamentos para o **Portal Unix** (`http://10.100.1.43/unix/`).

3. **`frontend/src/services/httpClient.ts`** e **`frontend/src/utils/ip.js`**
   - Configuração da instância Axios `authApi` onde fica definida a `baseURL` para o servidor de Ivoti.

---

## 🛠️ Contrato dos Endpoints Esperados (`dass_auth_service`)

### 1. `GET /auth/unidades` (ou `/api/unidades-ativas`)

- **Objetivo**: Retornar dinamicamente as unidades ativas e configuradas no banco Unix para popular o dropdown no login.
- **Método**: `GET`
- **Exemplo de Resposta HTTP 200 OK**:

```json
[
  { "code": "VDC", "name": "Vitória da Conquista" },
  { "code": "STJ", "name": "Santo Antônio de Jesus" },
  { "code": "SEST", "name": "Santo Estêvão" },
  { "code": "ITB", "name": "Itaberaba" }
]
```

_(Nota: O frontend possui suporte automático para mapeamento de propriedades como `code`/`sigla`/`id` e `name`/`nome`/`descricao`)_.

---

### 2. `POST /auth/login`

- **Objetivo**: Autenticar o usuário Unix na unidade selecionada e prover o token JWT para acesso.
- **Método**: `POST`
- **Payload Enviado pelo Frontend**:

```json
{
  "usuario": "nome.sobrenome",
  "senha": "suasenhaaqui",
  "unidade": "SEST"
}
```

- **Ação do Backend de Ivoti**:
  1. Validar a credencial `usuario` e `senha` no serviço Unix.
  2. Validar a coluna `unidade` e realizar o roteamento de conexão para o banco de dados correspondente daquela fábrica.
  3. Retornar o token JWT contendo as informações do usuário (cargo/função, nome, email).

---

## Marcações de Código para a Equipe de T.I.

No arquivo `frontend/src/stores/auth.js`, você encontrará dois blocos de comentários visíveis demarcando os pontos exatos da automação:

### Bloco 1: Endpoint de Unidades Ativas

```javascript
// =========================================================================
//  [ÁREA DA AUTOMAÇÃO BACKEND] - ENDPOINT DE UNIDADES ATIVAS
// =========================================================================
```

### Bloco 2: Dispatch do Login Multi-Unidade

```javascript
// =========================================================================
//  [ÁREA DA AUTOMAÇÃO BACK-END] - INTEGRAÇÃO DASS_AUTH_SERVICE
// =========================================================================
```

---

## Ajuste do IP e Porta do Servidor

Para alterar a URL base do servidor `dass_auth_service` em produção ou homologação, edite o arquivo `frontend/src/services/httpClient.ts`:

```typescript
// frontend/src/services/httpClient.ts
export const authApi = axios.create({
  baseURL: isLocal ? "http://localhost:2399" : `${ip}:2399/api`,
  withCredentials: true,
});
```

Caso queira ajustar o IP padrão da fábrica, configure a variável em `frontend/src/utils/ip.js`:

```javascript
// frontend/src/utils/ip.js
// const baseApi = "http://10.100.1.43:2399/api"
```

---

## Mecanismo de Fallback para Garantia de Operação

Enquanto a rota `GET /auth/unidades` não for disponibilizada no servidor, o frontend aplicará automaticamente o **fallback seguro de unidades padrão DASS** (`VDC`, `STJ`, `SEST`, `ITB`), garantindo que o sistema continue funcional durante a fase de transição.
