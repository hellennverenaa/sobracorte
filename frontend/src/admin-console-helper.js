/**
 * SobraCorte - Admin Console Helper
 * 
 * Cole este script no Console do navegador (F12 → Console)
 * para facilitar tarefas administrativas.
 * 
 * ATENÇÃO: Você precisa estar logado como ADMIN para usar estas funções.
 */

// ========== CONFIGURAÇÃO ==========

// Obter automaticamente do localStorage
const getToken = () => localStorage.getItem('sobracorte_token');
const getProjectId = () => {
  // Extrai do window.location ou do código
  const scriptTags = document.getElementsByTagName('script');
  for (let script of scriptTags) {
    const match = script.src.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (match) return match[1];
  }
  return prompt('Digite o Project ID do Supabase:');
};

const API_URL = `https://${getProjectId()}.supabase.co/functions/v1/make-server-ed830bfb`;

// ========== FUNÇÕES HELPER ==========

/**
 * Lista todos os usuários do sistema
 */
async function listarUsuarios() {
  try {
    const token = getToken();
    if (!token) {
      console.error('❌ Você precisa estar logado!');
      return;
    }

    const response = await fetch(`${API_URL}/admin/users`, {
      headers: { 'X-Access-Token': token }
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Erro:', data.error);
      return;
    }

    console.log('\n📋 USUÁRIOS DO SISTEMA:\n');
    console.table(data.users.map(u => ({
      'Nome': u.nome,
      'Email': u.email,
      'Role': u.role,
      'ID': u.id,
      'Criado em': new Date(u.created_at).toLocaleString('pt-BR')
    })));

    return data.users;
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
  }
}

/**
 * Promove um usuário para admin
 * @param {string} userId - ID do usuário
 */
async function promoverParaAdmin(userId) {
  try {
    const token = getToken();
    if (!token) {
      console.error('❌ Você precisa estar logado!');
      return;
    }

    if (!userId) {
      console.error('❌ Forneça o ID do usuário!');
      console.log('💡 Exemplo: promoverParaAdmin("uuid-do-usuario")');
      return;
    }

    const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': token
      },
      body: JSON.stringify({ role: 'admin' })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Erro:', data.error);
      return;
    }

    console.log(`✅ ${data.message}`);
    console.log(`👤 Usuário: ${data.user.nome}`);
    console.log(`🔑 Novo role: ${data.user.role}`);
    
    return data;
  } catch (error) {
    console.error('❌ Erro ao promover usuário:', error);
  }
}

/**
 * Rebaixa um usuário para operador
 * @param {string} userId - ID do usuário
 */
async function rebaixarParaOperador(userId) {
  try {
    const token = getToken();
    if (!token) {
      console.error('❌ Você precisa estar logado!');
      return;
    }

    if (!userId) {
      console.error('❌ Forneça o ID do usuário!');
      console.log('💡 Exemplo: rebaixarParaOperador("uuid-do-usuario")');
      return;
    }

    const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': token
      },
      body: JSON.stringify({ role: 'operador' })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Erro:', data.error);
      return;
    }

    console.log(`✅ ${data.message}`);
    console.log(`👤 Usuário: ${data.user.nome}`);
    console.log(`🔑 Novo role: ${data.user.role}`);
    
    return data;
  } catch (error) {
    console.error('❌ Erro ao rebaixar usuário:', error);
  }
}

/**
 * Promove usuário por email (mais fácil que usar ID)
 * @param {string} email - Email do usuário
 */
async function promoverPorEmail(email) {
  try {
    if (!email) {
      console.error('❌ Forneça o email do usuário!');
      console.log('💡 Exemplo: promoverPorEmail("joao@empresa.com")');
      return;
    }

    const usuarios = await listarUsuarios();
    const usuario = usuarios.find(u => u.email === email);

    if (!usuario) {
      console.error(`❌ Usuário com email "${email}" não encontrado!`);
      return;
    }

    console.log(`\n🔍 Usuário encontrado: ${usuario.nome} (${usuario.email})`);
    console.log(`📋 Role atual: ${usuario.role}\n`);

    return await promoverParaAdmin(usuario.id);
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

/**
 * Rebaixa usuário por email
 * @param {string} email - Email do usuário
 */
async function rebaixarPorEmail(email) {
  try {
    if (!email) {
      console.error('❌ Forneça o email do usuário!');
      console.log('💡 Exemplo: rebaixarPorEmail("joao@empresa.com")');
      return;
    }

    const usuarios = await listarUsuarios();
    const usuario = usuarios.find(u => u.email === email);

    if (!usuario) {
      console.error(`❌ Usuário com email "${email}" não encontrado!`);
      return;
    }

    console.log(`\n🔍 Usuário encontrado: ${usuario.nome} (${usuario.email})`);
    console.log(`📋 Role atual: ${usuario.role}\n`);

    return await rebaixarParaOperador(usuario.id);
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

/**
 * Mostra informações do usuário logado
 */
async function meusDados() {
  try {
    const userStr = localStorage.getItem('sobracorte_user');
    if (!userStr) {
      console.error('❌ Você não está logado!');
      return;
    }

    const user = JSON.parse(userStr);
    
    console.log('\n👤 MEU PERFIL:\n');
    console.log(`Nome: ${user.nome}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`ID: ${user.id}`);
    
    if (user.role !== 'admin') {
      console.warn('\n⚠️ ATENÇÃO: Você NÃO é admin!');
      console.log('Você não pode usar as funções administrativas.\n');
    } else {
      console.log('\n✅ Você é ADMIN - pode usar todas as funções!\n');
    }

    return user;
  } catch (error) {
    console.error('❌ Erro ao buscar dados:', error);
  }
}

/**
 * Mostra todas as funções disponíveis
 */
function ajuda() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║        SOBRACORTE - ADMIN CONSOLE HELPER                  ║
╚═══════════════════════════════════════════════════════════╝

📋 FUNÇÕES DISPONÍVEIS:

1️⃣  ajuda()
   └─ Mostra esta mensagem de ajuda

2️⃣  meusDados()
   └─ Mostra informações do usuário logado

3️⃣  listarUsuarios()
   └─ Lista todos os usuários do sistema
   └─ Exemplo: listarUsuarios()

4️⃣  promoverPorEmail(email)
   └─ Promove um usuário para admin usando o email
   └─ Exemplo: promoverPorEmail("joao@empresa.com")

5️⃣  rebaixarPorEmail(email)
   └─ Rebaixa um usuário para operador usando o email
   └─ Exemplo: rebaixarPorEmail("joao@empresa.com")

6️⃣  promoverParaAdmin(userId)
   └─ Promove um usuário para admin usando o ID
   └─ Exemplo: promoverParaAdmin("uuid-do-usuario")

7️⃣  rebaixarParaOperador(userId)
   └─ Rebaixa um usuário para operador usando o ID
   └─ Exemplo: rebaixarParaOperador("uuid-do-usuario")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 DICAS:

• Use promoverPorEmail() - é mais fácil que decorar IDs
• Execute listarUsuarios() primeiro para ver todos os usuários
• Verifique meusDados() para confirmar que você é admin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 EXEMPLO DE USO COMPLETO:

  // 1. Ver meus dados
  meusDados()

  // 2. Listar todos os usuários
  listarUsuarios()

  // 3. Promover João para admin
  promoverPorEmail("joao@empresa.com")

  // 4. Confirmar a mudança
  listarUsuarios()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

// ========== AUTO-EXECUTAR ==========

console.log('%c🚀 SobraCorte Admin Helper Carregado!', 'color: #3b82f6; font-size: 16px; font-weight: bold;');
console.log('%cDigite ajuda() para ver as funções disponíveis', 'color: #10b981; font-size: 12px;');
console.log('');

// Verificar automaticamente se o usuário é admin
setTimeout(() => {
  meusDados();
}, 500);
