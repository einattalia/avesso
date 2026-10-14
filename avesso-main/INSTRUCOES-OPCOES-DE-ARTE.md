# Opções de arte para aprovação

## Como usar

1. Abra o card e selecione várias imagens de uma vez no campo de envio; cada arquivo será salvo como uma versão separada. Também dá para selecionar várias imagens ao criar ou editar o card.
2. Na tela de detalhes do card, marque pelo menos duas versões e clique em **Enviar opções para aprovação**.
3. O cliente verá as artes juntas no mesmo link e poderá escolher uma ou solicitar ajustes.
4. Quando escolher, a versão selecionada ficará aprovada e identificada para a equipe.

O envio aceita de 2 a 8 versões por rodada. Se o cliente solicitar ajustes, a equipe pode enviar uma nova rodada com as versões atualizadas.

Ao anexar arquivos diretamente no card que está aguardando aprovação ou com ajustes solicitados, o sistema encerra o link anterior e publica a nova versão para aprovação automaticamente. Uma imagem gera um novo link de aprovação; várias imagens viram opções para o cliente escolher.

## Atualização do Supabase

No SQL Editor do Supabase, execute novamente `database/client-approval-portal.sql` depois de `database/briefing-production-setup.sql` e `database/production-projects-setup.sql`. Esse script cria os registros do conjunto de opções e as funções que registram a escolha. Depois, publique a aplicação atualizada.
