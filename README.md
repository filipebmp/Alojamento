# bookgest — Gestão de Alojamento Local

App (PWA para telemóvel) que automatiza as obrigações de pequenos gestores de
Alojamento Local: check-in online com entrega do código das chaves, prazos de
faturação e SIBA, e taxa municipal turística. Cada gestor instala-a na sua própria
conta Cloudflare: os dados ficam só com ele.

Ver [docs/PRODUTO.md](docs/PRODUTO.md) (plano de produto) e
[docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md) (regras legais).

## O que faz

- **Vários alojamentos** por gestor, cada um com código do cofre, hora de check-in,
  instruções de chegada e regras da taxa turística do seu concelho.
- **Configuração no painel**: na primeira visita, um assistente pede a palavra-passe
  e o primeiro alojamento.
- **Painel de pendentes** ordenado por prazo: formulários por preencher, dados de
  hóspedes em falta, SIBA (3 dias úteis), fatura-recibo (5 dias úteis),
  declaração e pagamento mensal da taxa turística, divergências com o Booking.
- **Check-in online** (PT/EN): o titular da reserva preenche os seus dados, a
  faturação e nome + nascimento dos restantes hóspedes → recebe o código do
  cofre (a partir de 24 h antes do check-in). Os restantes completam os
  documentos até 48 h após o check-in.
- **Taxa turística** por concelho (predefinição de Almada: 2 €/hóspede ≥13 anos/noite,
  máx. 5 noites); resumo mensal para declarar à câmara.
- Feriados nacionais e fins de semana considerados nos prazos em dias úteis.

## Estrutura

```
app/          a app que corre na conta Cloudflare de cada gestor
plataforma/   bookgest.pt: site, pagamentos (Stripe), faturas, licenças, gestão
comum/        código partilhado (protocolo de licenças, palavras-passe)
```

## Publicação automática (GitHub Actions)

Cada push para `main` corre os testes e publica a app e a plataforma no Cloudflare
(configuração da plataforma em [docs/PLATAFORMA.md](docs/PLATAFORMA.md)). Segredos necessários
em *Settings → Secrets and variables → Actions*: `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`. Opcionais (instalações anteriores à configuração no painel):
`ADMIN_PASSWORD`, `SESSION_SECRET`, `CODIGO_CHAVES`.
A base de dados D1 é criada automaticamente na primeira publicação.

## Instalação manual (Cloudflare, plano gratuito)

```sh
npm install
npx wrangler login
cd app
npx wrangler d1 create alojamento        # copiar o database_id para app/wrangler.toml
npx wrangler d1 migrations apply alojamento --remote
npx wrangler deploy
```

Depois abrir `https://<nome>.workers.dev/admin` no telemóvel, escolher a
palavra-passe e criar o primeiro alojamento, e "Adicionar ao ecrã principal".
⚠️ Até a palavra-passe ser escolhida, quem abrir o endereço primeiro pode fazê-lo:
configure-a logo após publicar.

## Desenvolvimento

```sh
npm run db:migrate:local
npm run dev                          # app: http://localhost:8787
npm run db:migrate:plataforma:local
npm run dev:plataforma               # plataforma
npm test
npm run typecheck
```
