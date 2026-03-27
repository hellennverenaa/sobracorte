import { defineStore } from 'pinia'

import { authApi, api } from '../utils/ip'

// --- LÓGICA DE NÍVEIS ---
const defineNivelUsuario = (userData) => {
  const usuario = userData.usuario ? userData.usuario.toUpperCase() : '';
  const funcao = userData.funcao ? userData.funcao.toUpperCase() : '';
  const setor = userData.setor ? userData.setor.toUpperCase() : '';

  // 1. ADMIN MASTER
  const adminsMaster = ['HELLEN.MAGALHAES', 'HENDRIUS.SANTANA', 'PAULO.SANTANA'];
  if (adminsMaster.includes(usuario)) return 'admin';

  // 2. LÍDER
  if (funcao.includes('LIDER') || funcao.includes('COORDENADOR') ||
    funcao.includes('GERENTE') || funcao.includes('SUPERVISOR')) return 'lider';

  // 3. MOVIMENTADOR
  if (funcao.includes('AUXILIAR') || funcao.includes('OPERADOR') ||
    setor === 'ALMOXARIFADO') return 'movimentador';

  return 'leitor';
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null,
    isAuthenticated: !!localStorage.getItem('user')
  }),

  actions: {
    checkAuth() {
      const userStored = localStorage.getItem('user')
      if (userStored) {
        try {
          this.user = JSON.parse(userStored)
          this.isAuthenticated = true
        } catch (e) {
          this.logout()
        }
      } else {
        this.user = null
        this.isAuthenticated = false
      }
    },

    // --- LOGIN VIA PROXY ---
    async login(user, password) {
      try {
        // Usa a URL dinâmica definida lá em cima
        const response = await fetch(authApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: user, senha: password })
        })

        if (!response.ok) {
          const erro = await response.json();
          throw new Error(erro.error || 'Falha no login');
        }

        const data = await response.json()
        console.log("✅ Login aceito!");

        // Processa o Token
        const tokenPayload = data.data.token.split(".")[1]
        const apiUser = JSON.parse(atob(tokenPayload))
        console.log("👤 Usuário identificado na API:", apiUser.usuario);

        // --- TRAVA DE SEGURANÇA PARA ADMINS MASTER ---
        // Se for Hellen ou Hendrius, É ADMIN e ponto final. Ignora o resto.
        const usuarioUpper = String(apiUser.usuario).toUpperCase().trim();
        const isMaster = ['HELLEN.MAGALHAES', 'HENDRIUS.SANTANA', 'PAULO.SANTANA'].includes(usuarioUpper);

        // Prepara dados básicos
        const dadosAtualizados = {
          nome: apiUser.nome || apiUser.usuario,
          email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO'
        }

        let finalRole = 'leitor'
        let localId = null

        if (isMaster) {
          console.log("👑 Admin Master Identificado: Acesso Total Liberado.");
          finalRole = 'admin';
        } else {
          // SÓ entra aqui se NÃO for a Hellen ou o Hendrius
          try {
            const localCheck = await fetch(`${api}/users`)
            if (localCheck.ok) {
              const localUsers = await localCheck.json()
              const existingUser = localUsers.find(u => u.email === dadosAtualizados.email)

              if (existingUser) {
                finalRole = existingUser.role
                localId = existingUser.id
              } else {
                finalRole = defineNivelUsuario(apiUser)
              }
            }
          } catch (error) {
            finalRole = defineNivelUsuario(apiUser);
          }
        }

        const finalUser = {
          ...apiUser,
          ...dadosAtualizados,
          id: localId || apiUser.id,
          role: finalRole,
          token: data.data.token
        }

        this.user = finalUser
        this.isAuthenticated = true
        localStorage.setItem("user", JSON.stringify(finalUser))

        return true

      } catch (error) {
        console.error("Erro no login:", error)
        throw error
      }
    },

    logout() {
      this.user = null
      this.isAuthenticated = false
      localStorage.removeItem('user')
      window.location.href = '/login'
    },

    can(action) {
      const role = this.user?.role
      if (role === 'admin') return true
      if (action === 'cadastrar_materiais') return role === 'lider'
      if (action === 'movimentar') return role === 'lider' || role === 'movimentador'
      return false
    }
  }
})