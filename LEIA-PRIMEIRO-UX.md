# AVESSO — Cliente 360 / UX 0.12

Atualização sobre o ZIP mais recente fornecido em 06/10/2026. O código principal está na raiz. As pastas `fundacao-nextjs` e `html-standalone` são referências antigas e não devem ser publicadas.

## O que mudou

- Cliente 360 com Contrato, Briefing, Branding, Referências, Produção, Aprovação, Calendários, Entrega, Arquivos e Financeiro.
- Contrato e briefing preservam seus editores e anexos privados R2 existentes.
- Referências podem ser salvas apenas com texto. Título opcional, link opcional, categoria, status, busca, filtros, comentários e anexos. Compartilhamento explícito; cliente só vê os itens compartilhados do próprio espaço.
- Branding separado, com cards para logos, cores, fontes, tom de voz e manual. Aceita texto e anexos; edição pela agência.
- Referências selecionadas viram conteúdo com briefing vinculado. Repetir a conversão abre o mesmo vínculo, sem gerar cópias. O texto anterior fica registrado no histórico da equipe.
- Conteúdos em cards, com miniatura, formato, status e previsão de publicação. Filtros de busca/mês/status, contadores de pendências e visualização por etapas para a agência.
- Cada versão tem legenda, comentários, fotos/arquivos de referência e decisão individual. Pedido de ajuste exige descrição. Aprovação e comentário são registrados na mesma transação, com validação da versão atual.
- Carrossel: envie a primeira imagem como uma nova versão e adicione as demais, em ordem, no rascunho. Só depois envie para aprovação. Alterar o conjunto após envio exige nova versão.
- Agenda geral e por cliente usam os mesmos eventos. Tipos: reunião, gravação, postagem e bloqueio interno. Filtros por cliente/responsável/tipo e visões Mês, Hoje e Próximos 7 dias.
- Conflitos consideram início, fim, responsáveis, preparação e deslocamento. Sem responsável selecionado, o evento reserva a equipe inteira. Postagens e eventos cancelados não bloqueiam horários. Horários em Brasília.
- Previsões dos cards aparecem automaticamente na agenda, sem criar um segundo evento. Postagem prevista não é publicação automática nas redes.
- Busca real na lista de clientes, foco visível no teclado, diálogos nativos, estados vazios orientados e layout adaptável. Itens visuais sem ação no cabeçalho foram removidos.

## Estado da entrega

Código implementado e compilado; migração **não aplicada** ao banco compartilhado; site **não publicado**.

A revisão automática rejeitou a aplicação remota por envolver tabelas, políticas de acesso, funções e permissões. O arquivo concreto para aprovação é `database/workspace-ux-setup.sql`. Ele é aditivo, preserva registros existentes e restringe a leitura dos eventos internos no portal do cliente. A aplicação exige aprovação explícita.

A consulta ao projeto na Vercel também havia retornado 403 de permissão. O ZIP pode ser enviado ao repositório atual depois da migração aprovada. Não substitua a configuração do R2 nem as variáveis existentes.

## Aplicação após aprovação

1. Confirme que as atualizações anteriores de contratos/equipe e briefing/produção já estão aplicadas.
2. Aplique `database/workspace-ux-setup.sql` no projeto Supabase do Avesso, após aprovação. Não execute os SQLs antigos novamente sem necessidade.
3. Atualize o código da raiz no repositório publicado pela Vercel.
4. Preserve as variáveis da `.env.example`, especialmente URL e chave pública do Supabase, chave de serviço somente no servidor e credenciais R2. Nenhuma chave secreta deve usar prefixo `NEXT_PUBLIC_`.
5. No bucket R2, confirme CORS com o domínio do Avesso, método PUT e cabeçalho Content-Type. Os novos anexos vão direto ao R2; não passam pelo limite de corpo da Vercel. O servidor precisa de leitura, escrita e cópia de objetos no bucket privado.
6. Execute `npm ci`, `npm test`, `npm run test:database` e `npm run build`, usando Node 22 conforme o projeto.
7. Publique e valide com um login da agência e um do cliente: salvar texto, anexar imagem, consultar item compartilhado, revisar conteúdo e cadastrar dois compromissos conflitantes.

## Limites relevantes

- Novos anexos de referências/branding/comentários: até 100 MB; JPG, PNG, WEBP, PDF, DOCX, ZIP, MP4 e WEBM. Arquivos de produção grandes continuam usando o upload multipart R2 já existente.
- Arquivos de fontes e vetores podem ser enviados em ZIP. A prévia de slides suporta imagens; outros documentos ficam disponíveis para download.
- A edição de briefing/contrato segue as permissões já existentes, pela equipe. Atribuições individuais de acesso da equipe a clientes não foram redesenhadas nesta revisão: mantém-se o controle por organização atual.
- A agenda verifica conflitos nas gravações/reuniões feitas pela nova API. Escritas diretas fora dessa API ou o código antigo não devem ser usados para criar reservas após a atualização.
- O histórico de textos novos é mantido; versões antigas de contratos/briefing não foram reconstruídas.
- A verificação visual em navegador não foi concluída devido a falha do navegador automatizado no ambiente. Não houve teste com credenciais reais de cliente nem envio real de arquivos R2 nesta etapa.

## Verificação executada

- 55 testes automatizados de API/políticas passaram, incluindo os 42 testes anteriores.
- SQL executado em PostgreSQL local isolado (PGlite), com dados sintéticos: migração, conflitos, intervalos, cancelamentos, responsáveis diferentes, permissões, histórico de texto, conversão sem duplicação e decisão de revisão atômica.
- Build Next.js de produção passou. Testes e compilação foram executados com Node 24 disponível no ambiente; o projeto mantém Node 22 na hospedagem. Validar também nessa versão antes de publicar.
- Nenhuma migração ou conteúdo de teste foi gravado no banco compartilhado. Nenhuma notificação real foi enviada.
