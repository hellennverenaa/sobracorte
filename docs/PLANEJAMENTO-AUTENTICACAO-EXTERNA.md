# Planejamento e operação — autenticação externa por unidade

Status: implementação e validação local concluídas; publicação pendente.

Data do registro: 2026-09-11

Repositório: `sobracorte`

Branch: `feat/autenticacao-externa`

Este documento é o registro operacional da integração do SobraCorte com o
`dass_auth_service`. Ele descreve o que foi decidido, o que foi implementado,
as alterações de dados e os passos necessários para publicação. Não substitui
um backup, uma aprovação de mudança ou o runbook específico da infraestrutura.

## 1. Estado inicial e decisão aprovada

Antes desta funcionalidade, o SobraCorte usava o login legado para todas as
unidades. A unidade histórica `STJ` existia no schema `sobra_corte` e possuía
usuários e papéis locais. O serviço de autenticação mantinha o cadastro legado
em `autenticacao.usuarios`.

Foi aprovada a seguinte regra:

| Unidade selecionada | Autenticação | Cadastro |
| --- | --- | --- |
| `SEST` | Login Unix legado (`POST /auth/login`) | Portal Unix legado |
| Qualquer unidade diferente de `SEST` | Login externo (`POST /auth/external/login`) | Botão “Realizar cadastro” e modal |

O cadastro externo é feito no serviço de autenticação, não autentica o usuário
automaticamente e o primeiro login sincroniza uma identidade local no
SobraCorte com o papel `leitor`. A unidade escolhida no login é a unidade do
JWT e fica bloqueada no modal de cadastro.

`STJ` foi renomeada para `SAJ` sem trocar o identificador do tenant. Os
usuários locais e seus papéis de STJ são removidos intencionalmente; materiais,
saldos, movimentações, configurações, localizações e auditorias permanecem no
mesmo tenant. Registros de `autenticacao.usuarios` pertencem ao outro serviço
e não são alterados pela migration do SobraCorte.

## 2. Estado dos repositórios e commits

### SobraCorte

O branch partiu de `feature/multi-unidades` (`14966c7`) e contém os marcos de
implementação abaixo:

| Marco | Commit | Conteúdo |
| --- | --- | --- |
| Migration | `f7a9395952c893d0d5f826ec4f26a71e1aab4cc4` | Renomeia STJ para SAJ, preserva o ID e remove usuários locais |
| Backend | `9e7aad8ca456026ee82e19b80965a1b0c938ecfa9` | Aceita matrículas externas e mantém autorização por tenant |
| Login | `fa9faeabf3a0fa0a2b63b51383b6798660ff1566` | Seleciona endpoint e payload por unidade |
| Cadastro | `ad2f7ab752fdbe312bf1a4a1dda03586845c7c4f` | Adiciona modal e chamada de autocadastro externo |
| Testes | `b2fcbdeb95f00ab1676b57bec49034ce663924eb` | Amplia cobertura de login, cadastro, isolamento e migration |
| Documentação | este commit | Este planejamento, operação e rollback |

No momento do início deste marco, o HEAD do SobraCorte era
`b2fcbdeb95f00ab1676b57bec49034ce663924eb`. O hash final do commit de
documentação deve ser anotado no registro de entrega após o commit, pois um
commit não pode conter o próprio hash sem circularidade.

### Serviço de autenticação

O branch `feat/autenticacao-externa` do `enviroment/dass_auth_service` está em:

| Commit | Conteúdo |
| --- | --- |
| `489a4fb56bc83abb266da6fcbbc518c8766dc829` | Provisiona `SAJ` com nome `Santo Antônio de Jesus`, ativa e com autocadastro habilitado |

Esse branch estava um commit à frente de
`origin/feat/autenticacao-externa` (`a514e20188e0707782ddec2568941213ef1d5b2b`)
no registro deste documento. Nenhum push é feito como parte deste marco; a
entrega final deve publicar os branches autorizados na ordem definida pelo
responsável da mudança.

## 3. Fluxos implementados

### SEST — legado

1. O frontend carrega as unidades ativas em `GET /factory-units`.
2. Para `SEST`, chama `POST /auth/login` com `{ usuario, senha }`.
3. O token recebido é enviado a `POST /auth/check-user` no backend com
   `X-Dass-Unit: SEST`.
4. O backend valida o JWT, confirma o tenant e sincroniza a identidade local.
5. Refresh e logout continuam usando os fluxos existentes.

O rótulo de usuário é “Usuário Unix”, o texto auxiliar menciona credenciais
Unix e o Portal Unix fica visível somente para esta unidade.

### SAJ e demais unidades externas

1. Para qualquer código diferente de `SEST`, o frontend chama
   `POST /auth/external/login` com `{ unidade, usuario, senha }`.
2. O token externo é enviado a `POST /auth/check-user` com a unidade selecionada.
3. O backend normaliza a matrícula como string alfanumérica, mantém a chave
   local `(factoryUnitId, usuario)` e cria um novo usuário como `leitor`.
4. Matrículas alfanuméricas nunca são administradores globais. Matrículas
   numéricas só têm esse privilégio quando são positivas, seguras, configuradas
   em `GLOBAL_ADMIN_REGISTRATIONS` e reconhecidas pelo backend.
5. Matrículas numéricas dentro do `BIGINT` positivo são persistidas em
   `matriculaDass`; demais matrículas usam `NULL` nessa coluna.
6. Refresh, logout e isolamento de tenants continuam passando pelo mesmo
   mecanismo de sessão e autorização.

O rótulo passa a ser “Usuário”, o texto auxiliar menciona as credenciais da
unidade e o Portal Unix fica oculto. Um valor `STJ` salvo no navegador é
descartado quando não aparece no retorno de `/factory-units`; a seleção passa
para uma unidade disponível, normalmente `SAJ`.

### Cadastro externo

O botão aparece sempre que `selectedUnit !== 'SEST'`. O modal envia para
`POST /auth/external/register`:

```json
{
  "matricula": "A001X",
  "nome": "Nome da Pessoa",
  "unidade": "SAJ",
  "usuario": "NOME.USUARIO",
  "senha": "senha-segura",
  "setor": "Produção",
  "funcao": "Operador"
}
```

Unidade, matrícula, nome, usuário e senha são obrigatórios; setor e função são
opcionais. A senha tem mínimo de oito caracteres, a confirmação precisa
coincidir e nenhum campo de senha é persistido ou registrado. A unidade é
visível, somente leitura e não pode ser digitada.

Em `201`, o modal fecha, o usuário é preenchido no login, as senhas são limpas
e o usuário é orientado a entrar normalmente. O frontend trata `400`, `403`,
`409`, `500` e falha de rede com mensagens controladas. O botão continua
visível para toda unidade não-SEST; se o auth service não permitir autocadastro,
o `403` é mostrado ao usuário.

## 4. Migration STJ → SAJ

Arquivo: `backend/prisma/migrations/20260911120000_rename_stj_to_saj/migration.sql`.

A migration:

1. localiza `FactoryUnit.code = 'STJ'`;
2. falha com mensagem explícita se `SAJ` já existir enquanto `STJ` ainda existe;
3. remove somente `sobra_corte.User` vinculado ao ID de STJ;
4. altera o código para `SAJ` e o nome para `Santo Antônio de Jesus`;
5. preserva o mesmo `FactoryUnit.id`;
6. é no-op quando STJ já não existe e SAJ está presente.

Ela não altera `autenticacao.usuarios`, não recria o tenant e não remove
`Material`, `MaterialLocation`, `Movement`, `MaterialDeletionAudit`,
`RoleChangeAudit`, `UnitConfig`, `CategoryConfig`, `OriginConfig`, `Location`
ou `LocationCategory`.

Antes de aplicar em qualquer banco, faça backup lógico do schema
`sobra_corte` e registre, em local operacional protegido, somente IDs e
contagens de usuários, materiais, saldos, movimentações, configurações,
localizações e auditorias. Não registre senhas, hashes, JWTs ou refresh tokens.

No estado desta documentação, a migration do SobraCorte ainda não foi aplicada
ao PostgreSQL local. Portanto, a renomeação e a preservação dos dados ainda
precisam de validação em banco real antes da implantação.

## 5. Inclusão de novas unidades

Toda unidade deve existir com o mesmo código nos dois domínios:

| Domínio | Responsabilidade |
| --- | --- |
| `autenticacao.unidades` | Login, atividade e autocadastro |
| `sobra_corte.FactoryUnit` | Seletor, tenant e dados operacionais |

Não há migration cruzada entre serviços. Para incluir uma unidade:

1. crie e teste a migration no auth service;
2. crie e teste a migration no SobraCorte;
3. aplique primeiro no auth service;
4. confirme unidade ativa e política de autocadastro;
5. aplique no SobraCorte e confirme o tenant;
6. publique backend e frontend na mesma janela;
7. configure categorias, localizações, origens e permissões;
8. valide cadastro, login, `/auth/check-user`, refresh, logout e isolamento.

## 6. Testes e evidências

### Cobertura versionada

Os marcos adicionaram cobertura para:

- `backend/tests/auth.test.ts`: matrículas vazias, alfanuméricas, numéricas,
  limite de `BIGINT`, administração global, sincronização como leitor e
  isolamento por unidade;
- `backend/tests/migration-saj.test.ts`: código, nome, ID, remoção limitada a
  usuários, preservação de dados e conflito/idempotência;
- `frontend/tests/login-flow.test.js`: endpoint, payload, unidade legada e
  descarte de `STJ` salvo;
- `frontend/tests/external-registration.test.js`: payload, validação,
  confirmação, endpoint e respostas HTTP/rede.

Comandos previstos para a validação da entrega:

```sh
npm --prefix backend test
npm --prefix backend run build
node --test frontend/tests/*.test.js
npm --prefix frontend run build
git diff --check
```

Os testes de unidade e de helpers não substituem um banco PostgreSQL, Redis,
serviço auth e Gateway reais. O status de cada execução deve ser anexado ao
registro de mudança sem transformar uma cobertura estática em aprovação de
produção.

### Validação local concluída

Em 2026-09-11, após backup lógico dos schemas `autenticacao` e `sobra_corte`,
as migrations foram aplicadas no PostgreSQL Docker local. A unidade de ID `2`
mudou de `STJ` para `SAJ`; o usuário local antigo foi removido e as contagens
de configurações foram preservadas (`CategoryConfig`: 3, `OriginConfig`: 8 e
`UnitConfig`: 11). O banco de teste não possuía materiais, saldos,
movimentações, localizações ou auditorias para esse tenant.

O auth service foi reconstruído com a branch atual. Cadastro, login,
`/auth/me`, refresh e logout passaram diretamente e pelo Gateway, com `201` no
cadastro e `200` nas demais operações. Um primeiro login adicional passou por
`/auth/check-user` e criou a identidade local SAJ com papel `leitor`.

Também passaram 60 testes backend, os testes frontend com o runner nativo do
Node, os builds backend/frontend e `git diff --check`. Esses resultados são de
ambiente local e não substituem a validação da implantação no ambiente de
destino.

## 7. Implantação

Execute em janela aprovada, com operador de banco, responsável pelo auth,
responsável pelo backend/frontend e responsável pelo Gateway disponíveis.

1. Faça backup lógico dos schemas `autenticacao` e `sobra_corte` e registre os
   checksums em local protegido.
2. Aplique e valide as migrations do auth service. Confirme `SAJ` ativa e com
   `permite_autocadastro = TRUE` somente quando o piloto estiver autorizado.
3. Registre usuários e papéis locais de STJ antes de executar a migration do
   SobraCorte.
4. Aplique `npx prisma migrate deploy` no SobraCorte e confirme: `STJ` ausente,
   `SAJ` presente com o mesmo ID, usuários locais antigos ausentes e contagens
   operacionais preservadas.
5. Publique backend e frontend juntos. Confirme `/factory-units`, login SEST,
   login SAJ, `/auth/check-user`, `/auth/me`, refresh e logout.
6. Cadastre uma conta SAJ de validação pelo endpoint direto e pelo Gateway.
   Confirme que o primeiro login cria `leitor` e não herda papel antigo.
7. Revalide isolamento entre SAJ e SEST e monitore `401`, `403`, duplicidades,
   sincronização e erros de Redis.

Use os endpoints relativos do frontend/proxy em produção. O Gateway deve
encaminhar `/api/auth/login` para `/auth/login`, `/api/auth/external/login`
para `/auth/external/login` e `/api/auth/external/register` para
`/auth/external/register`.

## 8. Rollback

Em falha de piloto:

1. desabilite `permite_autocadastro` de SAJ no auth service;
2. se necessário, desative a unidade conforme o procedimento operacional;
3. volte backend e frontend para as imagens anteriores;
4. preserve usuários externos e as tabelas novas do auth para investigação;
5. restaure usuários e papéis locais a partir do backup somente se a operação
   aprovar a recuperação;
6. só renomeie SAJ para STJ depois de confirmar que nenhum cliente novo depende
   de SAJ;
7. não execute `DROP TABLE`, rollback destrutivo ou restauração ampla sem
   delimitar o alvo e verificar os dados.

A migration remove usuários locais de STJ de forma intencional e não oferece
um rollback automático seguro desses registros. O backup lógico dos schemas é
o caminho para recuperar papéis antigos. Access tokens já emitidos podem
permanecer válidos até seu TTL; desativar a unidade impede novos logins e
refreshes, mas a revogação imediata deve usar o mecanismo aprovado do auth.

## 9. Critérios de aceite

- SEST mantém login Unix, Portal Unix, refresh e logout.
- SAJ aparece no seletor e STJ deixa de aparecer.
- Toda unidade não-SEST usa login externo e mostra o cadastro.
- Cadastro SAJ não autentica automaticamente e o primeiro login cria `leitor`.
- Matrículas alfanuméricas funcionam sem ampliar privilégio global.
- O tenant mantém o ID e seus dados operacionais após a migration.
- Usuários e papéis locais antigos de STJ não são reutilizados em SAJ.
- Login, `/auth/me`, refresh, logout e isolamento funcionam diretamente e pelo
  Gateway.
- Suítes, builds, `git diff --check` e smoke real têm resultados registrados.
- Cada marco possui commit próprio; nenhum push ocorre sem autorização explícita.
