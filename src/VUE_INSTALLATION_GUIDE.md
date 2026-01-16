# 🚀 Guia de Instalação - SobraCorte Vue.js 3

## ⚠️ IMPORTANTE

O ambiente **Figma Make suporta apenas React**. Para usar Vue.js 3, você precisa:

1. **Baixar os arquivos** do diretório `/vue-src/`
2. **Criar o projeto localmente** em sua máquina
3. **Copiar o backend** do Supabase (permanece igual)

---

## 📋 Pré-requisitos

- Node.js 18+ instalado
- NPM ou Yarn
- Conta no Supabase (mesma do projeto React)

---

## 🎯 Passo a Passo Completo

### 1. Criar Projeto Vue.js 3

```bash
# Criar novo projeto
npm create vue@latest sobracorte-vue

# Durante a instalação, selecione:
✔ Add TypeScript? … Yes
✔ Add JSX Support? … No
✔ Add Vue Router for Single Page Application development? … Yes
✔ Add Pinia for state management? … Yes
✔ Add Vitest for Unit Testing? … No
✔ Add an End-to-End Testing Solution? › No
✔ Add ESLint for code quality? … Yes

cd sobracorte-vue
```

### 2. Instalar Dependências Adicionais

```bash
npm install lucide-vue-next
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3. Configurar Tailwind CSS

Edite `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#1e40af',
        accent: '#06b6d4',
        danger: '#ef4444',
        success: '#10b981',
        warning: '#f59e0b',
      },
    },
  },
  plugins: [],
}
```

### 4. Estrutura de Diretórios

Crie a seguinte estrutura no diretório `src/`:

```
src/
├── assets/
├── components/
│   ├── Layout.vue
│   ├── LoadingSpinner.vue
│   ├── StatCard.vue
│   ├── EmptyState.vue
│   └── InitialSetup.vue
├── composables/
│   └── useApi.ts
├── pages/
│   ├── Login.vue
│   ├── Register.vue
│   ├── Dashboard.vue
│   ├── Materials.vue
│   ├── Movement.vue
│   └── Profile.vue
├── router/
│   └── index.ts
├── stores/
│   └── auth.ts
├── types/
│   └── index.ts
├── styles/
│   └── globals.css
├── App.vue
└── main.ts
```

### 5. Copiar Arquivos Vue

**OPÇÃO A: Manualmente**

Copie todos os arquivos de `/vue-src/` para o diretório `src/` do seu projeto:

```bash
# Na raiz do projeto Figma Make
cp -r vue-src/* sobracorte-vue/src/

# Copie também o globals.css
cp styles/globals.css sobracorte-vue/src/styles/
```

**OPÇÃO B: Baixar Arquivos Individualmente**

Use os arquivos que estou criando no diretório `/vue-src/`:

- ✅ `/vue-src/main.ts`
- ✅ `/vue-src/App.vue`
- ✅ `/vue-src/stores/auth.ts`
- ✅ `/vue-src/router/index.ts`
- ✅ `/vue-src/types/index.ts`
- ✅ `/vue-src/pages/Login.vue`
- (e todos os outros que vou criar)

### 6. Configurar Variáveis de Ambiente

Crie arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_PROJECT_ID=seu_project_id_aqui
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

**Onde encontrar essas informações:**

1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em Settings → API
4. Copie:
   - **Project URL**: extraia o ID (ex: `abc123` de `https://abc123.supabase.co`)
   - **anon/public key**: copie a chave completa

### 7. Configurar Vite (vite.config.ts)

```typescript
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
```

### 8. Configurar globals.css

Em `src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
  }
  h1 {
    @apply text-4xl font-bold;
  }
  h2 {
    @apply text-3xl font-semibold;
  }
  h3 {
    @apply text-2xl font-semibold;
  }
}
```

### 9. Backend Supabase (NÃO PRECISA MUDAR!)

O backend **permanece exatamente o mesmo**! Você pode:

**OPÇÃO A: Usar o Backend Existente**
- O backend já está rodando no Supabase
- Basta usar as mesmas credenciais
- Funciona tanto para React quanto para Vue!

**OPÇÃO B: Redeployar (Opcional)**
- Se quiser fazer deploy novamente, copie a pasta `/supabase/` para o projeto Vue
- Execute `supabase functions deploy make-server-ed830bfb`

### 10. Iniciar Desenvolvimento

```bash
npm run dev
```

Acesse: http://localhost:5173

---

## ✅ Checklist de Verificação

### Antes de Começar
- [ ] Node.js 18+ instalado
- [ ] NPM funcionando
- [ ] Conta Supabase ativa

### Durante Instalação
- [ ] Projeto Vue.js 3 criado
- [ ] Dependências instaladas
- [ ] Tailwind CSS configurado
- [ ] Estrutura de diretórios criada

### Após Copiar Arquivos
- [ ] Todos arquivos de `/vue-src/` copiados
- [ ] `globals.css` copiado
- [ ] `.env` configurado com credenciais
- [ ] `vite.config.ts` configurado

### Testes Finais
- [ ] `npm run dev` funciona
- [ ] Página de login carrega
- [ ] Login funciona
- [ ] Cadastro funciona
- [ ] Dashboard mostra estatísticas
- [ ] CRUD de materiais funciona
- [ ] Movimentações funcionam

---

## 🐛 Troubleshooting

### Erro: "Cannot find module '@/...'"

**Causa:** Alias `@` não configurado

**Solução:**
```typescript
// vite.config.ts
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url))
  }
}
```

### Erro: "import.meta.env.VITE_... is undefined"

**Causa:** Variáveis de ambiente não carregadas

**Solução:**
1. Certifique-se que o arquivo `.env` está na **raiz** do projeto
2. Reinicie o servidor de desenvolvimento
3. Variáveis devem começar com `VITE_`

### Erro: "Failed to fetch"

**Causa:** URL do backend incorreta ou backend não rodando

**Solução:**
1. Verifique se `VITE_SUPABASE_PROJECT_ID` está correto
2. Teste a URL manualmente: `https://SEU_ID.supabase.co/functions/v1/make-server-ed830bfb/health`
3. Verifique se as Edge Functions estão ativas no Supabase

### Página em branco após login

**Causa:** Router não configurado corretamente

**Solução:**
1. Verifique se `router/index.ts` existe
2. Verifique se está importado no `main.ts`
3. Verifique se `<RouterView />` está no `App.vue`

---

## 📦 Arquivos Principais

### Estrutura Mínima Funcional

```
sobracorte-vue/
├── .env                          ← Credenciais Supabase
├── index.html
├── package.json
├── vite.config.ts               ← Configuração Vite + alias @
├── tailwind.config.js           ← Configuração Tailwind
├── tsconfig.json
└── src/
    ├── main.ts                  ← Entry point
    ├── App.vue                  ← Componente raiz
    ├── router/
    │   └── index.ts            ← Rotas + Guards
    ├── stores/
    │   └── auth.ts             ← Estado autenticação (Pinia)
    ├── types/
    │   └── index.ts            ← Tipos TypeScript
    ├── pages/
    │   ├── Login.vue
    │   ├── Register.vue
    │   ├── Dashboard.vue
    │   ├── Materials.vue
    │   ├── Movement.vue
    │   └── Profile.vue
    ├── components/
    │   └── Layout.vue
    └── styles/
        └── globals.css         ← Estilos globais + Tailwind
```

---

## 🚀 Comandos Úteis

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview da build
npm run preview

# Lint (verificar erros)
npm run lint

# Type-check
npm run type-check
```

---

## 📚 Próximos Passos

1. ✅ Criar projeto Vue.js 3
2. ✅ Copiar arquivos do `/vue-src/`
3. ✅ Configurar `.env`
4. ✅ Testar login/cadastro
5. ✅ Testar CRUD de materiais
6. ⏭️ Customizar design (opcional)
7. ⏭️ Deploy em produção

---

## 🎓 Diferenças React → Vue.js 3

| React | Vue.js 3 |
|-------|----------|
| `useState` | `ref` |
| `useEffect` | `onMounted`, `watch` |
| `useContext` | Pinia Store |
| `onChange={(e) => setX(e.target.value)}` | `v-model="x"` |
| `{condition && <Component />}` | `v-if="condition"` |
| `className` | `class` |
| `onClick` | `@click` |
| `<Link to="">` | `<router-link to="">` |

---

## 🔗 Links Úteis

- [Vue.js 3 Docs](https://vuejs.org/)
- [Pinia Docs](https://pinia.vuejs.org/)
- [Vue Router Docs](https://router.vuejs.org/)
- [Vite Docs](https://vitejs.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/)
- [Lucide Vue Icons](https://lucide.dev/guide/packages/lucide-vue-next)

---

## ✅ Você Está Pronto!

Após seguir todos esses passos, você terá:

- ✅ Projeto Vue.js 3 completo
- ✅ Autenticação JWT via Supabase
- ✅ CRUD de materiais
- ✅ Sistema de movimentação
- ✅ Dashboard com estatísticas
- ✅ Gerenciamento de permissões
- ✅ Design moderno e responsivo

**Qualquer dúvida, consulte os guias na pasta raiz do projeto!**

Boa sorte! 🎉
