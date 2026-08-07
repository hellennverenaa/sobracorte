import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

import Login from '@/pages/Login.vue'
import Dashboard from '@/pages/Dashboard.vue'
import Materials from '@/pages/Materials.vue'
import Movement from '@/pages/Movement.vue'
import Profile from '@/pages/Profile.vue'
import Users from '@/pages/Users.vue'
import Reports from '@/pages/Reports.vue'
import Settings from '@/pages/Settings.vue'

const routes = [
  { 
    path: '/login', 
    name: 'Login', 
    component: Login 
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
      roles: ['admin', 'lider', 'movimentador', 'leitor'] 
    } 
  },
  { 
    path: '/movement', 
    name: 'Movement', 
    component: Movement, 
    meta: { 
      requiresAuth: true,
      roles: ['admin', 'lider', 'movimentador']
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
      roles: ['admin']
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
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: {
      requiresAuth: true,
      roles: ['admin']
    }
  },
]

const router = createRouter({
  history: createWebHistory("/sobra_corte/"),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  const userRole = authStore.user?.role

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } 
  else if (to.meta.roles && !to.meta.roles.includes(userRole)) {
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
