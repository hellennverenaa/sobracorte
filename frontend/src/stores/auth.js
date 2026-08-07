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
    isAuthenticated: !!localStorage.getItem('user'),
    unidades: [],
    isLoadingUnidades: false,
    unidadesError: null
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

    // =========================================================================
    // 🚀 [ÁREA DA AUTOMAÇÃO BACKEND] - ENDPOINT DE UNIDADES ATIVAS
    // =========================================================================
    // ATENÇÃO EQUIPE DE T.I. / INFRA:
    // O backend do dass_auth_service (Ivoti) deve prover a rota GET abaixo.
    // Ela deve consultar o banco do Unix e retornar a lista de unidades operacionais.
    // Exemplo de resposta esperada:
    // [
    //   { code: 'VDC', name: 'Vitória da Conquista' },
    //   { code: 'STJ', name: 'Santo Antônio de Jesus' },
    //   { code: 'SEST', name: 'Santo Estêvão' },
    //   { code: 'ITB', name: 'Itaberaba' }
    // ]
    // =========================================================================
    async fetchUnidades() {
      this.isLoadingUnidades = true;
      this.unidadesError = null;

      // Fallback seguro de Unidades Padrão DASS para manter o sistema operacional caso o backend ainda não possua a rota
      const fallbackUnidades = [
        { code: 'VDC', name: 'Vitória da Conquista (VDC)' },
        { code: 'STJ', name: 'Santo Antônio de Jesus (STJ)' },
        { code: 'SEST', name: 'Santo Estêvão (SEST)' },
        { code: 'ITB', name: 'Itaberaba (ITB)' }
      ];

      try {
        // Tentativa de requisição via Axios para o endpoint do dass_auth_service
        const response = await authApi.get('/auth/unidades');
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          this.unidades = response.data.map(item => ({
            code: item.code || item.sigla || item.id || item,
            name: item.name || item.nome || item.descricao || item
          }));
        } else if (response.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
          this.unidades = response.data.data.map(item => ({
            code: item.code || item.sigla || item.id || item,
            name: item.name || item.nome || item.descricao || item
          }));
        } else {
          console.warn('⚠️ Endpoint de unidades retornou lista vazia. Aplicando fallback DASS.');
          this.unidades = fallbackUnidades;
        }
      } catch (err) {
        console.warn('⚠️ Endpoint /auth/unidades indisponível. Aplicando fallback de unidades DASS:', err.message);
        this.unidades = fallbackUnidades;
        this.unidadesError = 'Falha ao buscar unidades dinâmicas. Utilizando lista padrão de fábrica.';
      } finally {
        this.isLoadingUnidades = false;
      }
      return this.unidades;
    },

    // =========================================================================
    // 🚀 [ÁREA DA AUTOMAÇÃO BACK-END] - INTEGRAÇÃO DASS_AUTH_SERVICE
    // =========================================================================
    // ATENÇÃO EQUIPE DE T.I. / INFRA:
    // 1. A requisição envia 'usuario', 'senha' e 'unidade' via POST para o dass_auth_service.
    // 2. O servidor de Ivoti deve validar a coluna 'unidade' no Unix e realizar
    //    o roteamento para a base de dados clonada correspondente.
    // 3. Para ajustar o IP/Porta do servidor Ivoti em desenvolvimento/produção,
    //    consulte a constante 'baseURL' em frontend/src/services/httpClient.ts
    // =========================================================================
    async login(user, password, unidade) {
      try {
        const response = await authApi.post("/auth/login", { 
          usuario: user, 
          senha: password,
          unidade: unidade 
        })

        const payload = response.data

        // Processa o Token da DASS
        const tokenPayload = payload.data.token.split(".")[1]
        const apiUser = JSON.parse(atob(tokenPayload))

        // Chamar callback para backend sobracorte registrar usuario (se necessario)
        let userSobraCorte = null;
        try {
          const checkResponse = await api.post("/auth/check-user", { user: apiUser });
          userSobraCorte = checkResponse.data.user;
        } catch (err) {
          console.warn("⚠️ Falha ao buscar cargo no banco local. Usando RH DASS.");
        }

        // 4. Inteligência de Níveis
        let finalRole = 'leitor';
        if (userSobraCorte && userSobraCorte.role) {
          finalRole = userSobraCorte.role;
        } else {
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

        // 🚀 6. CONSTRUÇÃO BLINDADA DO USUÁRIO
        const finalUser = {
          id: userSobraCorte ? userSobraCorte.id : apiUser.id,
          nome: apiUser.nome || apiUser.usuario,
          usuario: apiUser.usuario,
          email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO',
          role: finalRole,
          unidade: unidade,
          token: payload.data.token
        }

        console.log("🚀 Usuário Montado com Sucesso:", finalUser);

        this.user = finalUser
        this.isAuthenticated = true
        localStorage.setItem("user", JSON.stringify(finalUser))

        return true

      } catch (error) {
        console.error("🔍 Erro capturado no Axios:", error);

        if (error.response && error.response.data && error.response.data.error) {
          throw new Error(error.response.data.error);
        }

        if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
          throw new Error("O serviço da fábrica está temporariamente indisponível.");
        }

        throw new Error("Ocorreu um erro ao processar o login.");
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