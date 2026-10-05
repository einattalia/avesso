# Publicar a versão corrigida do AVESSO

Este ZIP abre diretamente nos arquivos do projeto: `package.json`, `app`, `lib`, `database` e outras pastas. Substitua os arquivos correspondentes na raiz do repositório conectado à Vercel. Não crie uma pasta adicional `avesso-main` dentro de uma raiz que já contém o `package.json` do aplicativo.

1. Extraia o ZIP.
2. Envie todos os arquivos extraídos para a raiz do repositório do AVESSO, substituindo os anteriores. Inclua `package.json`, `package-lock.json`, toda a pasta `app` e a nova pasta `lib`.
3. Faça commit no ramo `main` usado pela Vercel. A Vercel iniciará uma compilação da versão nova. Um Redeploy de um commit antigo continuará usando o código antigo.
4. Mantenha as variáveis já cadastradas na Vercel em Production. Não as substitua pelos exemplos de `.env.example`.
5. Confirme `R2_BUCKET_NAME=avesso-produtos`, conforme o bucket criado nesta conversa.
6. O arquivo `config/r2-cors.json` está preenchido para `https://avesso-seven.vercel.app` e para desenvolvimento local. Salve essa política no bucket se ainda não tiver feito isso.
7. Se o SQL do pacote anterior foi executado com sucesso, os objetos de banco correspondentes já estão preparados. O pacote atual não adiciona outra alteração SQL.
8. Depois de o deploy ficar Ready, teste um arquivo pequeno em Cliente → Produção → demanda → Enviar nova versão e confira sua presença no R2.

## Erro corrigido

Os logs enviados repetiam um único erro: fechamento incorreto da função `rows.map` na lista financeira de `app/page.js`. O bloco foi corrigido e organizado em várias linhas, com fechamento explícito da função e do JSX. A integração R2, as funções de negócio e os estilos foram mantidos.

As pastas `fundacao-nextjs` e `html-standalone` continuam sendo referências antigas. O aplicativo de produção está na raiz.
