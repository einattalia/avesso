# Publicar AVESSO — contratos e equipe, versão 3

O ZIP contém `package.json`, `app`, `lib` e demais arquivos diretamente na raiz. Substitua os arquivos correspondentes do repositório conectado à Vercel, sem criar uma pasta externa adicional.

1. Execute `database/contracts-team-setup.sql` no SQL Editor do Supabase. Este SQL complementa `database/r2-setup.sql`, já fornecido na versão anterior.
2. Extraia o ZIP e envie todos os arquivos para a raiz do repositório. Inclua as novas páginas/componentes e as rotas `/api/files` e `/api/team`.
3. Faça commit no ramo `main` usado pela Vercel. Um Redeploy de commit antigo continuará usando código antigo.
4. Mantenha as variáveis cadastradas em Production. Não substitua seus valores pelos exemplos de `.env.example`. A nova versão usa as mesmas variáveis, incluindo `SUPABASE_SERVICE_ROLE_KEY` no servidor.
5. Confirme `R2_BUCKET_NAME=avesso-produtos` e a política CORS em `config/r2-cors.json` para `https://avesso-seven.vercel.app`.
6. Quando o novo deploy ficar Ready, siga os testes de uso em `INSTRUCOES-CONTRATOS-EQUIPE.md`.

A correção do JSX do Financeiro foi mantida. As pastas `fundacao-nextjs` e `html-standalone` são referências antigas; a aplicação fica na raiz.
