# Catálogo fixo de unidades

`GET /settings/units` retorna `{ symbol, name, integerOnly, decimalPlaces }`.
Não existem endpoints de escrita de unidades. Categorias usam `defaultUnitCode`
(código canônico ou `null`) e `unitLocked`; bloquear exige selecionar uma unidade.

UN, PAR, CX e ROLO exigem inteiros. M, M², CM, L, G e KG aceitam até três
casas decimais. Setores de peças continuam exigindo inteiros. Aliases conhecidos
(incluindo UND e peças) são normalizados, sem conversão de quantidades.
Snapshots históricos são preservados; seus símbolos são normalizados na leitura.

## Migração

Antes da migration `20260918120000_fixed_unit_catalog`, faça backup e restaure
em um clone isolado. No backend apontado para esse clone, execute:

```sh
npm run stock:units:audit
```

A auditoria é somente leitura. Antes da remoção de `UnitConfig`, ela resume aliases
e referências legadas de categorias e lista cada inconsistência por ID. Depois da
migração, o mesmo comando detecta automaticamente o schema atual e verifica
`StockItem`, `StockItemLocation` e `CategoryConfig` sem consultar a tabela removida.
Símbolos desconhecidos, frações incompatíveis e categorias bloqueadas sem unidade
definida bloqueiam a validação. Revise cada ocorrência; não arredonde ou deduza
equivalências.

## Catálogo inicial de fábricas

O seed usa `KG` como unidade canônica para a categoria `LINHA`. `G` continua
válida no catálogo técnico, mas não é convertida automaticamente para `KG`:
saldo, histórico, relatórios e troca de unidade tratam `G` e `KG` como unidades
distintas. Registros existentes em `G` devem ser auditados e convertidos somente
por decisão operacional explícita.

A migration é transacional: normaliza apenas símbolos, transfere os padrões de
categorias para códigos, transforma unitLock m2/m em padrão bloqueado e remove
UnitConfig e os campos antigos. Não altera saldos, mínimos ou snapshots.
Código e schema precisam ser implantados juntos. A implantação e a remoção da
tabela em produção exigem autorização específica.

Após migrar o clone, execute os builds, os testes afetados e `npm run stock:integrity`.
Os testes DB usam exclusivamente banco local `sobracorte_cycle7_*`, com
`DATABASE_URL` e `TEST_DATABASE_URL` iguais.
