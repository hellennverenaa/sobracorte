# Guia de Conversão React → Vue.js 3

Este documento fornece exemplos de como converter os componentes React para Vue.js 3 usando Composition API e Script Setup.

## 📋 Comparação de Conceitos

| React | Vue.js 3 |
|-------|----------|
| `useState` | `ref`, `reactive` |
| `useEffect` | `onMounted`, `watch`, `watchEffect` |
| `useContext` | `provide/inject` ou Pinia |
| Props | `defineProps` |
| Custom Hooks | Composables |
| JSX | Template ou JSX |

---

## 1. Context de Autenticação

### React (Original)
```tsx
// /contexts/AuthContext.tsx
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  
  const login = async (email: string, password: string) => {
    // ...
  };
  
  return (
    <AuthContext.Provider value={{ user, token, login }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Vue.js 3 (Pinia Store)
```typescript
// /stores/auth.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const isLoading = ref(true)
  
  const isAuthenticated = computed(() => !!user.value)
  
  async function login(email: string, password: string) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ email, password })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao fazer login')
      }
      
      token.value = data.access_token
      user.value = data.user
      
      localStorage.setItem('sobracorte_token', data.access_token)
      localStorage.setItem('sobracorte_user', JSON.stringify(data.user))
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }
  
  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('sobracorte_token')
    localStorage.removeItem('sobracorte_user')
  }
  
  function checkAuth() {
    const savedToken = localStorage.getItem('sobracorte_token')
    const savedUser = localStorage.getItem('sobracorte_user')
    
    if (savedToken && savedUser) {
      token.value = savedToken
      user.value = JSON.parse(savedUser)
    }
    
    isLoading.value = false
  }
  
  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    logout,
    checkAuth
  }
})
```

---

## 2. Página de Login

### React (Original)
```tsx
// /pages/Login.tsx
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ...
  };
  
  return (
    <div className="...">
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </form>
    </div>
  );
}
```

### Vue.js 3 (Script Setup)
```vue
<!-- /pages/Login.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Mail, Lock, Package, AlertCircle } from 'lucide-vue-next'

const email = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)

const authStore = useAuthStore()
const router = useRouter()

async function handleSubmit() {
  error.value = ''
  isLoading.value = true
  
  try {
    await authStore.login(email.value, password.value)
    router.push('/')
  } catch (err: any) {
    error.value = err.message || 'Erro ao fazer login'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4 shadow-lg">
          <Package class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-4xl font-bold text-white mb-2">SobraCorte</h1>
        <p class="text-gray-300">Pavilhão do Corte Automático</p>
      </div>
      
      <!-- Login Card -->
      <div class="bg-white rounded-2xl shadow-2xl p-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Entrar no Sistema</h2>
        
        <!-- Error Alert -->
        <div v-if="error" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
          <AlertCircle class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
          <span class="text-sm">{{ error }}</span>
        </div>
        
        <form @submit.prevent="handleSubmit" class="space-y-5">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <div class="relative">
              <Mail class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                v-model="email"
                type="email"
                class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>
          
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <div class="relative">
              <Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="password"
                v-model="password"
                type="password"
                class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isLoading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
        
        <div class="mt-6 text-center">
          <p class="text-gray-600 text-sm">
            Não tem uma conta?
            <router-link to="/register" class="text-blue-600 hover:text-blue-700 font-medium">
              Cadastre-se aqui
            </router-link>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
```

---

## 3. Dashboard

### React (Original)
```tsx
export function Dashboard() {
  const [stats, setStats] = useState<Stats>({ ... });
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchStats();
  }, []);
  
  const fetchStats = async () => {
    // ...
  };
}
```

### Vue.js 3 (Script Setup)
```vue
<!-- /pages/Dashboard.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Layout from '@/components/Layout.vue'
import InitialSetup from '@/components/InitialSetup.vue'
import { Package, TrendingDown, ArrowRightLeft, TrendingUp } from 'lucide-vue-next'

interface Stats {
  total_materials: number
  low_stock_count: number
  today_transactions: number
  total_entradas: number
  total_saidas: number
}

const authStore = useAuthStore()
const stats = ref<Stats>({
  total_materials: 0,
  low_stock_count: 0,
  today_transactions: 0,
  total_entradas: 0,
  total_saidas: 0
})
const isLoading = ref(true)

const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-ed830bfb`

async function fetchStats() {
  try {
    const response = await fetch(`${API_URL}/stats`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      stats.value = data
    }
  } catch (error) {
    console.error('Error fetching stats:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchStats()
})
</script>

<template>
  <Layout>
    <div class="max-w-7xl mx-auto">
      <!-- Welcome Section -->
      <div class="mb-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
        <p class="text-gray-600">Visão geral do estoque de sobras de materiais</p>
      </div>
      
      <!-- Initial Setup -->
      <InitialSetup v-if="stats.total_materials === 0 && !isLoading" class="mb-6" />
      
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
      
      <!-- Stats Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <!-- Stat Cards -->
        <!-- ... -->
      </div>
    </div>
  </Layout>
</template>
```

---

## 4. Composable para API (Custom Hook)

### React (Hook)
```tsx
// hooks/useApi.ts
export function useApi() {
  const { token } = useAuth();
  
  const fetchMaterials = async () => {
    // ...
  };
  
  return { fetchMaterials };
}
```

### Vue.js 3 (Composable)
```typescript
// composables/useApi.ts
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function useApi() {
  const authStore = useAuthStore()
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-ed830bfb`
  
  async function fetchMaterials(filters?: { tipo?: string; search?: string }) {
    isLoading.value = true
    error.value = null
    
    try {
      const params = new URLSearchParams()
      if (filters?.tipo) params.append('tipo', filters.tipo)
      if (filters?.search) params.append('search', filters.search)
      
      const response = await fetch(`${API_URL}/materials?${params}`, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Erro ao buscar materiais')
      }
      
      const data = await response.json()
      return data.materials
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }
  
  async function createMaterial(material: any) {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch(`${API_URL}/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`
        },
        body: JSON.stringify(material)
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao criar material')
      }
      
      return await response.json()
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }
  
  return {
    isLoading,
    error,
    fetchMaterials,
    createMaterial
  }
}
```

---

## 5. Router Configuration

### React Router
```tsx
// App.tsx
<Router>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
  </Routes>
</Router>
```

### Vue Router
```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/Login.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/pages/Register.vue')
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/pages/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/materials',
    name: 'Materials',
    component: () => import('@/pages/Materials.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/movement',
    name: 'Movement',
    component: () => import('@/pages/Movement.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

export default router
```

---

## 6. Main Entry Point

### React
```tsx
// main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### Vue.js 3
```typescript
// main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/globals.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Initialize auth on app start
import { useAuthStore } from './stores/auth'
const authStore = useAuthStore()
authStore.checkAuth()

app.mount('#app')
```

---

## 7. Package.json Dependencies

```json
{
  "name": "sobracorte",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.5",
    "pinia": "^2.1.7",
    "@supabase/supabase-js": "^2.39.7",
    "lucide-vue-next": "^0.300.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.3.0",
    "vue-tsc": "^1.8.27",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32"
  }
}
```

---

## 8. Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

---

## 🎯 Principais Diferenças

1. **State Management**: React usa Context API, Vue usa Pinia
2. **Reactivity**: React usa `useState`, Vue usa `ref` e `reactive`
3. **Templates**: React usa JSX, Vue usa templates (ou JSX)
4. **Lifecycle**: React usa `useEffect`, Vue usa `onMounted`, `watch`, etc.
5. **Router**: Sintaxe similar, mas APIs diferentes
6. **Icons**: `lucide-react` → `lucide-vue-next`

---

## ✅ Checklist de Conversão

- [ ] Converter Context → Pinia Stores
- [ ] Converter componentes JSX → Templates Vue
- [ ] Converter hooks → Composables
- [ ] Configurar Vue Router
- [ ] Atualizar imports de ícones
- [ ] Configurar Vite + TypeScript
- [ ] Migrar variáveis de ambiente
- [ ] Testar autenticação
- [ ] Testar CRUD de materiais
- [ ] Testar movimentações

---

**Nota**: O backend (Supabase Edge Functions) permanece exatamente o mesmo, apenas o frontend muda de React para Vue.js 3.
