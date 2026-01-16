/**
 * SobraCorte - Script para Criar o Primeiro Administrador
 * 
 * IMPORTANTE: Use este script APENAS para criar o primeiro admin do sistema!
 * Depois que tiver pelo menos um admin, use a interface visual ou o admin-console-helper.js
 * 
 * COMO USAR:
 * 1. Faça login com o usuário hellen.magalhaes@grupodass.com.br
 * 2. Abra o Console do navegador (F12 → Console)
 * 3. Cole este script inteiro e pressione Enter
 * 4. O script irá promover automaticamente o usuário logado para admin
 */

(async function criarPrimeiroAdmin() {
  console.log('%c🚀 SOBRACORTE - CRIAR PRIMEIRO ADMIN', 'color: #f59e0b; font-size: 18px; font-weight: bold; background: #fef3c7; padding: 10px;');
  console.log('');
  
  try {
    // 1. Verificar se usuário está logado
    console.log('1️⃣ Verificando login...');
    const userStr = localStorage.getItem('sobracorte_user');
    const token = localStorage.getItem('sobracorte_token');
    
    if (!userStr || !token) {
      console.error('❌ ERRO: Você não está logado!');
      console.log('');
      console.log('📝 INSTRUÇÕES:');
      console.log('1. Faça login com hellen.magalhaes@grupodass.com.br');
      console.log('2. Execute este script novamente');
      return;
    }
    
    const user = JSON.parse(userStr);
    console.log(`✅ Usuário logado: ${user.nome} (${user.email})`);
    console.log('');
    
    // 2. Obter Project ID do Supabase
    console.log('2️⃣ Detectando configuração...');
    
    // Tentar obter projectId do código
    let projectId = null;
    const scriptTags = document.getElementsByTagName('script');
    for (let script of scriptTags) {
      const match = script.src.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match) {
        projectId = match[1];
        break;
      }
    }
    
    if (!projectId) {
      // Tentar obter do window ou prompt
      projectId = prompt('Digite o Project ID do Supabase (ex: abcd1234efgh):');
      if (!projectId) {
        console.error('❌ Project ID não fornecido. Abortando.');
        return;
      }
    }
    
    console.log(`✅ Project ID: ${projectId}`);
    console.log('');
    
    // 3. Conectar ao Supabase diretamente
    console.log('3️⃣ Conectando ao Supabase...');
    console.log('⚠️  ATENÇÃO: Este script vai promover o usuário atual para ADMIN!');
    console.log('');
    
    const confirmacao = confirm(`Deseja promover ${user.email} para ADMINISTRADOR?`);
    
    if (!confirmacao) {
      console.log('❌ Operação cancelada pelo usuário.');
      return;
    }
    
    console.log('4️⃣ Atualizando role do usuário...');
    
    // Importar Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.7');
    
    // IMPORTANTE: Pedir as credenciais do Supabase
    console.log('');
    console.log('%c⚠️  ATENÇÃO - CREDENCIAIS NECESSÁRIAS', 'color: #ef4444; font-size: 14px; font-weight: bold;');
    console.log('Para criar o primeiro admin, você precisa das credenciais do Supabase:');
    console.log('');
    
    const SUPABASE_URL = prompt('1. Digite a SUPABASE_URL\n(ex: https://abcd1234.supabase.co):');
    if (!SUPABASE_URL) {
      console.error('❌ URL não fornecida. Abortando.');
      return;
    }
    
    const SUPABASE_SERVICE_ROLE_KEY = prompt('2. Digite a SUPABASE_SERVICE_ROLE_KEY\n(encontre em Settings → API):');
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Service Role Key não fornecida. Abortando.');
      return;
    }
    
    console.log('');
    console.log('5️⃣ Atualizando no Supabase Auth...');
    
    // Criar cliente Supabase com service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Atualizar user metadata
    const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(
      user.id,
      { 
        user_metadata: { 
          ...user,
          role: 'admin' 
        } 
      }
    );
    
    if (authError) {
      console.error('❌ Erro ao atualizar Supabase Auth:', authError.message);
      console.log('');
      console.log('💡 SOLUÇÃO ALTERNATIVA:');
      console.log('Use o método SQL direto no Supabase Dashboard (veja instruções abaixo)');
      return;
    }
    
    console.log('✅ Supabase Auth atualizado!');
    console.log('');
    
    // 6. Atualizar localStorage
    console.log('6️⃣ Atualizando dados locais...');
    user.role = 'admin';
    localStorage.setItem('sobracorte_user', JSON.stringify(user));
    console.log('✅ Dados locais atualizados!');
    console.log('');
    
    // 7. Atualizar no KV Store via API
    console.log('7️⃣ Sincronizando com KV Store...');
    const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb`;
    
    // Nota: Isso falhará porque ainda não somos admin, mas o Auth já foi atualizado
    console.log('⏭️  Pulando atualização do KV Store (será sincronizado no próximo login)');
    console.log('');
    
    // Sucesso!
    console.log('');
    console.log('%c✅ SUCESSO! VOCÊ AGORA É ADMINISTRADOR!', 'color: #10b981; font-size: 18px; font-weight: bold; background: #d1fae5; padding: 10px;');
    console.log('');
    console.log('📋 PRÓXIMOS PASSOS:');
    console.log('1. ✅ Role atualizado para "admin"');
    console.log('2. 🔄 Faça LOGOUT do sistema');
    console.log('3. 🔑 Faça LOGIN novamente');
    console.log('4. 🎉 Acesse a aba "Perfil" e teste as funções de admin!');
    console.log('');
    console.log('💡 DICA: Agora você pode promover outros usuários usando a interface visual!');
    console.log('');
    
  } catch (error) {
    console.error('❌ ERRO FATAL:', error);
    console.log('');
    console.log('%c🔧 SOLUÇÃO ALTERNATIVA - MÉTODO SQL', 'color: #3b82f6; font-size: 16px; font-weight: bold;');
    console.log('');
    console.log('Se o script falhou, use este método manual:');
    console.log('');
    console.log('1. Acesse o Supabase Dashboard');
    console.log('2. Vá em SQL Editor');
    console.log('3. Execute este comando:');
    console.log('');
    console.log('%cUPDATE auth.users', 'color: #8b5cf6; font-family: monospace;');
    console.log('%cSET raw_user_meta_data = raw_user_meta_data || \'{"role": "admin"}\'::jsonb', 'color: #8b5cf6; font-family: monospace;');
    console.log('%cWHERE email = \'hellen.magalhaes@grupodass.com.br\';', 'color: #8b5cf6; font-family: monospace;');
    console.log('');
    console.log('4. Faça logout e login novamente');
    console.log('');
  }
})();
