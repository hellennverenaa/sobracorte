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

function buildSessionUser(token, syncedUser, unit, isGlobalAdmin = false) {
  const apiUser = decodeJwtPayload(token)
  const matricula = syncedUser?.matriculaDass || apiUser.matricula || apiUser.registration || apiUser.matriculaDass || syncedUser?.id || apiUser.id
  return {
    id: syncedUser?.id ?? apiUser.id,
    matricula,
    registration: matricula,
    matriculaDass: matricula,
    nome: apiUser.nome || apiUser.usuario,
    usuario: apiUser.usuario,
    email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
    setor: apiUser.setor || 'NÃO DEFINIDO',
    assignedSector: syncedUser?.assignedSector || null,
    funcao: apiUser.funcao || 'NÃO DEFINIDO',
    role: syncedUser?.role || 'leitor',
    token,
    unit,
    isGlobalAdmin,
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const user = loadStoredUser()
    return {
      user,
      isAuthenticated: Boolean(user),
      availableUnits: [],
    }
  },

  actions: {
    clearSession() {
      this.user = null
      this.isAuthenticated = false
      this.availableUnits = []
      localStorage.removeItem('user')
      sessionStorage.removeItem('expirationTime')
    },

    async fetchAvailableUnits() {
      try {
        const response = await api.get('/factory-units');
        this.availableUnits = response.data?.data || response.data || [];
        return this.availableUnits;
      } catch (error) {
        console.error('Erro ao buscar unidades fabris:', error);
        return [];
      }
    },

    async switchUnit(unitCode) {
      if (!this.user?.isGlobalAdmin && this.user?.role !== 'admin') return false;
      try {
        const token = this.user.token;
        const targetCode = typeof unitCode === 'object' ? unitCode.code : unitCode;
        const checkResponse = await api.post('/auth/check-user', null, {
          headers: { Authorization: `Bearer ${token}`, 'X-Dass-Unit': targetCode }
        });
        const finalUser = buildSessionUser(
          token,
          checkResponse.data.user,
          checkResponse.data.unit,
          checkResponse.data.isGlobalAdmin,
        );
        this.user = finalUser;
        localStorage.setItem('user', JSON.stringify(finalUser));
        return true;
      } catch (err) {
        console.error('Erro ao alternar unidade fabril:', err);
        throw err;
      }
    },

    async restoreSession() {
      const stored = loadStoredUser()
      if (!stored?.unit?.code) {
        this.clearSession()
        return false
      }
      try {
        const response = await authApi.post('/auth/me', null, { withCredentials: true })
        const token = response.data?.data?.token
        if (!token) throw new Error('Sessão inválida.')
        const synced = await api.post('/auth/check-user', null, {
          headers: { Authorization: `Bearer ${token}`, 'X-Dass-Unit': stored.unit.code },
        })
        this.user = buildSessionUser(token, synced.data.user, synced.data.unit, synced.data.isGlobalAdmin)
        this.isAuthenticated = true
        localStorage.setItem('user', JSON.stringify(this.user))
        if (this.user.role === 'admin' || this.user.isGlobalAdmin) {
          this.fetchAvailableUnits();
        }
        return true
      } catch {
        this.clearSession()
        return false
      }
    },

    async login(user, password, unitCode) {
      try {
        const response = await authApi.post("/auth/login", { 
          usuario: user,
          senha: password
        })

        const payload = response.data

        const checkResponse = await api.post('/auth/check-user', null, {
          headers: { Authorization: `Bearer ${payload.data.token}`, 'X-Dass-Unit': unitCode }
        });
        const userSobraCorte = checkResponse.data.user;

        const finalUser = buildSessionUser(
          payload.data.token,
          userSobraCorte,
          checkResponse.data.unit,
          checkResponse.data.isGlobalAdmin,
        )

        this.user = finalUser
        this.isAuthenticated = true
        localStorage.setItem("user", JSON.stringify(finalUser))
        if (this.user.role === 'admin' || this.user.isGlobalAdmin) {
          this.fetchAvailableUnits();
        }

        return true

      } catch (error) {
        if (error.response?.status === 403) {
          try { await authApi.post('/auth/logout') } catch {}
          this.clearSession()
        }
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
        this.clearSession()
      }
    },

    can(action) {
      const role = this.user?.role;

      if (role === 'admin' || this.user?.isGlobalAdmin) return true;

      if (action === 'gerenciar_usuarios') return false;

      if (action === 'baixar_relatorios' || action === 'exportar_dados') {
        return role === 'lider' || role === 'admin_setor';
      }

      if (action === 'cadastrar_materiais') {
        return role === 'lider' || role === 'admin_setor';
      }

      if (action === 'movimentar') {
        return role === 'lider' || role === 'movimentador' || role === 'admin_setor';
      }

      if (action === 'gerenciar_configuracoes' || action === 'editar_configuracoes') {
        return role === 'lider' || role === 'admin_setor';
      }

      return false;
    }
  }
})
