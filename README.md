# Gestão de Alojamento Local

App pessoal (PWA para telemóvel) que automatiza as obrigações de um Alojamento
Local em Almada: check-in online com entrega do código das chaves, prazos de
faturação e SIBA, e taxa municipal turística.

Ver [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md).

## O que faz (v0.1)

- **Painel de pendentes** ordenado por prazo: formulários por preencher, dados de
  hóspedes em falta, SIBA (3 dias úteis), fatura-recibo (5 dias úteis),
  declaração e pagamento mensal da taxa turística, divergências com o Booking.
- **Check-in online** (PT/EN): o titular da reserva preenche os seus dados, a
  faturação e nome + nascimento dos restantes hóspedes → recebe o código do
  cofre (a partir de 24 h antes do check-in). Os restantes completam os
  documentos até 48 h após o check-in.
- **Taxa turística de Almada**: 2 €/hóspede ≥13 anos/noite, máx. 5 noites;
  resumo mensal para o Balcão Virtual.
- Feriados nacionais e fins de semana considerados nos prazos em dias úteis.

## Instalação (Cloudflare, plano gratuito)

```sh
npm install
npx wrangler login
npx wrangler d1 create alojamento        # copiar o database_id para wrangler.toml
npm run db:migrate
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET   # texto longo aleatório
npx wrangler secret put CODIGO_CHAVES
npm run deploy
```

Depois abrir `https://<nome>.workers.dev/admin` no telemóvel e
"Adicionar ao ecrã principal".

## Desenvolvimento

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev        # http://localhost:8787
npm test
npm run typecheck
```
