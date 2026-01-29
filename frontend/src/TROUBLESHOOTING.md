# 🔧 Guia de Solução de Problemas

Este guia ajuda a resolver problemas comuns no sistema SobraCorte.

---

## 🚨 Problemas de Autenticação

### ❌ "Credenciais inválidas" ao fazer login

**Sintomas:**
- Erro ao tentar fazer login
- Mensagem "Credenciais inválidas"

**Soluções:**
1. Verifique se o **email** está correto
2. Verifique se a **senha** está correta (case-sensitive)
3. Tente fazer **logout** e **login** novamente
4. Se esqueceu a senha, cadastre-se novamente com outro email

---

### ❌ "Email já cadastrado" ao registrar

**Sintomas:**
- Erro ao criar nova conta
- Email já existe no sistema

**Soluções:**
1. Use um **email diferente**
2. Tente fazer **login** com o email existente
3. Se não lembra a senha, cadastre outro usuário

---

### ❌ Redirecionado para login após autenticação

**Sintomas:**
- Faz login mas é redirecionado de volta para tela de login
- Sessão não persiste

**Soluções:**
1. Limpe o **localStorage** do navegador
2. Desabilite extensões de **bloqueio de cookies**
3. Tente em uma **aba anônima**
4. Verifique se o JavaScript está habilitado

---

## 📦 Problemas com Materiais

### ❌ Lista de materiais vazia

**Sintomas:**
- Dashboard mostra "0 materiais"
- Página de materiais está vazia

**Soluções:**
1. Clique em **"Popular Banco de Dados"** no Dashboard
2. Aguarde o processamento
3. Clique em **"Recarregar Página"**
4. Se persistir, faça logout e login novamente

---

### ❌ Busca não retorna resultados

**Sintomas:**
- Pesquisa não encontra materiais que existem

**Soluções:**
1. Limpe todos os **filtros** aplicados
2. Limpe o campo de **busca**
3. Verifique a **ortografia** do termo buscado
4. Use termos mais **genéricos** (ex: "jeans" em vez de "jeans índigo")
5. Recarregue a página

---

### ❌ Erro ao criar material

**Sintomas:**
- Formulário não é enviado
- Erro "Campos obrigatórios faltando"

**Soluções:**
1. Preencha **todos os campos obrigatórios**:
   - Código de Barras
   - Nome
   - Tipo
   - Quantidade
   - Unidade de Medida
2. Verifique se a quantidade é um **número válido**
3. Selecione um **tipo** da lista
4. Use apenas **caracteres permitidos** no código de barras

---

### ❌ Material não pode ser excluído

**Sintomas:**
- Clica em excluir mas nada acontece
- Erro ao deletar

**Soluções:**
1. Verifique se você está **autenticado**
2. Confirme a exclusão na caixa de diálogo
3. Recarregue a página e tente novamente
4. Faça logout e login novamente

---

## 🔄 Problemas com Movimentação

### ❌ "Estoque insuficiente para esta saída"

**Sintomas:**
- Erro ao registrar saída
- Quantidade solicitada é maior que disponível

**Soluções:**
1. Verifique o **estoque atual** do material
2. Reduza a **quantidade** da saída
3. Registre uma **entrada** antes da saída
4. Escolha outro material com estoque suficiente

**Isso é uma proteção!** O sistema não permite retirar mais do que existe.

---

### ❌ Movimentação não aparece no histórico

**Sintomas:**
- Registro foi criado mas não aparece
- Histórico não atualiza

**Soluções:**
1. **Recarregue** a página
2. Verifique se a movimentação foi realmente **confirmada**
3. Procure na lista de **transações** no Dashboard
4. Faça logout e login novamente

---

### ❌ Quantidade não foi atualizada

**Sintomas:**
- Movimentação registrada mas estoque não mudou
- Números não batem

**Soluções:**
1. **Recarregue** a página para ver dados atualizados
2. Verifique se a movimentação aparece no **histórico**
3. Confirme o tipo (ENTRADA vs SAIDA)
4. Se persistir, registre novamente

---

## 📊 Problemas no Dashboard

### ❌ Estatísticas mostrando zero

**Sintomas:**
- Todos os cards mostram "0"
- Estatísticas não carregam

**Soluções:**
1. Aguarde alguns segundos (pode estar carregando)
2. **Recarregue** a página
3. Popule o banco com dados de exemplo
4. Registre alguns materiais e movimentações

---

### ❌ "Movimentações Hoje" sempre zero

**Sintomas:**
- Card mostra 0 mesmo após registrar movimentações

**Soluções:**
1. Verifique se as movimentações foram feitas **hoje**
2. A contagem reseta à **meia-noite**
3. **Recarregue** a página
4. Fuso horário pode estar afetando (baseado em UTC)

---

## 🌐 Problemas de Conexão

### ❌ "Erro ao buscar dados" ou similar

**Sintomas:**
- Mensagens de erro ao carregar dados
- Timeout de requisições

**Soluções:**
1. Verifique sua **conexão com internet**
2. Tente **recarregar** a página
3. Aguarde alguns minutos (servidor pode estar ocupado)
4. Limpe o **cache** do navegador
5. Tente em outro navegador

---

### ❌ Página fica "Carregando..." infinitamente

**Sintomas:**
- Spinner de loading não para
- Conteúdo não carrega

**Soluções:**
1. Aguarde **30 segundos**
2. Recarregue a página (F5 ou Cmd+R)
3. Limpe o **cache** do navegador
4. Faça **logout** e **login** novamente
5. Verifique o **console** do navegador (F12) para erros

---

## 🎨 Problemas Visuais

### ❌ Layout quebrado ou desalinhado

**Sintomas:**
- Elementos sobrepostos
- Texto cortado
- Botões fora do lugar

**Soluções:**
1. **Recarregue** a página (pode ser cache)
2. Ajuste o **zoom** do navegador para 100%
3. Teste em outro **navegador**
4. Limpe o cache: Ctrl+Shift+Delete (ou Cmd+Shift+Delete)
5. Desabilite **extensões** do navegador

---

### ❌ Cores ou ícones não aparecem

**Sintomas:**
- Falta de ícones
- Cores padrão em vez das personalizadas

**Soluções:**
1. Aguarde o carregamento completo
2. Verifique se JavaScript está **habilitado**
3. Desabilite **bloqueadores de conteúdo**
4. Recarregue com Ctrl+F5 (força reload)

---

## 📱 Problemas Mobile

### ❌ Difícil de usar no celular

**Sintomas:**
- Botões muito pequenos
- Texto ilegível
- Menu não funciona

**Soluções:**
1. Use o navegador em **modo retrato**
2. Ajuste o **zoom** se necessário
3. Toque com **precisão** nos botões
4. Role a página para acessar conteúdo
5. Use o menu **hamburguer** se disponível

---

## 🔒 Problemas de Permissão

### ❌ "Não autorizado" em ações

**Sintomas:**
- Erro 401 ao criar/editar/excluir
- Acesso negado

**Soluções:**
1. Verifique se você está **logado**
2. Faça **logout** e **login** novamente
3. Token pode ter **expirado**
4. Verifique se seu usuário tem **permissão** (role)

---

## 🗄️ Problemas com Banco de Dados

### ❌ "Erro ao popular banco de dados"

**Sintomas:**
- Seed falha ao criar materiais
- Erro ao clicar em "Popular Banco"

**Soluções:**
1. Aguarde alguns segundos e tente novamente
2. Recarregue a página
3. Verifique sua conexão com internet
4. Se já populou antes, os dados já existem

---

### ❌ Dados duplicados

**Sintomas:**
- Materiais aparecem duas vezes
- IDs duplicados

**Soluções:**
1. **Recarregue** a página (pode ser cache local)
2. Limpe o localStorage
3. Se persistir, delete os duplicados manualmente
4. Evite clicar múltiplas vezes em "Salvar"

---

## 🖥️ Problemas Específicos do Navegador

### Chrome/Edge
- Limpar cache: `Ctrl+Shift+Delete`
- Modo anônimo: `Ctrl+Shift+N`
- Console: `F12`

### Firefox
- Limpar cache: `Ctrl+Shift+Delete`
- Modo privado: `Ctrl+Shift+P`
- Console: `F12`

### Safari
- Limpar cache: `Cmd+Option+E`
- Modo privado: `Cmd+Shift+N`
- Console: `Cmd+Option+C`

---

## 🆘 Quando Nada Funciona

Se você tentou todas as soluções acima:

1. ✅ **Recarregue** a página com Ctrl+F5
2. ✅ **Limpe** todo o cache e cookies
3. ✅ **Faça logout** e login novamente
4. ✅ Teste em **modo anônimo**
5. ✅ Teste em **outro navegador**
6. ✅ Reinicie o **computador**
7. ✅ Verifique se há **atualizações** do navegador

---

## 📞 Obtendo Ajuda

### Informações para fornecer ao suporte:

1. **Navegador e versão** (ex: Chrome 120)
2. **Sistema operacional** (ex: Windows 11)
3. **Mensagem de erro exata**
4. **Passos para reproduzir** o problema
5. **Screenshots** se possível
6. **Console do navegador** (F12 → Console tab)

### Como abrir o Console do Navegador:

1. Pressione **F12** (ou Cmd+Option+C no Safari)
2. Clique na aba **"Console"**
3. Procure mensagens em **vermelho** (erros)
4. Copie a mensagem de erro
5. Envie junto com sua solicitação de ajuda

---

## ✅ Checklist de Diagnóstico Rápido

Quando algo não funciona, teste nesta ordem:

- [ ] Recarreguei a página?
- [ ] Estou conectado à internet?
- [ ] Estou logado no sistema?
- [ ] Limpei filtros/busca?
- [ ] Tentei em modo anônimo?
- [ ] Tentei em outro navegador?
- [ ] Verifiquei o console (F12)?
- [ ] Li a mensagem de erro completa?

---

## 💡 Dicas de Prevenção

Para evitar problemas:

1. ✅ Faça **logout** antes de fechar o navegador
2. ✅ Não abra o sistema em **múltiplas abas**
3. ✅ Use um navegador **atualizado**
4. ✅ Não clique múltiplas vezes em botões
5. ✅ Aguarde o **carregamento completo** antes de agir
6. ✅ Mantenha uma **conexão estável** com internet

---

## 📚 Recursos Adicionais

- **README.md**: Documentação completa
- **QUICK_START.md**: Guia rápido de início
- **API_DOCUMENTATION.md**: Referência da API

---

**Última atualização**: Janeiro 2025  
**Versão**: 1.0.0
