# AVESSO V11 — Financeiro Operacional Real

## Integração Cloudflare R2

Esta versão mantém Supabase para banco/autenticação e Vercel para hospedagem, com arquivos novos privados no R2. Leia **[CONFIGURAR-R2.md](CONFIGURAR-R2.md)** antes de publicar: inclui o SQL obrigatório, bucket, credenciais, CORS, variáveis e roteiro de teste. **[ARQUITETURA-R2.md](ARQUITETURA-R2.md)** documenta a inspeção do fluxo original e as alterações.

Node 22.x: `npm ci`, `npm test`, `npm run build`. Configure o ambiente com `.env.example`. A aplicação principal fica na raiz; as subpastas são referências antigas.

Foi corrigido também um fechamento de função ausente no JSX da lista financeira original, que impedia a compilação.

Inclui tudo da V10 e adiciona Financeiro real conectado ao Supabase:
- Financeiro geral da agência
- Financeiro por cliente no Cliente 360°
- Mensalidades, extras, cobranças avulsas e custos
- Status A cobrar, Cobrado, Pago e Cancelado
- Vencido calculado automaticamente pela data
- Registro de valor pago, inclusive parcial
- KPIs de a receber, recebido, vencido e custos
- Criar, editar e excluir lançamentos pela interface

O banco usa `public.financial_entries` com RLS por organização/cliente.
