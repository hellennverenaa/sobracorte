# Autenticação e autorização

O SobraCorte aceita somente tokens assinados pelo provedor oficial. O token prova a identidade e a unidade nativa (`unidade` e `matricula`); ele não concede papel nem setor local.

## Contexto efetivo

Em cada requisição autenticada, o serviço resolve a unidade ativa e consulta o vínculo local persistido. Sem vínculo local, o contexto efetivo é `leitor` com setor `null`. Os claims `role` e `assignedSector` recebidos no JWT são ignorados para autorização.

`GLOBAL_ADMIN_IDENTITIES` é a única exceção. Seu formato público é uma lista separada por vírgulas de `UNIDADE:MATRICULA`, por exemplo `SEST:100,SAJ:200`. Uma identidade configurada pode selecionar outra unidade e recebe papel efetivo global `admin`; um papel gravado localmente nunca autoriza essa troca de unidade.

O bootstrap consulta `AuthIdentity` pela chave completa de unidade nativa, origem e ID estável. O vínculo usa o cliente protegido no contexto da unidade ativa. O cliente sem guard é reservado a scripts internos explicitamente identificados, como seed, migration e smoke test.

## Regras para rotas

1. Aplique `requireAuth` antes de qualquer acesso a modelo tenant.
2. Aplique `requireRole` e, quando aplicável, `requireSectorMatch` usando apenas `effectiveContext`.
3. Não use valores de `req.user` como fallback de autorização: eles existem apenas como a cópia já sanitizada do contexto efetivo para compatibilidade temporária.

## Identidade e vínculo local (Ciclo 2)

`AuthIdentity` é identificada por unidade nativa, origem e ID estável do provedor. `UserRoleBinding` guarda papel e setor por unidade ativa. O header `X-Dass-Unit` nunca muda a unidade nativa. No primeiro login comum é criado, no máximo, o vínculo da unidade nativa; administrador global não cria vínculo na unidade visitada.

O bootstrap usa upserts protegidos por chaves únicas. Atualizações posteriores sincronizam apenas dados cadastrais da identidade e fazem update vazio no vínculo, preservando papel e setor locais. Uma identidade de origem diferente nunca herda RBAC por coincidência de matrícula ou nome de usuário.

Listagem, edição e exclusão em `/users` operam sobre vínculos da unidade ativa. Excluir um vínculo não exclui a identidade. Auditorias guardam snapshots do usuário e, enquanto o vínculo existir, `bindingId` permite rastreá-lo; a navegação de administrador global usa os dados da identidade e não exige vínculo local.
