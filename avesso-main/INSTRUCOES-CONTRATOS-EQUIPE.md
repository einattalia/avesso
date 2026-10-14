# Contratos, equipe e entregas contratadas — versão 3

## Antes de publicar

1. No Supabase → SQL Editor, execute todo o arquivo `database/contracts-team-setup.sql`. O SQL R2 anterior (`r2-setup.sql`) deve já ter sido executado. Esta etapa é necessária mesmo para quem já configurou o R2.
2. Extraia o ZIP e substitua os arquivos na raiz do repositório do AVESSO, incluindo `app`, `lib`, `database`, `tests`, `package.json` e `package-lock.json`. Faça commit no ramo conectado à Vercel.
3. Mantenha as variáveis atuais da Vercel, incluindo `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor, e o bucket privado `avesso-producoes`. Não são necessárias novas chaves ou outro bucket. Mantenha a política CORS já configurada.
4. Aguarde o novo deploy ficar Ready. Confira o log da compilação; a geração completa desta revisão não pôde ser concluída neste ambiente por restrição de escrita.

## Como usar

- Em **Equipe**, cadastre o nome e a função. As pessoas aparecem em **Designers** e **Videomakers**. É possível editar ou desativar um cadastro. Esta lista de responsáveis é separada das contas de login.
- Em **Cliente → Contrato e escopo**, preencha **Texto do contrato** e clique em **Salvar texto**. A data do último salvamento e alterações pendentes aparecem abaixo do campo.
- Em **Arquivos do contrato**, anexe PDF, DOC, DOCX, JPG ou PNG, até 100 MB por arquivo. O navegador envia diretamente ao R2. Os anexos permanecem privados, com abertura por link temporário após conferir a sessão e o acesso da agência ao contrato. Para retomar um envio pausado, selecione o mesmo arquivo.
- Em **Entregas contratadas**, carrosséis e estáticos aparecem juntos em **Artes**. A quantidade inicial soma as linhas ativas anteriores e pode ser ajustada conforme a produção mensal. Vídeos e outros serviços permanecem separados.
- Abra **Selecionar equipe**, marque uma ou mais pessoas e clique em **Salvar responsáveis**. Clique em **Salvar alterações** para gravar quantidades, valores e dados gerais do contrato. O texto tem seu próprio botão de salvamento.

## Dados existentes

A unificação definitiva das artes ocorre ao salvar o contrato. As linhas anteriores e seus responsáveis ficam registrados para auditoria no banco; linhas incorporadas são desativadas e vinculadas à linha principal. A interface mostra uma só linha de Artes. Se os valores extras anteriores forem diferentes, a interface avisa e deixa o preço como **A definir** para você escolher o valor unificado. Quantidades vazias permanecem **A definir**. Desativar uma entrega preserva seu registro.

Os anexos e o editor de contratos são acessíveis à equipe da agência autenticada; o portal do cliente mantém seu fluxo atual de produções e aprovações. Os arquivos antigos de produção no Supabase continuam disponíveis pelo fluxo existente.

## Verificação após publicar

1. Cadastre um designer e um videomaker, recarregue e confira os nomes.
2. Abra um contrato, salve texto, anexe um PDF e recarregue. Confira texto e arquivo; use Abrir / baixar.
3. Confirme a soma inicial das artes, ajuste a quantidade, selecione responsáveis e salve pelos botões correspondentes. Recarregue e confira.
4. Teste novamente a produção com um arquivo pequeno e as aprovações existentes.

O novo SQL e a integração com o bucket real precisam ser verificados na sua conta. Os testes locais substituem serviços externos; não executaram SQL nem uploads em produção.
