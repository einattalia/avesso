# Laboratório IA

Acesso pelo menu da agência e pela página de cada cliente, sempre com seletor do cliente a ser trabalhado. Ferramentas: planejamento mensal, posts, carrosséis, roteiros, direção visual e revisão de conteúdo.

## Ativação

Escolha entre ChatGPT (OpenAI) e Claude (Anthropic) no campo "IA para esta criação". Configure as conexões desejadas como variáveis Secret de servidor na Vercel e publique novamente:

| Conexão | Chave | Modelo padrão | Substituição opcional |
| --- | --- | --- | --- |
| ChatGPT (OpenAI) | `OPENAI_API_KEY` | `gpt-6-luna` | `OPENAI_TEXT_MODEL` |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` | `ANTHROPIC_TEXT_MODEL` |

Cada conexão pode ser ativada independentemente, com cobrança na respectiva conta de API. Nunca use o prefixo NEXT_PUBLIC e nunca salve chaves no Git. A seleção não autoriza fallback: falhas não redirecionam o briefing para o outro fornecedor. "Chave cadastrada" indica presença da chave, não comprova saldo ou validade; faça uma geração para validar a conexão real.

Sem a chave da IA selecionada, a tela informa que a geração está inativa. Preparar/copiar o briefing, editar, salvar versões e enviar para Produção continuam disponíveis. Não há geração simulada.

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
