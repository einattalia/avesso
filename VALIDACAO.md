# Validação da entrega — 5 de outubro de 2026

## Verificações realizadas

- A entrega anterior passou na compilação otimizada com Next.js 16.3.8, gerando a página principal e a rota dinâmica `/api/files`.
- Nesta revisão, o bloco corrigido do Financeiro foi organizado em várias linhas. A compilação do código com Next.js 16.3.8/Webpack passou, sem o erro de sintaxe dos logs. A conclusão do build local foi bloqueada por permissões do ambiente ao criar diretórios de páginas geradas (EPERM), após compilar o código. Portanto, o build completo desta revisão ainda deve ser confirmado na Vercel.
- 16 testes automatizados: aprovados. Exercitam autorização, isolamento de organização, bloqueio de rascunhos no portal, validação de partes e tamanho, repetição da finalização, recuperação após objeto já concluído, falha do banco, compatibilidade Supabase, retry e retomada no navegador.
- Serviços externos são substituídos nos testes. O código real da rota e de autorização é executado; nenhuma credencial de produção é usada nesses testes.
- Na entrega anterior, o servidor de produção local respondeu HTTP 200 na página e HTTP 401 na API de arquivos sem sessão.
- Na entrega anterior, a tela de entrada AVESSO foi verificada no navegador sem erros no console. Não houve login nem alterações no banco do usuário.
- Instalação: 60 pacotes auditados, zero vulnerabilidades reportadas pelo npm no momento da instalação.
- Dependências fixadas com lockfile; teste/compilação executados com Node 24.19.0 disponível no ambiente. O projeto declara Node 22.x para Vercel e não depende de funcionalidades exclusivas de Node 24.
- Corrigido um erro de sintaxe original no fechamento da função usada para renderizar linhas do Financeiro.
- Estilos originais mantidos. Controles adicionais limitados a pausa/descarte de upload, abertura de arquivo e mensagens de erro.

## Ainda requer configuração na conta do usuário

O ZIP original não trouxe definições SQL/RLS, credenciais R2 ou acesso administrativo autenticado. Por isso não foi possível aplicar e executar a função SQL no banco real, conferir suas políticas atuais nem fazer upload multipart no bucket real. O script SQL fornecido amplia o banco existente; valide-o primeiro em uma cópia/ambiente de teste do seu projeto quando disponível.

O roteiro em `CONFIGURAR-R2.md` cobre: upload pequeno, vídeo acima de 2 GB, pausa/retomada, acesso entre clientes/organizações, versões antigas, aprovação e entrega. Esses testes integrados devem ser realizados após cadastrar bucket, CORS, credenciais e variáveis. Não foi publicada uma implantação nem migrado nenhum arquivo antigo.

## Conteúdo de entrega

O ZIP contém a aplicação principal, fontes/referências originais, guia, relatório de arquitetura, SQL, CORS de exemplo, `.env.example`, testes e `package-lock.json`. Não inclui `.env.local`, credenciais, `node_modules`, `.next`, caches ou repositório `.git`.

O ZIP corrigido v2 contém os arquivos diretamente na raiz, sem uma pasta externa `avesso-main`. Os exemplos de bucket e CORS foram preenchidos com `avesso-produtos` e `https://avesso-seven.vercel.app`. As configurações temporárias usadas para verificar a compilação local não fazem parte da entrega.
