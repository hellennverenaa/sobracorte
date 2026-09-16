# Autenticação e autorização

O SobraCorte aceita somente tokens assinados pelo provedor oficial. O token prova a identidade e a unidade nativa (`unidade` e `matricula`); ele não concede papel nem setor local.

## Contexto efetivo

Em cada requisição autenticada, o serviço resolve a unidade ativa e consulta o vínculo local persistido. Sem vínculo local, o contexto efetivo é `leitor` com setor `null`. Os claims `role` e `assignedSector` recebidos no JWT são ignorados para autorização.

`GLOBAL_ADMIN_IDENTITIES` é a única exceção. Seu formato público é uma lista separada por vírgulas de `UNIDADE:MATRICULA`, por exemplo `SEST:100,SAJ:200`. Uma identidade configurada pode selecionar outra unidade e recebe papel efetivo global `admin`; um papel gravado localmente nunca autoriza essa troca de unidade.

O bootstrap e a sincronização de usuários devem usar o cliente Prisma protegido no contexto da unidade ativa. O cliente sem guard é reservado a scripts internos explicitamente identificados, como seed, migration e smoke test.

## Regras para rotas

1. Aplique `requireAuth` antes de qualquer acesso a modelo tenant.
2. Aplique `requireRole` e, quando aplicável, `requireSectorMatch` usando apenas `effectiveContext`.
3. Não use valores de `req.user` como fallback de autorização: eles existem apenas como a cópia já sanitizada do contexto efetivo para compatibilidade temporária.

O contrato de separação física entre identidade e vínculo RBAC local pertence ao Ciclo 2.
