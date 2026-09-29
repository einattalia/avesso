# AVESSO V11 — Financeiro Operacional Real

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
