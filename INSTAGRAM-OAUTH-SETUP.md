# Configuração da conexão com Instagram

O botão aparece no cabeçalho do Cliente 360°. Cada conexão é autorizada pela própria conta profissional do Instagram e fica associada somente ao cliente selecionado.

## Meta for Developers

1. Crie ou selecione o aplicativo Meta da Avesso.
2. Adicione o produto **Instagram** e configure **Instagram API with Instagram Login / Business Login for Instagram**.
3. Cadastre esta URI de redirecionamento, exatamente:
   `https://avesso-seven.vercel.app/api/instagram/callback`
4. Solicite os escopos mínimos usados para leitura de conta e insights:
   - `instagram_business_basic`
   - `instagram_business_manage_insights`
5. Para contas de clientes fora das funções de teste/desenvolvimento do aplicativo, conclua a análise da Meta e obtenha o nível de acesso necessário para esses escopos.

O Instagram conectado precisa ser uma conta profissional Business ou Creator.

## Vercel

Configure estas variáveis no ambiente de produção e nos previews que serão usados para testar:

- `APP_URL=https://avesso-seven.vercel.app`
- `META_INSTAGRAM_APP_ID`: ID do aplicativo Meta.
- `META_INSTAGRAM_APP_SECRET`: segredo do aplicativo; mantenha no servidor, sem prefixo `NEXT_PUBLIC_`.
- `INSTAGRAM_STATE_SECRET`: segredo aleatório para assinar o estado OAuth.
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY`: chave aleatória de 32 bytes em Base64 para criptografar o token antes de salvá-lo.

Gere os dois últimos segredos com:

```sh
openssl rand -base64 32
openssl rand -base64 32
```

Depois de cadastrar as variáveis, faça um novo deploy.

## Supabase

Aplique a migration `supabase/migrations/20261118120000_client_instagram_connections.sql`. Os tokens ficam criptografados e a tabela não concede acesso direto a sessões de navegador; somente as rotas do servidor usam a chave de serviço.

As conexões expiram conforme o prazo informado pela Meta. Quando expirarem, a equipe pode reconectar pelo mesmo botão. A coleta e o armazenamento das métricas para os relatórios mensais serão implementados na etapa seguinte.
