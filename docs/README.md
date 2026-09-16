# Documentação do SobraCorte

Este diretório concentra a documentação técnica e operacional do projeto. O arquivo `PLANO_EVOLUCAO_ARQUITETURAL.md`, mantido na raiz, governa a execução dos ciclos de refatoração.

## Documentos atuais

- [Plano de evolução arquitetural](../PLANO_EVOLUCAO_ARQUITETURAL.md): ordem dos ciclos, responsabilidades, critérios de conclusão e rollout.
- [Baseline e contratos do Ciclo 0](CICLO-0-BASELINE-E-CONTRATOS.md): checkpoint reproduzível, contratos compartilhados e especificação das fixtures de reconciliação.
- [Autenticação e autorização](AUTENTICACAO-E-AUTORIZACAO.md): token, contexto efetivo, RBAC local e administrador global.
- [Banco de dados e multi-tenancy](BANCO-DE-DADOS.md): guard tenant, chaves compostas e validação de isolamento.
- [README principal](../README.md): visão geral e início rápido.
- [Backend](../backend/README.md): referência atual do serviço enquanto a documentação especializada ainda não foi migrada para este diretório.

## Estrutura documental durante a refatoração

Os ciclos devem criar ou atualizar, quando o respectivo assunto for alterado:

- `ARQUITETURA.md`: componentes, limites e fluxos principais;
- `AUTENTICACAO-E-AUTORIZACAO.md`: provedores, sessão, identidade, RBAC e administradores globais;
- `BANCO-DE-DADOS.md`: modelos, multi-tenancy, migrations e reconciliação;
- `API.md`: contratos públicos vigentes;
- `DESENVOLVIMENTO-E-TESTES.md`: ambiente local, comandos e estratégia de validação;
- `IMPLANTACAO.md`: build, deploy, migrations, smoke tests e rollback.

Não crie documentação paralela na raiz. Ao adicionar um documento, inclua-o neste índice e mantenha o README principal apenas como portal resumido.
