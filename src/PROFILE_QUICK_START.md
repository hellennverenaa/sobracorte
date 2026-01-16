# 🚀 Guia Rápido: Sistema de Perfil e Permissões

## ⚡ Acesso Rápido

1. **Faça login** no sistema
2. Clique na aba **"Perfil"** no menu superior
3. Veja suas informações e permissões

---

## 👤 Para Usuários Operadores

### O que você vê:
✅ Seu nome e email  
✅ Nível de acesso: **Operador**  
✅ Status da conta: Ativa  
✅ Lista de permissões disponíveis  

### O que você pode fazer:
- Visualizar materiais
- Registrar entradas e saídas
- Consultar dashboard
- Ver próprio perfil

### Como solicitar permissões de Admin:
- Peça a um administrador existente para promovê-lo
- O admin pode fazer isso diretamente pela interface

---

## 👑 Para Administradores

### Painel de Gerenciamento

Ao acessar a página de Perfil, você verá:

1. **Seu Perfil** (topo)
   - Card com fundo azul
   - Ícone de coroa 👑
   - Suas informações e privilégios

2. **Gerenciamento de Usuários** (abaixo)
   - Tabela com todos os usuários
   - Colunas: Usuário, Email, Nível Atual, Ações

### Como Promover um Usuário

**Passo a Passo:**

1. Role até a seção "Gerenciamento de Usuários"
2. Localize o usuário na tabela
3. Clique no botão **"Promover Admin"** (botão amarelo com coroa)
4. Confirme a ação no diálogo que aparecer
5. Aguarde a confirmação de sucesso
6. Pronto! O usuário agora é administrador

**Visual:**
```
┌─────────────┬──────────────┬──────────┬────────────────┐
│ Usuário     │ Email        │ Nível    │ Ações          │
├─────────────┼──────────────┼──────────┼────────────────┤
│ João Silva  │ joao@...     │ Operador │ [Promover Admin]│
└─────────────┴──────────────┴──────────┴────────────────┘
```

### Como Rebaixar um Usuário

**Passo a Passo:**

1. Role até a seção "Gerenciamento de Usuários"
2. Localize o usuário admin na tabela
3. Clique no botão **"Rebaixar Operador"** (botão cinza)
4. Confirme a ação no diálogo
5. Aguarde a confirmação
6. O usuário agora é operador

**Visual:**
```
┌─────────────┬──────────────┬────────────┬──────────────────┐
│ Usuário     │ Email        │ Nível      │ Ações            │
├─────────────┼──────────────┼────────────┼──────────────────┤
│ 👑 Maria S. │ maria@...    │ Admin      │ [Rebaixar Op.]   │
└─────────────┴──────────────┴────────────┴──────────────────┘
```

---

## 🎯 Casos de Uso Rápidos

### Cenário 1: Novo Funcionário Precisa de Acesso Admin

```
Admin → Perfil → Gerenciamento de Usuários
     → Localizar "João Silva"
     → Clicar "Promover Admin"
     → Confirmar
     → ✅ Concluído!
```

### Cenário 2: Funcionário Saiu, Precisa Revogar Acesso

```
Admin → Perfil → Gerenciamento de Usuários
     → Localizar "Maria Santos"
     → Clicar "Rebaixar Operador"
     → Confirmar
     → ✅ Acesso limitado!
```

### Cenário 3: Verificar Quem Tem Acesso Admin

```
Admin → Perfil → Gerenciamento de Usuários
     → Olhar coluna "Nível Atual"
     → Usuários com 👑 = Administradores
     → Usuários sem 👑 = Operadores
```

---

## 🔍 Identificação Visual Rápida

### Ícones
- 👑 **Coroa** = Administrador
- 👤 **User** = Operador

### Cores
- 🟡 **Amarelo** = Admin
- ⚪ **Cinza** = Operador
- 🔵 **Azul** = Você mesmo

### Badges
```
┌──────────────┐     ┌──────────────┐
│ Administrador│     │  Operador    │
└──────────────┘     └──────────────┘
   (amarelo)            (cinza)
```

---

## ⚠️ Avisos Importantes

### ❌ Você NÃO pode:
- Alterar seu próprio nível de acesso
- Promover/rebaixar sem confirmação
- Acessar gerenciamento se for operador

### ✅ Você PODE:
- Promover quantos usuários quiser (se admin)
- Rebaixar admins para operador (se admin)
- Ver lista completa de usuários (se admin)
- Consultar próprio perfil (todos)

---

## 🐛 Problemas Comuns

### "Não vejo a seção de Gerenciamento"
**Solução:** Você não é admin. Solicite a um administrador.

### "Botão está desabilitado/carregando"
**Solução:** Aguarde a operação anterior terminar.

### "Erro ao atualizar permissão"
**Solução:** 
1. Verifique sua conexão
2. Faça logout e login novamente
3. Tente novamente

### "Lista de usuários está vazia"
**Solução:**
1. Recarregue a página
2. Verifique se há usuários cadastrados
3. Veja o console do navegador para erros

---

## 📊 Diferenças Entre Níveis

| Funcionalidade          | Operador | Admin |
|-------------------------|----------|-------|
| Ver materiais           | ✅       | ✅    |
| Cadastrar materiais     | ❌       | ✅    |
| Editar materiais        | ❌       | ✅    |
| Deletar materiais       | ❌       | ✅    |
| Registrar movimentação  | ✅       | ✅    |
| Ver dashboard           | ✅       | ✅    |
| Ver próprio perfil      | ✅       | ✅    |
| Ver todos os usuários   | ❌       | ✅    |
| Promover usuários       | ❌       | ✅    |
| Rebaixar usuários       | ❌       | ✅    |

---

## 🎓 Dicas Profissionais

### Para Admins

1. **Seja criterioso** ao promover usuários
2. **Confirme sempre** antes de alterar permissões
3. **Documente** quem recebeu acesso admin e quando
4. **Revise periodicamente** a lista de administradores
5. **Revogue acesso** de funcionários que saíram

### Para Todos

1. **Não compartilhe** suas credenciais
2. **Faça logout** ao sair
3. **Reporte** problemas de acesso imediatamente
4. **Leia** as informações de permissões do seu nível

---

## ⏱️ Tempo Estimado

- **Ver próprio perfil**: < 5 segundos
- **Promover/Rebaixar usuário**: < 10 segundos
- **Revisar lista de usuários**: < 30 segundos

---

## 📞 Precisa de Ajuda?

1. Consulte **[PROFILE_MANAGEMENT.md](./PROFILE_MANAGEMENT.md)** para guia completo
2. Veja **[ADMIN_GUIDE.md](./ADMIN_GUIDE.md)** para administração avançada
3. Confira **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** para problemas comuns

---

## ✅ Checklist Rápido

### Para Operadores
- [ ] Acessei a aba Perfil
- [ ] Vi minhas informações
- [ ] Entendi minhas permissões
- [ ] Sei como solicitar upgrade para admin

### Para Admins
- [ ] Acessei a aba Perfil
- [ ] Vi o painel de gerenciamento
- [ ] Consigo ver todos os usuários
- [ ] Testei promover/rebaixar usuário
- [ ] Entendo as responsabilidades de admin

---

**🎉 Pronto! Você já sabe usar o sistema de Perfil e Permissões!**

*Para dúvidas, consulte a documentação completa ou contate o suporte técnico.*
