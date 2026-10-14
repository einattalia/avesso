# Validação — versão 6, 5 de outubro de 2026

- **42 testes automatizados aprovados:** acesso e isolamento, contratos, briefing, equipe, upload direto, retomada multipart, finalização idempotente, aprovação e mensagens da Meta. Os testes substituem os serviços externos; nenhum WhatsApp real foi enviado.
- **18 arquivos da aplicação passaram na transformação de sintaxe pelo SWC do Next.js.** A correção anterior do JSX do Financeiro foi preservada.
- O SQL adicional foi validado no PostgreSQL do projeto em uma transação revertida ao final. Foram testados aprovação, agendamento, postagem, bloqueio de versões antigas, acesso indevido, envio duplicado, exclusividade da fila e registro do resultado. Dados e estruturas de teste foram desfeitos. **Execute `database/briefing-production-setup.sql` para instalar a atualização.**
- O build completo foi tentado, mas este ambiente bloqueou a criação de `.next/server/app/_not-found` com `EPERM`. **O build completo desta revisão não está confirmado; confira o build na Vercel.**
- Dependências e lockfile incluídos. Verificação local com Node 24.19; o projeto declara Node 22.x para Vercel.
- O ZIP é conferido quanto à integridade e ao conteúdo. Exclui credenciais locais, dependências instaladas e pastas de build.

Não houve publicação deste código na Vercel, envio pela Meta, confirmação de conclusão do PDF real no R2 ou teste visual autenticado das novas telas. Siga `INSTRUCOES-BRIEFING-WHATSAPP.md`. As tabelas antigas continuam dependendo das políticas RLS existentes.
