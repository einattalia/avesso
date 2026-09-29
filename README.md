# AVESSO V9 — Agenda Geral de Gravações

- Agenda de gravações no Dashboard principal
- Cliente + horário inicial/final + local + responsável + observações
- Cadastro e edição pelo calendário
- Detecção de conflito de horários antes de salvar
- Menu Calendário abre a agenda geral em tela ampliada
- Dados persistidos em `recording_sessions` no Supabase

Mantém as funcionalidades das versões anteriores.

Observação: dependências não estão instaladas no pacote local; a validação de build deve ocorrer na Vercel após o deploy.

# AVESSO V3 — Login real + perfis

Conectado ao Supabase Auth e ao projeto AVESSO.

## Fluxo
- Login único por e-mail/senha
- `agency_owner`, `agency_admin`, `team_member` -> ambiente da agência
- `client_user` -> Portal do Cliente
- Sessão persistente e logout
- Organização e cliente carregados do banco com RLS

## Rodar localmente
1. `npm install`
2. confira `.env.local`
3. `npm run dev`

## Deploy Vercel
Cadastre as variáveis de `.env.example` no projeto da Vercel. A publishable key do Supabase é própria para frontend; não use service_role no navegador.
