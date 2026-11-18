# Conexão do Instagram por cliente

O botão aparece no cabeçalho do Cliente 360°. Cada conexão é autorizada pela conta profissional do Instagram e fica associada somente ao cliente selecionado. A versão atual aceita uma conta do Instagram por cliente.

## Meta for Developers

1. Use o app **Avesso**, do tipo Empresa, vinculado ao portfólio empresarial da agência.
2. Em **Instagram → API setup with Unified Login**, crie uma configuração de login e mantenha o ID da configuração.
3. Na configuração, solicite acesso somente à conta profissional do Instagram e às permissões necessárias para perfil e insights: `instagram_basic` e `instagram_manage_insights`. Não solicite permissões de anúncios, publicação, comentários ou mensagens para relatórios de métricas.
4. Registre esta URI de redirecionamento, exatamente:
   `https://portalavesso.com.br/api/instagram/callback`
5. Para testar enquanto o app estiver em desenvolvimento, conecte uma conta autorizada como função/testadora do app. Para clientes externos, conclua a análise da Meta e obtenha acesso avançado para as permissões necessárias. A verificação empresarial pode ser exigida pela Meta.
6. O Instagram conectado precisa ser uma conta profissional Business ou Creator. Se o cliente tiver mais de uma conta profissional disponível no login, selecione apenas a conta que deseja vincular àquele cadastro.

O fluxo Unified Login usa o Facebook Login for Business com o ID da configuração; a Avesso constrói a URL de login a partir do App ID, Configuration ID, callback e do parâmetro `state`. Não use o endpoint antigo `instagram.com/oauth/authorize`.

## Vercel

Configure estas variáveis no ambiente de produção e nos previews usados para testes:

- `APP_URL=https://portalavesso.com.br`
- `META_INSTAGRAM_APP_ID`: ID do app Meta.
- `META_INSTAGRAM_APP_SECRET`: segredo do app; mantenha no servidor, sem prefixo `NEXT_PUBLIC_`.
- `META_INSTAGRAM_CONFIG_ID`: ID da configuração Unified Login criada no painel Meta.
- `META_GRAPH_API_VERSION=v27.0`: versão Graph API (pode ser alterada conforme a versão habilitada no app).
- `INSTAGRAM_STATE_SECRET`: chave aleatória para assinar o estado OAuth.
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY`: chave aleatória de 32 bytes em Base64 para criptografar o token antes de salvá-lo.

Gere os dois últimos segredos com:

```sh
openssl rand -base64 32
openssl rand -base64 32
```

Depois de cadastrar as variáveis, faça um novo deploy.

## Supabase

Aplique a migration `supabase/migrations/20261118120000_client_instagram_connections.sql`. Os tokens ficam criptografados e a tabela não concede acesso direto às sessões de navegador; somente as rotas do servidor usam a chave de serviço.

O token pode não ter uma data de expiração quando a configuração Unified Login usa token de usuário do sistema sem expiração. A equipe pode desconectar e reconectar pelo mesmo botão. A coleta e o armazenamento das métricas para os relatórios mensais serão implementados na etapa seguinte.
