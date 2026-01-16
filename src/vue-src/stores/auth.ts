import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface User {
  id: string
  nome: string
  email: string
  role: 'admin' | 'operador'
}

const API_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-ed830bfb`
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const isLoading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

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

  async function register(nome: string, email: string, password: string) {
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ nome, email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar conta')
      }

      // Auto-login após registro
      token.value = data.access_token
      user.value = data.user

      localStorage.setItem('sobracorte_token', data.access_token)
      localStorage.setItem('sobracorte_user', JSON.stringify(data.user))
    } catch (error) {
      console.error('Register error:', error)
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
      try {
        token.value = savedToken
        user.value = JSON.parse(savedUser)
      } catch (error) {
        console.error('Error parsing saved user:', error)
        logout()
      }
    }

    isLoading.value = false
  }

  function updateUser(updatedUser: User) {
    user.value = updatedUser
    localStorage.setItem('sobracorte_user', JSON.stringify(updatedUser))
  }

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    isAdmin,
    login,
    register,
    logout,
    checkAuth,
    updateUser
  }
})
