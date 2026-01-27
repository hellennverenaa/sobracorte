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

    async login(user, password) {
      try {
        // Usa a URL dinâmica (DB_URL)
        const response = await fetch(`http://10.100.1.43:2399/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            usuario: user,
            senha: password
          })
        })

        if (!response.ok) {
          throw new Error('Usuario ou senha invalidos. Tente novamente.')
        }

        const data = await response.json()
        const user_data = data.data

        if (user_data) {

          console.log(user_data);

          this.user = user_data
          this.isAuthenticated = true
          localStorage.setItem("user", user_data)
          return true
        } else {
          throw new Error('Usuario ou senha invalidos. Tente novamente.')
        }
      } catch (error) {
        console.error("Erro no login, contate a equipe de automação.", error)
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