# Autenticação e DASS Identidades

## Fronteiras

- `SEST` continua em `POST /auth/login` pelo fluxo Unix legado.
- Unidades externas usam somente `POST /auth/external/login`.
- Cadastro, aprovação, perfil e recuperação pertencem ao DASS Identidades em `/identities`.
- Papéis do Sobracorte são locais e independentes da administração de identidades.

## Frontend

`VITE_DASS_IDENTITIES_URL` é obrigatória e contém a base completa, incluindo
`/identities`, sem barra final:

```env
VITE_DASS_IDENTITIES_URL=http://localhost:5173/identities
```

**Solicitar conta** abre `${VITE_DASS_IDENTITIES_URL}/register?unidade=<UNIDADE>`.
Não há `return_to`, senha persistida ou chamada de cadastro pelo Sobracorte.

## Provisionamento

O backend usa `factoryUnitId + authOrigin + authUserId` como chave estável. No
primeiro login, tenta vincular um perfil ainda não associado da mesma unidade
por matrícula ou usuário. Sem perfil anterior, cria um usuário `leitor`.
Logins seguintes preservam o papel e sincronizam os dados cadastrais.

## Implantação

1. Configure a URL do portal antes do build do frontend.
2. Execute `prisma migrate deploy` e `prisma generate` no backend.
3. Construa backend e frontend.
4. Verifique o login SEST, o redirecionamento externo e o primeiro login externo.
