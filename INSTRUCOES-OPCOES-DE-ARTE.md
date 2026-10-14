# Opções de arte para aprovação

## Como usar

1. No card da produção, envie cada alternativa como uma versão separada.
2. Na tela de detalhes do card, marque pelo menos duas versões e clique em **Enviar opções para aprovação**.
3. O cliente verá as artes juntas no mesmo link e poderá escolher uma ou solicitar ajustes.
4. Quando escolher, a versão selecionada ficará aprovada e identificada para a equipe.

O envio aceita de 2 a 8 versões por rodada. Se o cliente solicitar ajustes, a equipe pode enviar uma nova rodada com as versões atualizadas.

## Atualização do Supabase

No SQL Editor do Supabase, execute novamente `database/client-approval-portal.sql` depois de `database/briefing-production-setup.sql` e `database/production-projects-setup.sql`. Esse script cria os registros do conjunto de opções e as funções que registram a escolha. Depois, publique a aplicação atualizada.
