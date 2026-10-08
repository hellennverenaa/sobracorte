# Correções aprovadas e revalidação — 08/10/2026

Após o OK do usuário, foram corrigidos os cinco achados de REPORT.md.

| Achado | Correção | Revalidação |
| --- | --- | --- |
| UA-01 | Alias SQL da unidade vira identificador confiável; setor continua parametrizado. | Dashboard e inbox do Admin de Setor abriram com dados reais da unidade sintética, sem erro HTTP; regressão verifica os quatro aliases. |
| UA-02 | PostgreSQL calcula a chave com a mesma expressão da constraint, preservando acentos. | Cadastro pelo navegador de `QA Revisão Café 20261008`; consulta posterior confirmou `QA_REVISÃO_CAFÉ_20261008` no banco. |
| UA-03 | Campo origem deixa de ser obrigatório na validação HTML. | Entrada `QA-OPTIONAL-FIX` salva pelo navegador sem origem selecionada; consulta posterior confirmou saldo 0.125. Regressão verifica validade nativa do formulário e envio vazio. |
| UA-04 | Leitor mantém consulta de requisições, sem botão Nova Solicitação nem carregamento do catálogo restrito. | Inbox carregou no navegador sem erro HTTP; regressão confirma ausência do botão e da consulta a categorias. |
| UA-05 | Rótulo de atendimento usa a unidade da requisição e mantém Pares Completos para PAR. | Requisição pendente de SINTETICO abriu modal com `QUANTIDADE A ATENDER / BAIXAR (M²)`. Não foi realizada nova baixa nesta revalidação. |

## Verificações executadas

- Build backend + frontend: aprovado.
- Backend: cinco arquivos direcionados, 40 testes aprovados; posteriormente arquivo subsectorAccess repetido com nova regressão acentuada, 12 testes aprovados (41 casos distintos no conjunto).
- Frontend: quickEntry.component.test.js e requisitions.component.test.js aprovados, incluindo regressões de origem opcional e Leitor.
- Navegador Chromium real, servidor local e PostgreSQL no clone `sobracorte_user_acceptance_20261008`. Autenticação externa simulada; JWT e permissões da aplicação reais.
- Evidências: sobracorte-fixes-browser.json, sobracorte-fixes-forms.json e sobracorte-fixes-fulfill.png.

Não foi acrescentada migration nem alterado o banco de produção. Para estas correções de código é necessário publicar **backend e frontend**. O procedimento de migrations da atualização original continua separado.

As limitações e falhas preexistentes descritas no relatório original continuam válidas. Esta revalidação confirma os cinco cenários; não equivale a aprovação de todas as funcionalidades, concorrência ou integração com o provedor externo. Alterações anteriores do workspace foram preservadas. Nenhum commit ou deploy foi feito nesta etapa.
