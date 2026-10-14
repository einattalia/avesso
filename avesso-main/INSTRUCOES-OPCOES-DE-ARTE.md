# Opções de arte para aprovação

## Como usar

1. No card, escolha as duas ou mais artes de uma vez no seletor de arquivos. Também dá para selecionar as opções ao criar ou editar o card.
2. Envie o lote uma única vez. Com duas ou mais artes, o sistema cria uma rodada de aprovação com todas as opções e disponibiliza o link para o cliente.
3. O cliente verá as opções lado a lado, no mesmo link, e poderá escolher uma ou solicitar ajustes.
4. Depois da escolha, a equipe verá a versão escolhida destacada no card.

O envio aceita de 2 a 8 opções por rodada. Se o cliente solicitar ajustes, a equipe pode selecionar e enviar uma nova rodada pelo card; o link anterior é encerrado e um novo link é criado. Uma única arte enviada após um pedido de ajustes também gera um novo link de aprovação.

## Atualização do Supabase

No SQL Editor do Supabase, execute novamente `database/client-approval-portal.sql` depois de `database/briefing-production-setup.sql` e `database/production-projects-setup.sql`. Esse script cria os registros do conjunto de opções e as funções que registram a escolha. Depois, publique a aplicação atualizada.
