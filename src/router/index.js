import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Importação das Páginas
import Login from '@/pages/Login.vue'
import Register from '@/pages/Register.vue'
import Dashboard from '@/pages/Dashboard.vue'
import Materials from '@/pages/Materials.vue'
import Movement from '@/pages/Movement.vue'
import Profile from '@/pages/Profile.vue'
import Users from '@/pages/Users.vue' // Nova tela de usuários
import Reports from '@/pages/Reports.vue'

const routes = [
  { 
    path: '/login', 
    name: 'Login', 
    component: Login 
  },
  { 
    path: '/register', 
    name: 'Register', 
    component: Register 
  },
  { 
    path: '/', 
    name: 'Dashboard', 
    component: Dashboard, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/materials', 
    name: 'Materials', 
    component: Materials, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/movement', 
    name: 'Movement', 
    component: Movement, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/profile', 
    name: 'Profile', 
    component: Profile, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/users', 
    name: 'Users', 
    component: Users, 
    meta: { requiresAuth: true, role: 'admin' } // Protegido: Só admin entra
  },
  { path: '/reports',
    name:'Reports',
    component: Reports, 
    meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// --- GUARDIÃO DE ROTAS (Aqui estava o erro) ---
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  // 1. Verifica se a rota precisa de login
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } 
  // 2. Verifica se a rota exige ser 'admin' (RBAC)
  else if (to.meta.role === 'admin' && authStore.user?.role !== 'admin') {
    alert('Acesso negado: Apenas administradores podem acessar esta página.')
    next('/') // Manda de volta pro Dashboard
  }
  // 3. Se passou por tudo, deixa entrar
  else {
    next()
  }
})

export default router