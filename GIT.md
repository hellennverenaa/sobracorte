# Padrão de Desenvolvimento com Git

Este documento define o fluxo de Git utilizado pela equipe.

O objetivo é permitir que dois desenvolvedores trabalhem simultaneamente em features diferentes, mantendo a `main` atualizada e reduzindo conflitos durante a integração.

---

## 1. Regra principal

A branch `main` representa a versão integrada e estável mais recente do projeto.

- Não desenvolver diretamente na `main`.
- Cada feature deve possuir sua própria branch.
- Features concluídas entram na `main` através de Pull Request.
- Antes de integrar uma feature, ela deve estar atualizada em relação à `main`.
- Após uma feature entrar na `main`, os outros desenvolvedores devem verificar se precisam atualizar suas branches.

---

## 2. Iniciando uma nova feature

Primeiro, atualizar a `main` local:

```bash
git switch main
git pull
```

Criar a branch da feature:

```bash
git switch -c feature/nome-da-feature
```

Exemplos:

```bash
git switch -c feature/login
git switch -c feature/clientes
git switch -c feature/relatorios
```

Sempre criar uma nova feature a partir da `main` atualizada.

---

## 3. Durante o desenvolvimento

Trabalhar normalmente na branch da feature.

Verificar alterações:

```bash
git status
```

Adicionar arquivos:

```bash
git add .
```

Criar commit:

```bash
git commit -m "feat(auth): implementa login"
```

Enviar a branch para o GitHub:

```bash
git push
```

No primeiro push pode ser necessário:

```bash
git push -u origin feature/nome-da-feature
```

Preferimos commits pequenos e objetivos.

Exemplos:

```text
feat(auth): implementa login
feat(clientes): adiciona cadastro de clientes
fix(auth): corrige validação do token
refactor(clientes): reorganiza serviço de clientes
```

---

## 4. Verificando se a main foi atualizada

Enquanto estiver trabalhando em uma feature, não é necessário sair da branch para verificar a `main`.

Execute:

```bash
git fetch origin
```

Esse comando atualiza as informações do repositório remoto sem modificar os arquivos da feature atual.

Para visualizar commits da `main` que ainda não estão na sua branch:

```bash
git log HEAD..origin/main --oneline
```

Exemplo:

```text
92ca172 feat(clientes): adiciona cadastro de clientes
3af17bc fix(auth): corrige expiração do token
```

Isso significa que a `main` possui alterações que ainda não estão presentes na sua branch.

Se nenhum commit aparecer, sua branch já contém as alterações atuais da `main`.

---

## 5. Atualizando a feature com a main

Quando houver mudanças importantes na `main`, atualizar a feature:

```bash
git fetch origin
git rebase origin/main
```

O objetivo é colocar os commits da feature sobre a versão mais recente da `main`.

Antes:

```text
main       A──B──C
            \
feature     D──E
```

Depois:

```text
main       A──B──C
                  \
feature            D'──E'
```

Se não houver conflitos, o processo termina automaticamente.

---

## 6. Quando houver conflito no rebase

O Git informará quais arquivos possuem conflitos.

Verificar:

```bash
git status
```

Resolver manualmente os arquivos indicados.

Depois de resolver:

```bash
git add .
git rebase --continue
```

Se surgirem outros conflitos, repetir:

```bash
git status
```

Resolver os arquivos e executar novamente:

```bash
git add .
git rebase --continue
```

Caso seja necessário cancelar todo o rebase:

```bash
git rebase --abort
```

A branch voltará ao estado anterior ao início do rebase.

---

## 7. Push depois de um rebase

O `rebase` altera o histórico dos commits.

Se a branch já havia sido enviada ao GitHub, o push normal pode ser recusado.

Nesse caso:

```bash
git push --force-with-lease
```

Usar:

```bash
--force-with-lease
```

e não:

```bash
--force
```

Nunca fazer force push na `main`.

---

## 8. Finalizando uma feature

Antes de abrir o Pull Request:

### 1. Buscar atualizações

```bash
git fetch origin
```

### 2. Atualizar a feature

```bash
git rebase origin/main
```

### 3. Executar os testes do projeto

Garantir que a aplicação continua funcionando.

### 4. Enviar as alterações

Se não houve rebase de uma branch já publicada:

```bash
git push
```

Se o histórico foi alterado pelo rebase:

```bash
git push --force-with-lease
```

### 5. Abrir Pull Request

```text
feature/nome
       ↓
Pull Request
       ↓
Revisão pelo outro desenvolvedor
       ↓
Testes
       ↓
Merge
       ↓
main
```

---

## 9. Revisão

Sempre que possível, o outro desenvolvedor revisa o Pull Request.

Verificar principalmente:

- comportamento da feature;
- alterações inesperadas;
- código duplicado;
- possíveis bugs;
- arquivos modificados sem necessidade;
- impacto em outras partes do sistema.

Para mudanças muito pequenas, a revisão pode ser simples.

O objetivo não é criar burocracia, mas evitar que problemas cheguem à `main`.

---

## 10. Depois do merge

Quando uma feature entrar na `main`, o outro desenvolvedor não precisa interromper imediatamente o trabalho.

Quando for conveniente, execute:

```bash
git fetch origin
```

E verifique o que mudou:

```bash
git log HEAD..origin/main --oneline
```

Se as mudanças puderem afetar sua feature, sincronize:

```bash
git rebase origin/main
```

Quanto antes um conflito relevante for identificado, mais fácil será resolvê-lo.

---

## 11. Exemplo com dois desenvolvedores

```text
                    ┌── feature/login ───── Dev A
                    │
main ───────────────┤
                    │
                    └── feature/clientes ── Dev B
```

Dev A termina primeiro:

```text
feature/login
      ↓
     PR
      ↓
Dev B revisa
      ↓
    merge
      ↓
    main
```

Agora Dev B verifica as alterações:

```bash
git fetch origin
git log HEAD..origin/main --oneline
```

Se necessário:

```bash
git rebase origin/main
```

Dev B continua trabalhando e posteriormente:

```text
feature/clientes
       ↓
      PR
       ↓
Dev A revisa
       ↓
     merge
       ↓
     main
```

---

## 12. Evitar branches muito longas

Preferimos:

```text
main ──●────●────●────●────●──→
       ↑    ↑    ↑    ↑
      PR   PR   PR   PR
```

Evitar:

```text
main ──●────────────────────────●
        \                      /
         feature enorme ──────
```

Se uma feature estiver ficando muito grande, avaliar se ela pode ser dividida em entregas menores.

Branches menores reduzem conflitos e tornam Pull Requests mais fáceis de revisar.

---

## 13. Divisão do trabalho

Sempre que possível, dividir features para minimizar alterações simultâneas nos mesmos arquivos.

Preferível:

```text
DEV A                    DEV B

Autenticação             Clientes
├── AuthController       ├── ClientController
├── AuthService          ├── ClientService
└── LoginPage            └── ClientPage
```

Evitar situações em que os dois desenvolvedores precisam modificar constantemente os mesmos arquivos.

Quando duas features dependerem uma da outra, combinar previamente interfaces, APIs ou contratos entre elas.

---

## 14. Resumo dos comandos

### Começar uma feature

```bash
git switch main
git pull
git switch -c feature/nome
```

### Trabalhar

```bash
git status
git add .
git commit -m "feat(escopo): descrição"
git push
```

### Verificar mudanças na main

```bash
git fetch origin
git log HEAD..origin/main --oneline
```

### Atualizar a feature

```bash
git fetch origin
git rebase origin/main
```

### Resolver conflito

```bash
git status

# resolver arquivos

git add .
git rebase --continue
```

### Cancelar rebase

```bash
git rebase --abort
```

### Atualizar branch remota depois de rebase

```bash
git push --force-with-lease
```

---

## Fluxo da equipe

```text
Atualizar main
      ↓
Criar feature
      ↓
Desenvolver
      ↓
Commits pequenos
      ↓
git fetch origin
      ↓
Verificar atualizações da main
      ↓
git rebase origin/main
      ↓
Testar
      ↓
Push
      ↓
Pull Request
      ↓
Revisão do outro desenvolvedor
      ↓
Merge
      ↓
main atualizada
      ↓
Próxima feature
```

**Princípio:** manter a `main` estável, integrar frequentemente e resolver divergências enquanto ainda são pequenas.