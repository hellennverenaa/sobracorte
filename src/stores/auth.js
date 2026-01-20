import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Endereço do seu novo banco de dados local
const DB_URL = '10.110.21.53:3001'
//ipconfig
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const isLoading = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(email, password) {
    isLoading.value = true
    try {
      // Busca usuários no db.json filtrando pelo email e senha
      const response = await fetch(`${DB_URL}/users?email=${email}&password=${password}`)
      const users = await response.json()

      if (users.length === 0) {
        throw new Error('E-mail ou senha incorretos')
      }

      const foundUser = users[0] // Pega o primeiro usuário encontrado

      // Salva sessão
      const fakeToken = 'token-' + Date.now()
      token.value = fakeToken
      user.value = foundUser

      localStorage.setItem('sobracorte_token', fakeToken)
      localStorage.setItem('sobracorte_user', JSON.stringify(foundUser))
    } catch (error) {
      console.error('Login error:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function register(nome, email, password) {
    isLoading.value = true
    try {
      // 1. Verifica se já existe
      const checkResponse = await fetch(`${DB_URL}/users?email=${email}`)
      const existingUsers = await checkResponse.json()
      
      if (existingUsers.length > 0) {
        throw new Error('Este e-mail já está cadastrado')
      }

      // 2. Cria novo usuário no db.json
      const newUser = { 
        id: String(Date.now()), // JSON Server precisa de ID string
        nome, 
        email, 
        password, 
        role: 'leitor', //<--- MUDANÇA: Todo mundo nasce como leitor
       
      }

      const saveResponse = await fetch(`${DB_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      })

      if (!saveResponse.ok) throw new Error('Erro ao salvar no banco')
      
      const savedUser = await saveResponse.json()

      // Loga automaticamente
      token.value = 'token-' + savedUser.id
      user.value = savedUser
      localStorage.setItem('sobracorte_token', token.value)
      localStorage.setItem('sobracorte_user', JSON.stringify(savedUser))

    } catch (error) {
      console.error('Register error:', error)
      throw error
    } finally {
      isLoading.value = false
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
  }

  return { user, token, isLoading, isAuthenticated, isAdmin, login, register, logout, checkAuth }
})