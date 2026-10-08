# AVESSO — Cliente 360 / UX 0.12

Atualização sobre o ZIP mais recente fornecido em 06/10/2026. O código principal está na raiz. As pastas `fundacao-nextjs` e `html-standalone` são referências antigas e não devem ser publicadas.

## O que mudou

- Cliente 360 com Contrato, Briefing, Branding, Referências, Produção, Aprovação, Calendários, Entrega, Arquivos e Financeiro.
- Contrato e briefing preservam seus editores e anexos privados R2 existentes.
- Referências podem ser salvas apenas com texto. Título opcional, link opcional, categoria, status, busca, filtros, comentários e anexos. Compartilhamento explícito; cliente só vê os itens compartilhados do próprio espaço.
- Branding separado, com cards para logos, cores, fontes, tom de voz e manual. Aceita texto e anexos; edição pela agência.
- Referências selecionadas viram conteúdo com briefing vinculado. Repetir a conversão abre o mesmo vínculo, sem gerar cópias. O texto anterior fica registrado no histórico da equipe.
- Conteúdos em cards, com miniatura, formato, status e previsão de publicação. Filtros de busca/mês/status, contadores de pendências e visualização por etapas para a agência.
- Produção organizada por projetos. Cada projeto agrupa cards de artes com briefing, observações internas, responsável, prazo e anexos de fotos/PDF; projetos podem ser editados/excluídos, e artes antigas podem ser movidas para projetos do mesmo cliente sem apagar arquivos.
- Aprovação do cliente segue no portal. A data da aprovação é gravada automaticamente; o Design define a publicação e cada card indica a próxima ação. Conteúdos anteriores ficam em “Sem projeto” até serem reorganizados.
- Cada versão tem legenda, comentários, fotos/arquivos de referência e decisão individual. Pedido de ajuste exige descrição. Aprovação e comentário são registrados na mesma transação, com validação da versão atual.
- Carrossel: envie a primeira imagem como uma nova versão e adicione as demais, em ordem, no rascunho. Só depois envie para aprovação. Alterar o conjunto após envio exige nova versão.
- Agenda geral e por cliente usam os mesmos eventos. Tipos: reunião, gravação, postagem e bloqueio interno. Filtros por cliente/responsável/tipo e visões Mês, Hoje e Próximos 7 dias.
- Conflitos consideram início, fim, responsáveis, preparação e deslocamento. Sem responsável selecionado, o evento reserva a equipe inteira. Postagens e eventos cancelados não bloqueiam horários. Horários em Brasília.
- Previsões dos cards aparecem automaticamente na agenda, sem criar um segundo evento. Postagem prevista não é publicação automática nas redes.
- Busca real na lista de clientes, foco visível no teclado, diálogos nativos, estados vazios orientados e layout adaptável. Itens visuais sem ação no cabeçalho foram removidos.

## Estado da entrega

A atualização de Produção está no código local. A migração `database/production-projects-setup.sql` **não foi aplicada** ao banco, e o site **não foi publicado**. O script cria os projetos, acrescenta o vínculo das artes e adiciona a data automática de aprovação; ele preserva os conteúdos e arquivos existentes.

Os testes automatizados da API passaram (10 arquivos de teste). Não consegui executar o teste SQL isolado nem o build nesta cópia porque o ZIP não inclui dependências instaladas e a instalação não concluiu no ambiente. Antes de publicar, aplique a migração e rode os comandos indicados abaixo com Node 22 no checkout conectado à Vercel. Não substitua a configuração do R2 nem as variáveis existentes.

## Aplicação após aprovação

1. Confirme que as atualizações anteriores de contratos/equipe e briefing/produção já estão aplicadas.
2. Aplique `database/production-projects-setup.sql` no projeto Supabase do Avesso. Não execute os SQLs antigos novamente sem necessidade.
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

- 10 arquivos de testes automatizados de API/políticas passaram, incluindo os casos novos para criação, edição e exclusão segura de projetos.
- O teste SQL isolado e o build Next.js não rodaram nesta cópia porque as dependências não puderam ser instaladas. Rode `npm ci`, `npm test`, `npm run test:database` e `npm run build` com Node 22 antes de publicar.
- Nenhuma migração ou conteúdo de teste foi gravado no banco compartilhado. Nenhuma notificação real foi enviada.
