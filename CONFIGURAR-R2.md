# AVESSO — configuração do armazenamento privado

O aplicativo que deve ser importado no Git/Vercel está na raiz deste diretório, onde está `package.json`. Framework: **Next.js**. As pastas `fundacao-nextjs` e `html-standalone` e o `index.html` são referências históricas recebidas no ZIP; não são a aplicação de produção e não recebem a integração R2.

## 1. Supabase: preparar o banco existente

No projeto Supabase atual, abra **SQL Editor** e execute todo o arquivo `database/r2-setup.sql`. Faça isso antes de publicar a versão nova. O script depende das tabelas AVESSO já existentes: `demands`, `demand_versions`, `organization_members`, além de `auth.users`. Ele adiciona `storage_provider`, garante `file_size` como `bigint` para arquivos grandes, cria uma tabela privada de sessões de upload e uma função de finalização transacional. Não recria o banco e não substitui as políticas RLS existentes.

As tabelas do ZIP não vieram com definições SQL nem com as políticas atuais. Confirme que `demands`, `demand_versions`, `organization_members` e `client_users` continuam com RLS e acesso restrito por organização/cliente. O servidor usa o token do usuário para consultá-las e confere explicitamente a organização, o vínculo do cliente e o status da versão. O servidor também confere a sessão via `auth.getUser`, sem confiar em metadados editáveis do usuário.

A equipe com vínculo ativo e papel diferente de `client_user` pode enviar versões, seguindo o modelo de agência já usado pela interface. O cliente precisa de vínculo na organização e em `client_users` e só recebe prévias de versões compartilhadas: `sent_for_review`, `approved`, `changes_requested` ou `delivered`.

Copie a chave **service_role** do projeto para a variável privada `SUPABASE_SERVICE_ROLE_KEY` na Vercel. Ela serve apenas para os registros confiáveis de sessão e para finalizar uma versão. Nunca coloque essa chave em variáveis `NEXT_PUBLIC_`, código, Git ou no navegador.

## 2. Cloudflare: bucket e credenciais

1. Ative o R2 na sua conta Cloudflare e crie um bucket Standard chamado, por exemplo, `avesso-produtos`.
2. Mantenha **Public Development URL / r2.dev desativado** e não conecte domínio público ao bucket. Os objetos são privados.
3. Em **R2 → Manage R2 API tokens**, crie credenciais S3 com **Object Read & Write**, limitadas apenas a esse bucket. Guarde o **Access Key ID**, o **Secret Access Key** e o **Account ID**. O token geral da API Cloudflare não substitui essas credenciais S3.
4. Em **bucket → Settings → CORS Policy**, copie `config/r2-cors.json`. Substitua `https://avesso-seven.vercel.app` pela origem exata do AVESSO, sem barra final. Adicione também a origem `https://SEU-PROJETO.vercel.app` se ela for usada. Inclua individualmente as origens de Preview que precisar testar. Remova `localhost` se não usar desenvolvimento local. Não use `*` como origem.
5. Em **Object lifecycle rules**, habilite uma regra para **abortar multipart incompleto depois de 7 dias**, abrangendo todos os objetos. A retomada no AVESSO vale por 6 dias. Não aplique regra de exclusão automática aos arquivos concluídos.

O CORS permite PUT direto e GET/HEAD para leitura, além do cabeçalho Range necessário ao vídeo. Não torna o bucket público. URLs de envio expiram em 15 minutos e são renovadas a cada tentativa; URLs de leitura expiram em 1 hora e a tela as renova enquanto estiver aberta. Quem tiver uma URL assinada pode usá-la até expirar; sair da conta não revoga imediatamente um link já emitido.

## 3. Vercel: variáveis e publicação

Importe o repositório com a raiz deste diretório. Se você subir a pasta `avesso-main` inteira para um repositório que a contém, configure **Root Directory = avesso-main**; se subir apenas seu conteúdo, deixe a raiz padrão. Use o preset **Next.js**, Node.js **22.x**, instalação `npm ci`, build `npm run build` e diretório de saída padrão do Next.js.

Em **Project → Settings → Environment Variables**, cadastre:

| Variável | Valor | Visibilidade |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase atual | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key atual | Pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alternativa à publishable key, se usar chave anon legada | Pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role do Supabase atual | Segredo do servidor |
| `R2_ACCOUNT_ID` | Account ID do Cloudflare | Servidor |
| `R2_ACCESS_KEY_ID` | Access Key ID do token restrito ao bucket | Segredo do servidor |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key do mesmo token | Segredo do servidor |
| `R2_BUCKET_NAME` | `avesso-produtos`, ou nome escolhido | Servidor |
| `R2_MAX_FILE_BYTES` | Opcional: `53687091200` por padrão, 50 GiB | Servidor |

Configure os ambientes Production e Preview que forem usados, com buckets separados quando quiser isolar testes. Faça um novo deploy após cadastrar ou alterar as variáveis. Mantenha as configurações existentes de Auth/URLs permitidas do Supabase compatíveis com seu domínio. Nenhuma credencial R2 vai ao navegador.

Para executar localmente: Node 22, `npm ci`, copie `.env.example` para `.env.local`, preencha os valores e execute `npm run dev`. Nunca publique `.env.local`. Os arquivos `.env.local` recebidos no ZIP original foram omitidos do ZIP final.

## 4. Como usar e validar na sua conta

1. Entre com um usuário da agência e abra **Cliente → Produção → demanda → Enviar nova versão**.
2. Envie um MP4 pequeno e confira a prévia. Verifique que o objeto apareceu no R2 e que `demand_versions.storage_provider` contém `r2`. O bucket `demand-files` do Supabase não deve receber o arquivo novo.
3. Envie um vídeo acima de 2 GB. O padrão aceita até 50 GiB. Acompanhe o progresso. As partes têm 64 MiB e até três são enviadas em paralelo; não se carrega o vídeo inteiro na memória.
4. Pause o envio ou interrompa a conexão. Volte à mesma demanda, na mesma conta e no mesmo navegador, e selecione **o mesmo arquivo original**. As partes completas são recuperadas do R2 e as partes que faltam são enviadas. O nome, tamanho, data de modificação e amostras do início/fim identificam o arquivo; essa identificação não é um checksum integral do vídeo.
5. Use **Descartar envio pendente** depois de uma pausa/falha para cancelar o multipart. Se o objeto já foi concluído e só falta salvar o banco, selecione novamente o arquivo para finalizar o registro. Não há exclusão automática desse objeto privado em caso de falha do banco.
6. Envie para aprovação e entre no portal do cliente. Confira aprovação/pedido de alterações e o histórico. Teste outro cliente e outra organização: eles devem receber acesso negado às versões alheias. Confira que rascunhos da agência não aparecem como links para clientes.
7. Teste uma versão antiga: ela continua usando links temporários do Supabase. Os arquivos existentes não são copiados ou apagados automaticamente.
8. Verifique que as requisições PUT grandes vão ao domínio S3 do R2 e que `/api/files` recebe apenas JSON pequeno. A Vercel não transporta os vídeos.

Não altere o nome do bucket depois de iniciar uploads. Há limite de dez sessões pendentes não expiradas por usuário. O limite de arquivo é validado no servidor; o máximo configurável desta implementação é 625 GiB, com até 10.000 partes de 64 MiB.

## 5. Operação e limitações

O armazenamento cobra espaço e operações conforme o plano R2. Os multipart abandonados são removidos pela regra de lifecycle. Registros expirados/abortados podem ser removidos da tabela de sessões periodicamente por um administrador; preserve os registros **completed**, pois comprovam o vínculo autorizado usado para gerar as prévias. Objetos concluídos antes de uma falha de banco podem ficar privados sem versão cadastrada: retome dentro de seis dias ou reconcilie manualmente o registro antes de remover qualquer objeto.

Não foi adicionada transcodificação: o navegador precisa suportar o codec do vídeo para reproduzi-lo. MOV e alguns MP4 podem precisar ser abertos/baixados pelo botão **Abrir arquivo**. O upload mantém os formatos aceitos pela interface original: MP4, MOV, WebM, JPEG, PNG e PDF. As áreas que já eram placeholders permanecem como estavam.

## Referências oficiais

- [R2: URLs assinadas e credenciais S3](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2: CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2: uploads e multipart](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [R2: lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Supabase: validação de usuário](https://supabase.com/docs/reference/javascript/auth-getuser)
