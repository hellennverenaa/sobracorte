import { defineStore } from 'pinia'
import { authApi, api } from '../services/httpClient'

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

// const checkOrRegisterUser = async (payload) => {
//   try {
//     const response = api.post("/auth/check-user", { user: payload })
//     return response?.data?.user
//   } catch (error) {
//     console.error("Erro ao verificar ususario apos login", error);
//     throw new Error("Erro ao verificar ususario apos login");
//     return null;
//   }
// }

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
        const response = await authApi.post("/auth/login", { usuario: user, senha: password })

        const payload = response.data


        // Processa o Token da DASS
        const tokenPayload = payload.data.token.split(".")[1]
        const apiUser = JSON.parse(atob(tokenPayload))

        // Chamar callback para backend sobracorte registrar usuario (se necessario)
        //TODO: Modificar essa função para se o usuário já estiver cadastrado retornar o usuário, se não estiver cadastrar e retorna o usuário:
        let userSobraCorte = null;
        try {
            // 🚀 AQUI ESTÁ O SEGREDO: O await garante que o banco vai responder!
            const checkResponse = await api.post("/auth/check-user", { user: apiUser });
            userSobraCorte = checkResponse.data.user;
        } catch (err) {
            console.warn("⚠️ Falha ao buscar cargo no banco local. Usando RH DASS.");
        }
// 4. Inteligência de Níveis
        let finalRole = 'leitor';
        if (userSobraCorte && userSobraCorte.role) {
            // Se achou no banco, USA O DO BANCO (O Admin do Hendrius entra aqui!)
            finalRole = userSobraCorte.role;
        } else {
            // Inteligência de RH (Fallback)
            const funcaoUpper = String(apiUser.funcao || '').toUpperCase().trim();
            if (funcaoUpper.includes('LIDER') || funcaoUpper.includes('LÍDER') || funcaoUpper.includes('ANALISTA') || funcaoUpper.includes('COORDENADOR') || funcaoUpper.includes('GERENTE')) {
              finalRole = 'lider';
            } else if (funcaoUpper.includes('AUXILIAR') || funcaoUpper.includes('ASSISTENTE')) {
              finalRole = 'movimentador';
            }
        }

        // 5. Escudo Master da Arquiteta
        const usuarioUpper = String(apiUser.usuario).toUpperCase().trim();
        const adminsMaster = ['HELLEN.MAGALHAES', 'HENDRIUS.SANTANA', 'PAULO.RICARDO', 'MIDIAN.SANTANA', 'CLEONICE.SOARES'];
        if (adminsMaster.some(admin => usuarioUpper.includes(admin))) {
            finalRole = 'admin';
        }

        // 🚀 6. CONSTRUÇÃO BLINDADA DO USUÁRIO (Adeus Bug do Fantasma!)
        const finalUser = {
          id: userSobraCorte ? userSobraCorte.id : apiUser.id,
          nome: apiUser.nome || apiUser.usuario,
          usuario: apiUser.usuario,
          email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO',
          role: finalRole, // O cargo 'admin' entra aqui perfeitamente
          token: payload.data.token
        }

        console.log("🚀 Usuário Montado com Sucesso:", finalUser);

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