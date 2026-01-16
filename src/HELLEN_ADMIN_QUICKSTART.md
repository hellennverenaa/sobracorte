# 🚀 GUIA RÁPIDO: Tornar Hellen Admin

## Método Mais Fácil (Se você já é admin)

### 1️⃣ Abra o Console
Pressione **F12** no navegador

### 2️⃣ Cole o Script
Copie todo o conteúdo de `/admin-console-helper.js` e cole no console

### 3️⃣ Execute
```javascript
promoverPorEmail("hellen.magalhaes@grupodass.com.br")
```

### 4️⃣ Pronto! ✅

---

## Se Nenhum Admin Existe Ainda

### Via Supabase Dashboard:

1. Acesse https://supabase.com/dashboard
2. Vá em **SQL Editor**
3. Cole e execute:

```sql
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'hellen.magalhaes@grupodass.com.br';
```

4. Hellen faz **logout** e **login** novamente
5. Pronto! ✅

---

## ⚠️ IMPORTANTE

Hellen precisa:
1. ✅ Estar cadastrada no sistema primeiro
2. ✅ Fazer logout após a mudança
3. ✅ Fazer login novamente para ativar

---

## Como Verificar

Após login, Hellen deve ver:
- 👑 Ícone de coroa no perfil
- ✅ "admin" ao lado do nome no header
- ✅ Painel de gerenciamento na aba Perfil

---

**Para detalhes completos, veja: [TORNAR_HELLEN_ADMIN.md](./TORNAR_HELLEN_ADMIN.md)**
