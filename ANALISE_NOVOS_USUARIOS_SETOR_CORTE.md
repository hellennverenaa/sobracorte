# Regra de acesso para novos usuários

## Situação atual

Usuários autenticados pelo `dass_auth` são sincronizados em um vínculo local
(`UserRoleBinding`). Quando não existe correspondência legada, o vínculo é
criado com o papel `leitor`, mas sem `assignedSector`.

O middleware de autenticação exige um setor específico para qualquer usuário
que não seja Admin Master. Por isso, uma conta autenticada e sem setor local
recebe `403` em rotas como:

- `/dashboard/summary`;
- `/requisitions/pending-count`;
- consultas de estoque e demais operações protegidas por setor.

O setor opcional exibido no DASS Identities não substitui o RBAC local do
SobraCorte.

## Regra proposta

Todo novo vínculo local não-global deve ser criado com:

```text
role = leitor
assignedSector = CORTE
```

No `syncUser`, a regra deve ser aplicada somente quando não houver uma
correspondência legada única:

```ts
assignedSector: legacyCandidates.length === 1
  ? legacyCandidates[0].assignedSector
  : 'CORTE'
```

## Comportamento preservado

- Admins globais continuam sem vínculo setorial.
- Vínculos existentes continuam preservando papel e setor.
- Usuários legados identificados de forma única continuam herdando o RBAC
  local já existente.
- Claims de papel ou setor vindos do provedor continuam sem autoridade para
  conceder permissões locais.

## Impactos

Um novo usuário passa a conseguir consultar dados do setor `CORTE` logo após a
sincronização. O papel `leitor` continua impedindo operações de alteração,
movimentações, aprovações e demais ações que exigem perfis superiores.

O acesso inicial fica limitado ao setor `CORTE`; não há concessão automática de
acesso multi-setor ou de Admin Master.

## Banco de dados

Nenhuma migration de schema é necessária. `assignedSector` deve continuar
opcional, pois Admin Master não precisa de setor e existem vínculos históricos
que podem permanecer sem setor.

Também não é recomendado adicionar `@default(CORTE)` no Prisma: o default deve
ser aplicado na criação do vínculo de usuário comum, sem alterar outros fluxos
de criação ou vínculos administrativos.

## Usuários já existentes

A nova regra não corrige automaticamente vínculos já criados com
`assignedSector = null`, porque o `upsert` preserva esses vínculos.

Para contas existentes, há duas opções operacionais:

1. atribuir `CORTE` pela tela de Usuários usando um Admin Master;
2. executar um backfill controlado somente para usuários não-admin sem setor.

O backfill não deve ser aplicado automaticamente sem confirmar se todos esses
usuários realmente podem consultar o setor `CORTE`.

## Testes necessários

- atualizar os testes de sincronização que esperam setor `null` para novos
  usuários;
- adicionar um caso explícito para `leitor + CORTE` no primeiro vínculo;
- manter os testes que garantem a preservação de vínculos existentes;
- manter os testes que verificam bloqueio de perfis comuns sem setor;
- validar que claims do `dass_auth` não alteram o papel ou setor local.

## Decisão pendente

Definir se a regra vale apenas para novos vínculos ou se também deve haver um
backfill dos usuários não-admin já existentes sem setor, incluindo contas que
atualmente retornam `403`.
