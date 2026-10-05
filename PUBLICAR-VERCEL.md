# Publicar AVESSO — versão 6

O ZIP contém a aplicação diretamente na raiz. Substitua os arquivos do repositório conectado à Vercel, sem adicionar uma pasta externa.

1. Execute `database/briefing-production-setup.sql` no Supabase, após os SQLs anteriores de R2 e contratos/equipe.
2. Envie os arquivos do ZIP à raiz do repositório e faça commit no ramo de produção, incluindo novas rotas e componentes.
3. Preserve as variáveis já configuradas. Confira `R2_BUCKET_NAME=avesso-producoes`, ou o nome exato do bucket autorizado pela sua chave atual.
4. Cadastre `APP_URL=https://avesso-seven.vercel.app` e mantenha `WHATSAPP_ENABLED=false` até configurar a Meta.
5. Salve as variáveis e publique o novo commit. Confira que o deploy fica Ready. Um Redeploy de código antigo não inclui estas mudanças.
6. Siga `INSTRUCOES-BRIEFING-WHATSAPP.md` para conferir as telas e ativar os avisos.

A aplicação fica na raiz; as subpastas de versões antigas são referências. As correções do Financeiro e os diagnósticos da finalização de arquivos foram preservados.
