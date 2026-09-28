# AVESSO V2 — Perfis e Ambientes

Fundação visual do AVESSO com quatro experiências:
- Super Admin AVESSO
- Admin da Agência
- Equipe
- Cliente

## Teste rápido
Abra `index.html` diretamente no navegador. Use os botões no topo para alternar entre os quatro ambientes.

## Arquitetura definida
Login único -> organização -> papel -> permissões -> ambiente.
Papéis base: `super_admin`, `agency_owner`, `agency_admin`, `team_member`, `client_user`.

Esta versão ainda usa dados demonstrativos. A próxima etapa é autenticação + Supabase + RLS/multi-tenant.
