# Criação com IA

Acesso pelo menu da agência e pela página de cada cliente. Ferramentas: planejamento mensal, posts, carrosséis, roteiros, direção visual e revisão de conteúdo.

## Ativação

Configure `OPENAI_API_KEY` como variável secreta de servidor na Vercel e publique novamente. Nunca use o prefixo NEXT_PUBLIC e nunca salve a chave no Git. Opcional: `OPENAI_TEXT_MODEL` para substituir o modelo padrão `gpt-6-luna` por um modelo disponível na conta.

Sem a chave, a tela informa que a geração está inativa. Preparar/copiar o briefing, editar, salvar versões e enviar para Produção continuam disponíveis. Não há geração simulada.

## Fluxo

1. Selecione o cliente e salve as orientações da marca.
2. Escolha a ferramenta e descreva o pedido.
3. Gere e revise o texto. Anexos e URLs não são lidos automaticamente.
4. Salve versões no histórico interno. Cada salvamento cria uma referência privada na categoria Criação com IA; o histórico existente de referências continua disponível.
5. Envie para Produção. O mecanismo existente de conversão de referência evita duplicar o card da mesma versão. Para enviar uma revisão ao mesmo card, edite o card existente; salvar uma nova versão gera uma referência independente.

O planejamento gera uma proposta textual revisável; não distribui automaticamente as ideias em cards ou no calendário. A exploração visual entrega direção de arte textual, não arquivos de imagem. O designer finaliza as peças antes do fluxo habitual de aprovação.

## Consumo e limites

Somente membros ativos da equipe têm acesso à geração. Contexto limitado a Branding do cliente selecionado; contratos, dados financeiros e anexos não são enviados. Chamadas usam `store:false`, timeout de 50 segundos e até 4.000 tokens de saída. Respostas incompletas e falhas não são apresentadas como sucesso.

O bloqueio de chamadas simultâneas é local à instância; não constitui cota mensal nem limite financeiro global. Não há teto em reais implementado nesta versão. Configure orçamento/alertas na conta da API e acompanhe o consumo antes de ativar para toda a equipe.
