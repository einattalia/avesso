# Validação — versão 3, 5 de outubro de 2026

## Verificações locais

- 30 testes automatizados aprovados: autorização, isolamento de organização/contrato, salvamento e leitura do texto, tipos e limites de anexos, leitura por chave confiável, finalização idempotente, equipe e seleção de responsáveis, unificação das artes, uploads de produção, retries e retomada. O resultado final consta na entrega da conversa.
- O código real das rotas e de autorização é executado com serviços externos substituídos. A transação PostgreSQL fornecida não foi executada no banco real.
- Os arquivos da aplicação foram transformados pelo compilador SWC do próprio Next.js para verificar sintaxe, incluindo os novos componentes. A correção do fechamento JSX do Financeiro foi preservada.
- O build completo com Next.js 16.3.8/Webpack foi tentado e bloqueado por `EPERM` ao criar a pasta gerada `server/app/_global-error` neste ambiente. Isso impede confirmar o build completo desta revisão. A Vercel deve concluir essa verificação após o envio do novo código.
- Dependências fixadas e lockfile incluído. Verificação local com Node 24.19.0; o projeto declara Node 22.x para Vercel.
- ZIP conferido quanto à integridade e ao conteúdo. Não inclui credenciais locais, dependências instaladas ou pastas de build.

## Verificação pendente na conta do usuário

Execute `database/contracts-team-setup.sql` e siga `INSTRUCOES-CONTRATOS-EQUIPE.md` após publicar. Não houve login administrativo, alteração remota de dados, upload ao R2 real nem publicação de deploy por este trabalho. O acesso das tabelas existentes continua dependendo das políticas RLS já configuradas no seu projeto.

O ZIP contém arquivos diretamente na raiz, SQL, guias, testes e exemplos. Bucket e CORS usam `avesso-produtos` e `https://avesso-seven.vercel.app`. Nenhuma configuração temporária de verificação faz parte do pacote.

