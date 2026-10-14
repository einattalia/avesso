# Opções de arte para aprovação

## Como usar

1. No card, selecione várias artes de uma vez no campo de envio; também dá para anexá-las ao criar ou editar o card.
2. Depois do upload, confira as prévias. Desmarque cada imagem que não deve seguir para o cliente; mantenha pelo menos duas opções.
3. Clique em **Enviar imagens para aprovação**. As opções selecionadas aparecem lado a lado no mesmo link para o cliente escolher.
4. A versão escolhida fica registrada no card da equipe.

O envio aceita de 2 a 8 opções por rodada. Ao enviar uma nova rodada, o link anterior é encerrado e um novo link é criado. Uma única arte enviada depois de um pedido de ajustes continua gerando um novo link de revisão.

## Atualização do Supabase

No SQL Editor do Supabase, execute novamente `database/client-approval-portal.sql` depois de `database/briefing-production-setup.sql` e `database/production-projects-setup.sql`. Esse script cria os registros dos conjuntos de opções e as funções que registram a escolha. Depois, publique a aplicação atualizada.
