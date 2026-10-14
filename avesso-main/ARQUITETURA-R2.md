# Inspeção e alterações do AVESSO

## Arquitetura recebida

- Aplicação principal Next.js App Router em `app/page.js`, uma página cliente com login, navegação de agência/cliente e módulos operacionais. Estilos em `app/globals.css` e layout em `app/layout.js`.
- Supabase Auth: `getSession`, `onAuthStateChange`, `signInWithPassword`, `getUser`; perfil em `profiles`, organização e papel em `organization_members`, associação ao cliente em `client_users`.
- Banco: clientes, contratos/itens, demandas/versões, eventos de aprovação, sessões de gravação e financeiro em tabelas existentes do Supabase. As definições e políticas de banco não vieram no ZIP.
- Único upload operacional encontrado no código principal: `DemandDetail.upload`. Usava TUS (`tus-js-client`) com endpoint `/storage/v1/upload/resumable`, bucket `demand-files`, partes de 6 MiB, token Supabase, tentativas e retomada. Limite local de 2 GiB.
- Após upload: inserção de nome, caminho, tamanho, tipo, responsável e versão em `demand_versions`, seguida de atualização da demanda para `internal_review`. A sequência não era transacional.
- Única leitura de objetos encontrada: `VersionCard` chamava `supabase.storage.from('demand-files').createSignedUrl(...,3600)`. Essa mesma prévia atende produção, revisão da agência e aprovação do portal.
- Aprovação/envio/entrega atualizam `demand_versions`, `demands` e `approval_events`. Continuam com os mesmos controles de interface e chamadas existentes.
- `fundacao-nextjs/avesso-v1` e `html-standalone/avesso-html` são bases antigas; não possuem o fluxo operacional de upload presente na raiz. Mantidas para referência.

## Fluxo entregue

1. Navegador consulta a sessão Supabase e chama `/api/files` com Bearer token.
2. Servidor valida o usuário com Supabase Auth e verifica a demanda, a organização e o papel usando o banco com RLS.
3. Servidor inicia multipart R2 com chave aleatória por organização/cliente/demanda e grava os dados em `r2_upload_sessions`, acessível apenas ao servidor.
4. Navegador solicita URLs assinadas por parte e envia os bytes diretamente ao R2. URLs são emitidas sob demanda, renovadas nas tentativas e não ficam salvas no banco.
5. Retomada guarda só o identificador da sessão em localStorage; o servidor consulta a lista de partes no R2. O arquivo precisa ser selecionado novamente após fechar/recarregar a página.
6. Finalização consulta as partes no R2, valida ordem/tamanho, completa o multipart e verifica tamanho/tipo do objeto. Uma função SQL executável apenas pelo servidor trava a sessão e a demanda, calcula a próxima versão, registra metadados e atualiza a demanda numa transação. Repetir uma finalização retorna a mesma versão.
7. Prévia consulta a versão com RLS, confere acesso e, para R2, verifica a sessão concluída vinculada ao objeto. Emite GET temporário direto ao R2. Versões anteriores seguem no Supabase.

Toda a interface original e os módulos de negócio foram mantidos. Foram adicionados controles de pausa/descarte, abertura do arquivo e mensagens de falha da prévia. TUS foi removido da aplicação principal. As dependências foram fixadas e foi criado `package-lock.json`.

## Fronteiras de validação

Testes locais exercitam o código real de autorização/API com substitutos para Supabase e R2, além de validação multipart e envio/retomada no cliente. Não substituem a execução do SQL no banco real nem um upload real na conta Cloudflare. Essas verificações precisam das configurações do usuário descritas no guia.


## Contratos e equipe — versão 3

Esta revisão inclui texto editável de contrato, anexos privados no R2, cadastro de Designers/Videomakers e responsáveis por entrega contratada. Artes reúne carrosséis e estáticos com quantidade mensal editável. Execute o SQL adicional `database/contracts-team-setup.sql` antes de publicar. As variáveis e o bucket R2 permanecem os mesmos. Leia `INSTRUCOES-CONTRATOS-EQUIPE.md` para uso, preservação dos registros anteriores e validação.
