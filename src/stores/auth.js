import { defineStore } from 'pinia'

// TRUQUE: Define o IP automaticamente para funcionar em localhost ou rede
const HOST = window.location.hostname
const DB_URL = `http://${HOST}:3001`
////http://10.110.21.53:3001


// --- LÓGICA DE DEFINIÇÃO DE NÍVEL (AUTOMÁTICA) ---
// Usada apenas no PRIMEIRO acesso do usuário
const defineNivelUsuario = (userData) => {
  // Normaliza para maiúsculas
  const usuario = userData.usuario ? userData.usuario.toUpperCase() : '';
  const funcao = userData.funcao ? userData.funcao.toUpperCase() : '';
  const setor = userData.setor ? userData.setor.toUpperCase() : '';

  console.log(`Calculando nível inicial para: ${usuario} | Função: ${funcao}`);

  // 1. ADMIN MASTER (Acesso Total)
  const adminsMaster = [
    'HELLEN.MAGALHAES',     // Você
    'HENDRIUS.SANTANA',     // Seu amigo
    'TERCEIRO.USUARIO'      // Substitua se tiver mais alguém
  ];

  if (adminsMaster.includes(usuario)) {
    return 'admin';
  }

  // 2. LÍDER (Cadastra e Movimenta)
  if (funcao.toUpperCase().includes('LIDER') ||
    funcao.toUpperCase().includes('COORDENADOR') ||
    funcao.toUpperCase().includes('GERENTE') ||
    funcao.toUpperCase().includes('SUPERVISOR')) {
    return 'lider';
  }

  // 3. MOVIMENTADOR (Apenas Movimenta)
  if (funcao.toUpperCase().includes('AUXILIAR') ||
    funcao.toUpperCase().includes('OPERADOR' || 'MULTIOPERADOR') ||
    funcao.toUpperCase().includes('ASSISTENTE') ||
    setor === 'ALMOXARIFADO') {
    return 'movimentador';
  }

  // 4. LEITOR (Padrão - Somente Vê)
  return 'leitor';
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null,
    isAuthenticated: !!localStorage.getItem('user')
  }),

  actions: {
    // Restaura a sessão ao recarregar a página
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

    // --- LOGIN INTELIGENTE (API + AUTO-UPDATE + BANCO LOCAL) ---
    async login(user, password) {
      try {
        // 1. Tenta logar na API da Empresa (Valida Senha)
        const response = await fetch(`http://10.100.1.43:2399/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: user, senha: password })
        })

        if (!response.ok) {
          throw new Error('Usuário ou senha incorretos.')
        }

        const data = await response.json()

        // Decodifica o Token JWT da API
        const tokenPayload = data.data.token.split(".")[1]
        const apiUser = JSON.parse(atob(tokenPayload))

        // Prepara os dados frescos que vieram da API
        const dadosAtualizados = {
          nome: apiUser.nome || apiUser.usuario,
          email: apiUser.email || `${apiUser.usuario.toLowerCase()}@grupodass.com.br`,
          setor: apiUser.setor || 'NÃO DEFINIDO',
          funcao: apiUser.funcao || 'NÃO DEFINIDO'
        }

        let finalRole = 'leitor' // Default de segurança
        let localId = null

        try {
          // 2. Busca pelo usuário no seu banco local (db.json)
          const localCheck = await fetch(`${DB_URL}/users`)
          const localUsers = await localCheck.json()         

          console.log(`Buscando usuario: ${apiUser.usuario.toUpperCase()}`);
          const logedUser = localUsers.filter(user => {
            return user.usuario === apiUser.usuario.toUpperCase()
          })

          if (logedUser.length > 0) {
            // [CENÁRIO A] Usuário já existe no banco local
            const existingUser = logedUser[0]
            finalRole = existingUser.role // IMPORTANTE: Mantém o nível que você definiu manualmente!
            localId = existingUser.id

            // Verifica se precisa atualizar o cadastro (Setor/Função mudou ou estava vazio?)
            if (existingUser.setor !== apiUser.setor || existingUser.funcao !== apiUser.funcao) {
              console.log("Atualizando dados do usuário com informações da API...")

              // Atualiza apenas os campos informativos, sem mexer no 'role' ou 'id'
              await fetch(`${DB_URL}/users/${existingUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosAtualizados)
              })
            }
          } else {
            // [CENÁRIO B] Primeiro acesso: Cria novo usuário
            console.log("Primeiro acesso detectado. Criando cadastro local...")
            finalRole = defineNivelUsuario(apiUser)

            const newUser = {
              usuario: apiUser.usuario,
              role: finalRole,
              created_at: new Date().toISOString(),
              ...dadosAtualizados // Adiciona nome, setor, funcao
            }

            // Salva no JSON Server
            const createResponse = await fetch(`${DB_URL}/users`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newUser)
            })
            const createdUser = await createResponse.json()
            localId = createdUser.id
          }
        } catch (dbError) {
          console.error("Aviso: Banco local indisponível. Usando permissão temporária.", dbError)
          // Fallback se o JSON Server estiver desligado
          finalRole = defineNivelUsuario(apiUser)
        }

        // 3. Monta o objeto final da sessão
        const finalUser = {
          ...apiUser,        // Dados da API
          id: localId || apiUser.id, // ID do banco local (preferencial)
          role: finalRole,   // Role definida (manual ou automática)
          token: data.data.token
        }

        // 4. Salva no Pinia e LocalStorage
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

    // Auxiliar para verificação visual (botões, menus)
    can(action) {
      const role = this.user?.role

      // Admin pode tudo
      if (role === 'admin') return true

      // Lider pode cadastrar
      if (action === 'cadastrar_materiais') return role === 'lider'

      // Lider e Movimentador podem mover estoque
      if (action === 'movimentar') return role === 'lider' || role === 'movimentador'

      return false
    }
  }
})