# AVESSO — Briefing, produção e WhatsApp, versão 6

## Publicar

1. No SQL Editor do Supabase, execute `database/production-projects-setup.sql` depois da estrutura de produção já instalada (`database/briefing-production-setup.sql`). Esse complemento cria os projetos, relaciona artes e grava automaticamente a data quando o cliente aprova. Não execute novamente os scripts antigos indiscriminadamente.
2. Extraia o ZIP, substitua os arquivos na raiz do repositório conectado à Vercel e faça commit no ramo de produção. Inclua todos os novos componentes e rotas. Republicar um commit antigo não instala esta atualização.
3. Preserve as variáveis Supabase e R2. Para o bucket da sua configuração mais recente, use `R2_BUCKET_NAME=avesso-producoes`. O nome precisa coincidir exatamente com o bucket autorizado pelo token. Não copie valores de exemplo sobre credenciais reais.
4. Mantenha o bucket privado. Configure CORS conforme `config/r2-cors.json` para `https://avesso-seven.vercel.app`.
5. Na Vercel, em Settings → Environment Variables → Production, cadastre `APP_URL=https://avesso-seven.vercel.app`. Deixe `WHATSAPP_ENABLED=false` até configurar a Meta. Salve as variáveis antes de publicar.
6. Confira o build do novo commit e execute os testes de uso ao final deste guia.

## Organização dos clientes

As nove abas ficam nesta ordem: **Visão geral, Calendários, Arquivos, Produção, Entrega, Aprovação, Financeiro, Briefing e Contrato**.

- **Briefing:** texto de objetivos e referências com salvamento independente, PDFs e fotos JPG/PNG/WebP até 100 MiB por arquivo, entregas mensais e responsáveis. Criativos reúne estáticos e carrosséis, preservando os registros anteriores.
- **Contrato:** dados comerciais, texto e documentos próprios. Salvar o contrato não altera as quantidades do briefing.
- **Arquivos:** consulta dos anexos do briefing e dos arquivos de produção. Documentos comerciais continuam na aba Contrato.
- **Equipe:** Designer e Videomaker, com atribuição de responsáveis às entregas contratadas.

Os anexos novos ficam privados no R2. O navegador envia as partes diretamente, com tentativas adicionais e retomada ao selecionar o mesmo arquivo. Anexos do briefing não criam versões de produção. Briefing e contratos são internos da agência; o cliente acessa os materiais publicados para aprovação no portal autenticado.

## Produção e aprovação

**Em produção → Aguardando aprovação → Aprovado → Aguardando agendamento → Agendado → Postado**

O mesmo fluxo atende criativos e vídeos. O upload registra a produção. Enviar para aprovação publica a versão mais recente, muda o estado para Aguardando aprovação e prepara o aviso. O cliente aprova ou solicita alterações no portal. Aprovar muda para Aprovado; solicitar alterações devolve o material à produção. A agência registra as etapas seguintes de agendamento e postagem, com histórico na tela.

Na aba **Produção** geral, clique em **Novo projeto** e escolha o cliente. Abra o card do projeto para usar **Adicionar arte**; cada arte pode ser estático, carrossel, story ou vídeo e tem briefing, observações internas, responsável e prazo próprios. Os botões **Editar projeto** e **Excluir** ficam no card do projeto. O botão **Anexar foto ou PDF a este post** aparece no próprio card de cada arte e vincula o arquivo somente àquela arte; abra a arte para enviar a versão à aprovação e acompanhar a conversa. A aprovação continua sendo feita pelo cliente no portal e sua data aparece automaticamente no card. Depois da aprovação, o Design define a previsão de publicação e organiza o calendário. A tela também destaca a próxima ação esperada. Artes antigas podem ser movidas de **Sem projeto** para um projeto do mesmo cliente. Ao excluir um projeto, suas artes e arquivos permanecem disponíveis em **Sem projeto**.

Versões antigas não podem aprovar o material atual. Enviar novamente a mesma versão não cria outro aviso. O link abre o portal, exige login e destaca o material. Existe também um botão para copiar o link. As etapas de agendamento e postagem registram o trabalho no AVESSO; a integração implementada envia avisos de aprovação pelo WhatsApp.

## Ativar a API oficial da Meta

Configure uma conta empresarial, um aplicativo com WhatsApp Cloud API e um número habilitado. Consulte a [documentação oficial da Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/).

Obtenha o **Phone Number ID**, a versão da Graph API utilizada pelo aplicativo e um token adequado para produção, com acesso ao número e permissão `whatsapp_business_messaging`. O ID do número não é o telefone nem o ID da conta comercial.

Crie um modelo de mensagem chamado `avesso_aprovacao`, em português do Brasil (`pt_BR`), e aguarde a aprovação da Meta. O código espera exatamente:

- Corpo com **um parâmetro**, preenchido com o título do material. Sugestão: “Seu material {{1}} está pronto para aprovação. Acesse o AVESSO pelo botão abaixo.”
- Um botão de URL na posição 0, chamado “Aprovar material”, com URL dinâmica `https://avesso-seven.vercel.app/?approval={{1}}`. O parâmetro do botão recebe o identificador do material. O domínio deve coincidir com `APP_URL`.

Classifique o modelo conforme as regras da Meta. Autorização do destinatário, aprovação do modelo, disponibilidade do número e preços dependem da Meta.

Cadastre na Vercel, em **Production**:

| Variável | Valor |
| --- | --- |
| `APP_URL` | `https://avesso-seven.vercel.app` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número fornecido pela Meta |
| `WHATSAPP_ACCESS_TOKEN` | Token de produção, como valor sensível |
| `WHATSAPP_TEMPLATE_NAME` | Nome exato do modelo aprovado, por exemplo `avesso_aprovacao` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | `pt_BR` |
| `WHATSAPP_API_VERSION` | Versão suportada no aplicativo, no formato `vNN.N` |
| `WHATSAPP_ENABLED` | `true`, somente após concluir a configuração |

Salve e faça novo deploy. Em **Editar cliente**, informe o WhatsApp com DDD e marque a autorização para avisos apenas quando o cliente tiver autorizado. A normalização atual atende números brasileiros, com ou sem `55`. A autorização dos clientes existentes começa desmarcada.

Tokens e chaves devem ficar somente no servidor, sem prefixo `NEXT_PUBLIC_`. Não compartilhe esses valores em capturas de tela.

## Falhas e tentativas adicionais

Com tudo configurado, o aviso é enviado automaticamente ao publicar uma versão para aprovação. Sem configuração ou autorização, a aprovação continua disponível no portal. **Aceito pela API significa aceitação da solicitação, não confirmação de entrega ao aparelho**; esta revisão não inclui webhook de confirmação de entrega.

O banco controla um aviso por versão. Recusas confirmadas podem ser tentadas novamente pela interface, com limite de três tentativas. Uma queda de conexão que impeça confirmar se a Meta recebeu a solicitação deixa o aviso sem confirmação; ele não é reenviado automaticamente. Confira o resultado na Meta antes de tomar outra providência.

Há uma rota opcional `GET /api/whatsapp/cron`, protegida pelo cabeçalho `Authorization: Bearer <CRON_SECRET>`. Um agendador externo pode chamá-la depois de cadastrar um segredo forte na Vercel. Ela processa até dois itens por chamada e respeita o limite de tentativas. **Nenhum agendamento foi ativado neste pacote**. O primeiro envio automático e as tentativas pela interface já funcionam sem agendador.

## Conferir após publicar

1. Confira as nove abas, Criativos e os responsáveis.
2. Salve um briefing, anexe um PDF e uma foto, recarregue e abra os anexos. Confira que o contrato conserva texto e arquivos próprios.
3. Envie uma produção e publique a versão para aprovação. Abra o link com o usuário do cliente e confira que outro cliente não acessa o material.
4. Aprove como cliente e registre Aguardando agendamento, Agendado e Postado pela agência. Confira o histórico e a aba Entrega.
5. Com Meta e autorização configuradas, envie uma nova versão para aprovação. Confira o aviso no WhatsApp e a aceitação na tela. Enviar a mesma versão novamente não deve duplicar o aviso.

O erro anterior de finalização do PDF no R2 ainda precisa ser conferido na sua conta. Este pacote conserva os diagnósticos por etapa da versão 5; os testes locais não substituem o upload real. Se persistir, consulte operação, etapa, código e HTTP nos logs da Vercel, sem compartilhar credenciais.
