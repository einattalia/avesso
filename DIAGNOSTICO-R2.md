# Diagnóstico do endereço R2 — versão 4

Esta revisão mantém contratos, equipe e produções. Ela valida o formato de `R2_ACCOUNT_ID`, remove espaços nas extremidades das configurações R2 e diferencia falhas de DNS na resposta. O log inclui a operação e o hostname conhecido que falhou, sem registrar chaves ou arquivos.

O erro `ENOTFOUND` informa que um endereço não pôde ser resolvido; por si só, não confirma qual variável ou serviço está incorreto. A nova revisão melhora o diagnóstico, mas não substitui a verificação da configuração da implantação.

## Publicar

Substitua os arquivos do repositório pelo conteúdo deste ZIP e faça commit. Para aplicar somente esta revisão sobre a versão 3, os arquivos de aplicação alterados são:

- `lib/r2-config.mjs` (novo)
- `lib/r2-server.js`
- `app/api/files/route.js`

Não há novo SQL nesta revisão. As tabelas e funções da versão 3 já foram confirmadas no Supabase conectado. As variáveis existentes continuam sendo utilizadas.

Após o deploy novo ficar Ready, tente anexar o PDF. Se houver falha, abra Vercel → AVESSO → Logs e procure `AVESSO file operation failed`. O registro passa a conter `code`, `operation` e `hostname`. O hostname permite conferir o endereço realmente utilizado na implantação.

## Validação

33 testes locais passaram, incluindo identificador inválido, espaços, erro DNS encadeado e falha no início do upload. A sintaxe dos 13 arquivos da aplicação foi transformada pelo SWC do Next.js. Os testes usam serviços externos substituídos. Não foi confirmado upload real nem executado um novo build completo nesta revisão; o build local anterior foi bloqueado por permissões de escrita do ambiente. O deploy e as variáveis de produção não foram alterados por este trabalho.
