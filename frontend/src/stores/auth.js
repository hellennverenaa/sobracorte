import { defineStore } from 'pinia'
import { authApi, api } from '../utils/ip'

// --- LÓGICA DE NÍVEIS AUTOMÁTICOS (VIA CARGO DO RH DASS) ---
const defineNivelUsuario = (userData) => {
  const funcao = userData.funcao ? String(userData.funcao).toUpperCase().trim() : '';

  // 1. LÍDER (Pode cadastrar, movimentar, editar, excluir e baixar relatórios)
  if (
    funcao.includes('LIDER') ||
    funcao.includes('LÍDER') ||
    funcao.includes('ANALISTA') ||
    funcao.includes('COORDENADOR') ||
    funcao.includes('GERENTE')
  ) {
    return 'lider';
  }

  // 2. MOVIMENTADOR (Só entrada e saída)
  if (
    funcao.includes('AUXILIAR') ||
    funcao.includes('ASSISTENTE')
  ) {
    return 'movimentador';
  }

  // 3. LEITOR (Multi Operador ou qualquer outro cargo não mapeado acima)
  // O Leitor é a nossa trava padrão de segurança. Se o cargo for estranho, bloqueia.
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

    // --- LOGIN VIA API DA FÁBRICA ---
    async login(user, password) {
      try {
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
        console.log("Login aceito!");

        // Processa o Token da DASS
        const tokenPayload = data.data.token.split(".")[1]
        const apiUser = JSON.parse(atob(tokenPayload))
        console.log("Usuário:", apiUser.usuario, "| Cargo DASS:", apiUser.funcao);

        const usuarioUpper = String(apiUser.usuario).toUpperCase().trim();

        // 1. ADMIN MASTER (Diretoria de TI/Projeto)
        // Lista restrita: Hellen, Paulo Ricardo, Hendrius e Midian
        const adminsMaster = ['HELLEN.MAGALHAES', 'HENDRIUS.SANTANA', 'PAULO.RICARDO', 'MIDIAN.SANTANA', 'CLEONICE.SOARES'];
        // Verifica se o login do usuário contém algum dos nomes master
        const isMaster = adminsMaster.some(admin => usuarioUpper.includes(admin));

        const dadosAtualizados = {
          nome: apiUser.nome || apiUser.usuario,
          email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO'
        }

        let finalRole = 'leitor'
        let localId = null

        if (isMaster) {
          console.log("Admin Master Identificado: Acesso Total Liberado.");
          finalRole = 'admin';
        } else {
          // SÓ entra aqui se NÃO for um dos 4 Admins
          try {
            const localCheck = await fetch(`${api}/users`)
            if (localCheck.ok) {
              const localUsers = await localCheck.json()
              const existingUser = localUsers.find(u => u.email === dadosAtualizados.email)

              // O PODER DO ADMIN: Se o usuário já existe no nosso banco e o Admin alterou
              // o nível de acesso dele manualmente, essa decisão sobrepõe a regra do RH!
              if (existingUser && existingUser.role) {
                finalRole = existingUser.role
                localId = existingUser.id
              } else {
                // Se é a primeira vez logando, usa a inteligência do Cargo da DASS
                finalRole = defineNivelUsuario(apiUser)
              }
            }
          } catch (error) {
            // Se o nosso banco estiver fora, garante o login usando o Cargo do RH
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

    // A MATRIZ DE ACESSO (O ESCUDO DA ARQUITETA)
    can(action) {
      const role = this.user?.role;
      
      // Admins Masters podem TUDO (Burlam qualquer trava abaixo)
      if (role === 'admin') return true;

      // 1. Alterar níveis de acesso manualmente
      if (action === 'gerenciar_usuarios') return false; // Somente admin (linha de cima)

      // 2. Exportar planilhas e relatórios gerenciais
      if (action === 'baixar_relatorios') return role === 'lider';
      
      // 3. Cadastrar, Editar e Excluir materiais do estoque
      if (action === 'cadastrar_materiais') return role === 'lider';
      
      // 4. Operação de rotina (Dar entrada ou saída do estoque)
      if (action === 'movimentar') return role === 'lider' || role === 'movimentador';
      
      // Bloqueio de segurança padrão (para o Leitor)
      return false; 
    }
  }
})