# 🔐 Como Tornar hellen.magalhaes@grupodass.com.br Administradora

## 3 Métodos Disponíveis

---

## ✅ MÉTODO 1: Via Console do Navegador (MAIS FÁCIL)

### Pré-requisitos:
- Você precisa estar logado como **admin** no sistema
- OU ser o primeiro usuário (usar Método 3 primeiro)

### Passo a Passo:

1. **Faça login no SobraCorte**
   - Acesse a aplicação
   - Faça login com suas credenciais de admin

2. **Abra o Console do Navegador**
   - Pressione `F12` no teclado
   - OU clique com botão direito → "Inspecionar" → Aba "Console"

3. **Cole o script helper**
   - Copie todo o conteúdo do arquivo `/admin-console-helper.js`
   - Cole no console e pressione `Enter`
   - Você verá: "🚀 SobraCorte Admin Helper Carregado!"

4. **Execute o comando**
   ```javascript
   promoverPorEmail("hellen.magalhaes@grupodass.com.br")
   ```

5. **Aguarde a confirmação**
   ```
   ✅ Role atualizado com sucesso
   👤 Usuário: Hellen Magalhães
   🔑 Novo role: admin
   ```

6. **Pronto!** Hellen agora é administradora! 🎉

---

## ✅ MÉTODO 2: Via Supabase Dashboard (SE VOCÊ TEM ACESSO)

### Passo a Passo:

1. **Acesse o Supabase Dashboard**
   - Vá para: https://supabase.com/dashboard
   - Faça login na sua conta
   - Selecione o projeto do SobraCorte

2. **Abra o SQL Editor**
   - No menu lateral esquerdo, clique em "SQL Editor"
   - Clique em "+ New query"

3. **Execute este comando SQL**
   ```sql
   -- Atualizar role no Supabase Auth
   UPDATE auth.users 
   SET raw_user_meta_data = 
       COALESCE(raw_user_meta_data, '{}'::jsonb) || 
       '{"role": "admin"}'::jsonb
   WHERE email = 'hellen.magalhaes@grupodass.com.br';
   ```

4. **Clique em "Run"** (ou pressione Ctrl+Enter)

5. **Verifique se funcionou**
   ```sql
   -- Ver o role atual
   SELECT email, raw_user_meta_data->>'role' as role
   FROM auth.users
   WHERE email = 'hellen.magalhaes@grupodass.com.br';
   ```

6. **Hellen precisa fazer logout e login novamente** para as mudanças surtirem efeito

---

## ✅ MÉTODO 3: Criar Primeiro Admin (SE NENHUM ADMIN EXISTE)

### Este método é necessário apenas se:
- Nenhum usuário é admin ainda
- Você é o primeiro a configurar o sistema

### Opção A: Via Supabase SQL Editor

```sql
-- 1. Primeiro, veja todos os usuários
SELECT id, email, raw_user_meta_data->>'role' as role
FROM auth.users;

-- 2. Escolha o ID da Hellen e atualize
UPDATE auth.users 
SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    '{"role": "admin"}'::jsonb
WHERE email = 'hellen.magalhaes@grupodass.com.br';

-- 3. Confirme a mudança
SELECT email, raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'hellen.magalhaes@grupodass.com.br';
```

### Opção B: Via API do Supabase

Se você tem acesso ao código do servidor, pode criar um endpoint temporário:

```typescript
// Adicione este endpoint TEMPORÁRIO ao /supabase/functions/server/index.tsx

app.post("/make-server-ed830bfb/create-first-admin", async (c) => {
  try {
    const { email } = await c.req.json();
    
    // Buscar usuário por email
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    const user = users.find(u => u.email === email);
    
    if (!user) {
      return c.json({ error: "Usuário não encontrado" }, 404);
    }
    
    // Atualizar para admin
    const { data: updatedUser, error: updateError } = 
      await supabase.auth.admin.updateUserById(
        user.id,
        { user_metadata: { role: 'admin' } }
      );
    
    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }
    
    // Atualizar no KV store
    const userData = await kv.get(`user_${user.id}`);
    if (userData) {
      await kv.set(`user_${user.id}`, { ...userData, role: 'admin' });
      await kv.set(`user_email_${email}`, { ...userData, role: 'admin' });
    }
    
    return c.json({ 
      message: "Primeiro admin criado com sucesso!",
      user: { 
        id: user.id, 
        email: user.email, 
        role: 'admin' 
      }
    });
  } catch (error) {
    return c.json({ error: "Erro ao criar admin" }, 500);
  }
});
```

Depois chame via `fetch`:

```javascript
fetch('https://SEU_PROJECT_ID.supabase.co/functions/v1/make-server-ed830bfb/create-first-admin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer SEU_ANON_KEY'
  },
  body: JSON.stringify({ 
    email: 'hellen.magalhaes@grupodass.com.br' 
  })
})
.then(r => r.json())
.then(data => console.log(data));
```

**⚠️ IMPORTANTE:** Remova este endpoint depois de criar o primeiro admin!

---

## 🔍 Como Verificar se Funcionou

### Método 1: Via Interface do Sistema

1. Hellen deve fazer **logout** e **login** novamente
2. No header, ao lado do nome, deve aparecer: `admin`
3. No menu, a aba **"Perfil"** deve mostrar o painel de gerenciamento de usuários
4. Deve aparecer uma coroa 👑 ao lado do nome dela

### Método 2: Via Console do Navegador

```javascript
// Cole no console
JSON.parse(localStorage.getItem('sobracorte_user'))

// Deve mostrar:
// {
//   id: "...",
//   nome: "Hellen Magalhães",
//   email: "hellen.magalhaes@grupodass.com.br",
//   role: "admin"  ← Deve ser "admin"
// }
```

### Método 3: Via SQL

```sql
SELECT email, raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'hellen.magalhaes@grupodass.com.br';

-- Resultado esperado:
-- email: hellen.magalhaes@grupodass.com.br
-- role: admin
```

---

## ⚠️ Problemas Comuns

### "Não encontrei o usuário"

**Causa:** Hellen ainda não se cadastrou no sistema

**Solução:**
1. Hellen precisa acessar o SobraCorte
2. Clicar em "Registrar"
3. Preencher nome, email e senha
4. Completar o cadastro
5. DEPOIS você pode promovê-la para admin

### "Erro 403 - Acesso Negado"

**Causa:** Você não é admin

**Solução:**
- Use o Método 3 para criar o primeiro admin
- OU peça a um admin existente para promovê-la

### "Mudança não surtiu efeito"

**Causa:** Cache do navegador

**Solução:**
1. Hellen deve fazer **logout**
2. Fechar o navegador completamente
3. Abrir novamente
4. Fazer **login** novamente
5. Verificar se role mudou

### "Erro ao executar SQL"

**Causa:** Sintaxe incorreta ou falta de permissões

**Solução:**
- Verifique se você está usando o SQL Editor do Supabase
- Verifique se está no projeto correto
- Copie e cole o comando exatamente como está no guia

---

## 📋 Checklist Completo

### Antes de Começar
- [ ] Hellen está cadastrada no sistema?
- [ ] Você tem acesso ao Supabase Dashboard OU é admin no sistema?
- [ ] Você sabe qual método vai usar?

### Durante o Processo
- [ ] Executei o comando corretamente?
- [ ] Vi mensagem de sucesso?
- [ ] Não houve erros?

### Depois de Completar
- [ ] Hellen fez logout?
- [ ] Hellen fez login novamente?
- [ ] Role mudou para "admin"?
- [ ] Ela consegue ver painel de gerenciamento de usuários?
- [ ] Aparece coroa 👑 no perfil dela?

---

## 🎯 Resumo Ultra-Rápido

### Se você já é admin:
```javascript
// Console do navegador (F12)
promoverPorEmail("hellen.magalhaes@grupodass.com.br")
```

### Se nenhum admin existe:
```sql
-- Supabase SQL Editor
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'hellen.magalhaes@grupodass.com.br';
```

### Depois:
- Hellen faz logout e login
- Pronto! ✅

---

## 📞 Precisa de Ajuda?

- Consulte **[ADMIN_GUIDE.md](./ADMIN_GUIDE.md)** para detalhes técnicos
- Veja **[PROFILE_MANAGEMENT.md](./PROFILE_MANAGEMENT.md)** para gerenciamento de usuários
- Confira **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** para problemas comuns

---

**✅ Após seguir estes passos, Hellen Magalhães será administradora do sistema!**

*Boa sorte! 🚀*
