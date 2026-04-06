Manual de Deploy: Sistema de Usuários e Segurança (SobraCorte)

Como essas alterações envolvem a estrutura do banco de dados de produção da fábrica, siga rigorosamente o passo a passo abaixo na ordem exata para garantirmos risco zero de perda de dados.
 FASE 1: No GitHub (Aprovação dos Pull Requests)

Como as funcionalidades foram desenvolvidas em sequência, você precisa aprovar os Pull Requests na ordem correta para não gerar conflitos na main:

    PR Passo 1: Localize e aprove o Pull Request da branch fix/seguranca-niveis-acesso (Refere-se à blindagem do Frontend). Faça o Merge dele na main.

    PR Passo 2: Em seguida, localize e aprove o Pull Request da branch feat/persistencia-usuarios-db (Refere-se à tabela de Usuários e Segurança da API). Faça o Merge dele na main.

FASE 2: No Servidor da DASS (Terminal)

Com o código unificado na main, acesse o terminal do servidor onde o backend do SobraCorte está rodando e execute os passos abaixo.

 ALERTA CRÍTICO DE BANCO DE DADOS: Sob nenhuma hipótese rode o comando npx prisma migrate dev no servidor. Isso tenta recriar o banco e apagará os materiais. Use apenas os comandos listados abaixo.

Passo a passo no terminal do servidor (dentro da pasta backend):

1. Baixar o código novo:

git pull origin main

2. Injetar a nova tabela no PostgreSQL (Modo Seguro):
Este comando vai ler o arquivo de migração e criar a tabela User no banco de dados sem encostar nas tabelas de Materiais.

npx prisma migrate deploy

3. Atualizar o motor do Node.js:
Este comando atualiza os binários do Prisma para o backend reconhecer a tabela nova.

npx prisma generate

4. Reiniciar a API:
Reinicie o serviço do Node.js para ele carregar as novas rotas de segurança (ajuste o comando abaixo conforme o gerenciador que você utiliza no servidor).

pm2 restart sobracorte-api