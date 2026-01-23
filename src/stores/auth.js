import { defineStore } from 'pinia'

// TRUQUE: Define o IP automaticamente para não travar (localhost ou IP da rede)
const HOST = window.location.hostname 
const DB_URL = `http://${HOST}:3001`
////http://10.110.21.53:3001

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user')) || null,
    isAuthenticated: !!localStorage.getItem('user')
  }),

  actions: {
    // --- FUNÇÃO ESSENCIAL PARA EVITAR A TELA BRANCA ---
    checkAuth() {
      const user = localStorage.getItem('user')
      if (user) {
        this.user = JSON.parse(user)
        this.isAuthenticated = true
      } else {
        this.user = null
        this.isAuthenticated = false
      }
    },
    // --------------------------------------------------

    async login(email, password) {
      try {
        // Usa a URL dinâmica (DB_URL)
        const response = await fetch(`${DB_URL}/users?email=${email}&password=${password}`)
        
        if (!response.ok) {
           throw new Error('Erro ao conectar com o servidor (Verifique o npm run db)')
        }

        const users = await response.json()

        if (users.length > 0) {
          const user = users[0]
          this.user = user
          this.isAuthenticated = true
          localStorage.setItem('user', JSON.stringify(user))
          return true
        } else {
          throw new Error('Email ou senha incorretos')
        }
      } catch (error) {
        console.error("Erro no login:", error)
        throw error
      }
    },

    logout() {
      this.user = null
      this.isAuthenticated = false
      localStorage.removeItem('user')
      // Força o redirecionamento
      window.location.href = '/login'
    }
  }
})