import { defineStore } from 'pinia'
import { authApi, api } from '../services/httpClient'

function loadStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user'))
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

function decodeJwtPayload(token) {
  const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
  if (!payload) throw new Error('Token inválido recebido do serviço de autenticação.')
  return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const user = loadStoredUser()
    return { user, isAuthenticated: Boolean(user) }
  },

  actions: {
    checkAuth() {
      this.user = loadStoredUser()
      this.isAuthenticated = Boolean(this.user)
    },

    async login(user, password) {
      try {
        const response = await authApi.post("/auth/login", { 
          usuario: user,
          senha: password
        })

        const payload = response.data

        const apiUser = decodeJwtPayload(payload.data.token)

        const checkResponse = await api.post('/auth/check-user', null, {
          headers: { Authorization: `Bearer ${payload.data.token}` }
        });
        const userSobraCorte = checkResponse.data.user;

        const finalUser = {
          id: userSobraCorte ? userSobraCorte.id : apiUser.id,
          nome: apiUser.nome || apiUser.usuario,
          usuario: apiUser.usuario,
          email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO',
          role: userSobraCorte.role,
          token: payload.data.token
        }

        this.user = finalUser
        this.isAuthenticated = true
        localStorage.setItem("user", JSON.stringify(finalUser))

        return true

      } catch (error) {
        if (error.response && error.response.status === 401) {
          const msgBackend = error.response.data?.message || error.response.data?.error || "Usuário ou senha incorretos.";
          throw new Error(msgBackend);
        }

        if (error.response && error.response.data) {
          const outrMsg = error.response.data.message || error.response.data.error;
          if (outrMsg) throw new Error(outrMsg);
        }

        if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
          throw new Error("O serviço da fábrica está temporariamente indisponível.");
        }

        throw new Error("Ocorreu um erro ao processar o login. Tente novamente.");
      }
    },

    async logout() {
      try {
        await authApi.post('/auth/logout')
      } finally {
        this.user = null
        this.isAuthenticated = false
        localStorage.removeItem('user')
        sessionStorage.removeItem('expirationTime')
      }
    },

    can(action) {
      const role = this.user?.role;

      if (role === 'admin') return true;

      if (action === 'gerenciar_usuarios') return false;

      if (action === 'baixar_relatorios') return role === 'lider';

      if (action === 'cadastrar_materiais') return role === 'lider';

      if (action === 'movimentar') return role === 'lider' || role === 'movimentador';

      return false;
    }
  }
})
