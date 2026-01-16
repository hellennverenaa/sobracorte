# 📁 Estrutura do Projeto Vue.js 3 - SobraCorte

## Como Criar o Projeto

### 1. Criar novo projeto Vue.js 3 com Vite

```bash
npm create vue@latest sobracorte-vue

# Selecione as opções:
# ✅ TypeScript
# ✅ Vue Router
# ✅ Pinia
# ❌ JSX Support (não é necessário)
# ❌ Vitest
# ❌ End-to-End Testing
# ✅ ESLint
# ❌ Prettier (opcional)

cd sobracorte-vue
npm install
```

### 2. Instalar dependências adicionais

```bash
npm install lucide-vue-next
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

---

## 📂 Estrutura de Diretórios

```
sobracorte-vue/
├── public/
│   └── favicon.ico
├── src/
│   ├── assets/
│   │   └── (imagens, ícones)
│   ├── components/
│   │   ├── Layout.vue
│   │   ├── LoadingSpinner.vue
│   │   ├── StatCard.vue
│   │   ├── EmptyState.vue
│   │   ├── InitialSetup.vue
│   │   └── ui/
│   │       ├── Button.vue
│   │       ├── Input.vue
│   │       ├── Card.vue
│   │       ├── Badge.vue
│   │       ├── Alert.vue
│   │       ├── Dialog.vue
│   │       └── Table.vue
│   ├── composables/
│   │   ├── useApi.ts
│   │   └── useMaterials.ts
│   ├── pages/
│   │   ├── Login.vue
│   │   ├── Register.vue
│   │   ├── Dashboard.vue
│   │   ├── Materials.vue
│   │   ├── Movement.vue
│   │   └── Profile.vue
│   ├── router/
│   │   └── index.ts
│   ├── stores/
│   │   └── auth.ts
│   ├── types/
│   │   └── index.ts
│   ├── styles/
│   │   └── globals.css
│   ├── utils/
│   │   └── supabase.ts
│   ├── App.vue
│   └── main.ts
├── .env
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 📄 Arquivos de Configuração

### `vite.config.ts`

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

### `tailwind.config.js`

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

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `.env.example`

```env
VITE_SUPABASE_PROJECT_ID=seu_project_id_aqui
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

### `package.json`

```json
{
  "name": "sobracorte-vue",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.21",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.7",
    "lucide-vue-next": "^0.356.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.4",
    "@vue/tsconfig": "^0.5.1",
    "typescript": "~5.4.0",
    "vite": "^5.2.0",
    "vue-tsc": "^2.0.6",
    "tailwindcss": "^3.4.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35"
  }
}
```

---

## 🚀 Comandos para Iniciar

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview da build
npm run preview
```

---

## 📝 Próximos Passos

1. Criar projeto Vue.js 3 conforme instruções acima
2. Copiar arquivos Vue dos próximos documentos que vou gerar
3. Copiar backend Supabase (permanece igual)
4. Configurar variáveis de ambiente
5. Testar aplicação

---

**Nota**: O backend (Supabase Edge Functions) permanece **exatamente o mesmo** da versão React!
