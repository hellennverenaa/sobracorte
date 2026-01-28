import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Importação das Páginas
import Login from '@/pages/Login.vue'
import Register from '@/pages/Register.vue'
import Dashboard from '@/pages/Dashboard.vue'
import Materials from '@/pages/Materials.vue'
import Movement from '@/pages/Movement.vue'
import Profile from '@/pages/Profile.vue'
import Users from '@/pages/Users.vue'
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
    meta: { 
      requiresAuth: true,
      // AGORA TODOS PODEM ENTRAR (para ver), mas só alguns cadastram (controlado no botão)
      roles: ['admin', 'lider', 'movimentador', 'leitor'] 
    } 
  },
  { 
    path: '/movement', 
    name: 'Movement', 
    component: Movement, 
    meta: { 
      requiresAuth: true,
      roles: ['admin', 'lider', 'movimentador'] // Leitor NÃO movimenta
    } 
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
    meta: { 
      requiresAuth: true, 
      roles: ['admin'] // Apenas Admin Master
    } 
  },
  { 
    path: '/reports',
    name:'Reports',
    component: Reports, 
    meta: { 
      requiresAuth: true,
      roles: ['admin', 'lider'] 
    } 
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// --- GUARDIÃO DE ROTAS ---
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  const userRole = authStore.user?.role

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } 
  else if (to.meta.roles && !to.meta.roles.includes(userRole)) {
    alert('Acesso negado: Você não tem permissão para acessar esta página.')
    if (from.name !== 'Dashboard' && from.name !== 'Login') {
      next('/')
    } else {
      next(false)
    }
  }
  else {
    next()
  }
})

export default router