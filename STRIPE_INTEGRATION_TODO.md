# Integração Stripe Checkout (formulário embutido) — o que falta

O pagamento da subscrição do bookgest passou da página alojada do Stripe para um **formulário embutido no site**
(Checkout Session com `ui_mode: "form"`, API `2026-03-25.dahlia`). Este ficheiro é a referência única dos passos em falta.

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [plataforma/wrangler.toml](plataforma/wrangler.toml)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| `STRIPE_PUBLISHABLE_KEY` | `""` (vazio) | A chave publicável do Stripe (`pk_test_…` em teste, `pk_live_…` em produção), do **mesmo modo** que `STRIPE_SECRET_KEY`. Dashboard → Developers → API keys. Não é segredo: fica em `[vars]`. **Enquanto estiver vazia, as vendas ficam fechadas** (o botão Subscrever desaparece e quem está no período experimental não consegue subscrever). |
| `STRIPE_PRECO` (usado em `line_items[].price`) | `price_1UUkF9JxtnFlNZypmsyxEBct` (modo de teste) | Já é um preço real de teste. Para produção, substituir pelo id do preço criado em modo real (4,90 €, mensal, por unidade, IVA incluído). |

`mode` (`"subscription"`) e `line_items` (preço `STRIPE_PRECO`, quantidade = n.º de alojamentos, ajustável de 1 a 50)
já tinham valores reais e foram mantidos.

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [plataforma/src/index.ts](plataforma/src/index.ts) — `POST /comprar` (compra nova) e `POST /assinar` (fim do período experimental)
- [plataforma/src/stripe.ts](plataforma/src/stripe.ts) — versão da API (`VERSAO_CHECKOUT`)
- [plataforma/src/views-instalar.ts](plataforma/src/views-instalar.ts) — página de pagamento (`paginaPagamento`) e aspeto do formulário

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `form` |
| `billing_address_collection` | `auto` |
| `phone_number_collection` | `{ enabled: false }` |
| `automatic_tax` | `{ enabled: false }` |
| `payment_method_collection` | `always` |
| `submit_type` | `auto` |
| `integration_identifier` | `custom_embedded_web_0001` |
| API version (`Stripe-Version`) | `2026-03-25.dahlia` (só nas chamadas que criam a sessão) |
| Appearance | `theme: stripe`, `labels: auto`, `inputs: spaced`, `colorPrimary: #0570de` … (ver `APARENCIA_STRIPE`) |

### Parâmetros removidos e mantidos (rever)

- **Removidos** (já não configurados): `locale` (passou para o Stripe.js: `Stripe(pk, { locale: "pt" })`),
  `allow_promotion_codes`, `customer_email` (em `/assinar`) e **`tax_id_collection`**.
  ⚠️ Sem `tax_id_collection`, o Checkout deixa de pedir o **NIF** ao cliente, e as faturas da subscrição saem sem NIF.
  Se os clientes (empresas) precisarem do NIF na fatura, volte a ativar a recolha do NIF no Checkout Studio e repita esta integração.
- **Substituídos**: `success_url`/`cancel_url` → `return_url` (`/obrigado?sessao={CHECKOUT_SESSION_ID}`), porque o modo `form` só aceita `return_url`.
  O "cancelar" passa a ser o link **← Voltar** da página de pagamento.
- **Mantido**: `client_reference_id` em `/assinar`. É o que liga o pagamento à licença do período experimental (`garantirLicencaCheckout`).
  Sem ele, cada subscrição criaria uma licença nova.

## Setup

1. **Variáveis** (Cloudflare Worker `plataforma`):
   - `STRIPE_PUBLISHABLE_KEY` → em [plataforma/wrangler.toml](plataforma/wrangler.toml) (`[vars]`), publicada a cada push.
   - `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` → segredos do GitHub (Settings → Secrets and variables → Actions). Nunca no código.
   - A página **Gestão → Configuração** mostra se a chave publicável existe e se está no mesmo modo (teste/real) que a secreta.
2. **Dependências**: nenhuma. A plataforma usa a API REST do Stripe sem SDK ([plataforma/src/stripe.ts](plataforma/src/stripe.ts)),
   e o Stripe.js é carregado de `https://js.stripe.com/dahlia/stripe.js` (nunca copiado para o projeto, por exigência PCI).
3. **Webhook** (já existente, sem alterações): `https://bookgest.pt/stripe/webhook` com `checkout.session.completed`,
   `customer.subscription.created|updated|deleted` e `invoice.paid`. Em produção, criar o mesmo endpoint em modo real.

## Ficheiros alterados

- [plataforma/src/index.ts](plataforma/src/index.ts): parâmetros das duas sessões; `/comprar` e `/assinar` devolvem a página de pagamento (envio normal do formulário) ou `{ client_secret }` (pedido com `Accept: application/json`); verificação da chave publicável na gestão.
- [plataforma/src/stripe.ts](plataforma/src/stripe.ts): cabeçalho opcional `Stripe-Version`.
- [plataforma/src/views-instalar.ts](plataforma/src/views-instalar.ts): `paginaPagamento` (contentor `#checkout-form`, `initCheckoutFormSdk`, `createForm({ layout: "expanded" })`, `confirm`).
- [plataforma/src/views.ts](plataforma/src/views.ts): opção `stripeJs` para carregar o Stripe.js no `<head>`.
- [plataforma/wrangler.toml](plataforma/wrangler.toml): `STRIPE_PUBLISHABLE_KEY`.

## Como funciona

1. O cliente escolhe o n.º de alojamentos em **Preço** (bookgest.pt/#precos) ou em **/assinar** (fim do teste) e carrega em Subscrever.
2. O formulário é enviado para `/comprar` ou `/assinar`, que mostra a página de pagamento do bookgest.
3. A página volta a chamar o mesmo endereço em JSON. O servidor cria a Checkout Session (`ui_mode: "form"`, API Dahlia) e devolve só o `client_secret`.
4. O Stripe.js mostra o formulário de pagamento dentro da página. Em **confirm**, o Stripe cobra e leva o cliente para `/obrigado?sessao=…`.
5. `/obrigado` e o webhook `checkout.session.completed` criam ou atualizam a licença, como antes.

## Testes

- Com as chaves de teste (`sk_test_…` + `pk_test_…`), use o cartão **4242 4242 4242 4242**, qualquer data futura e qualquer CVC.
- Autenticação 3D Secure: **4000 0025 0000 3155**. Cartão recusado: **4000 0000 0000 9995**.
- Mais cartões: https://docs.stripe.com/testing
- Confirmar no fim: a licença aparece em **Gestão → Licenças** como `stripe`, e a subscrição aparece no Dashboard do Stripe.
- Testar também o percurso de fim do período experimental: abrir `/assinar?chave=<chave de teste>` e subscrever. A mesma licença deve passar a `stripe`.

## Próximos passos

- Pôr o **Stripe em produção**: ativar a conta, criar o preço em modo real, configurar o portal do cliente e o webhook em modo real,
  e trocar `STRIPE_PRECO`, `STRIPE_PORTAL` e `STRIPE_PUBLISHABLE_KEY` (wrangler.toml) e os dois segredos (GitHub).
- Decidir sobre o **NIF** (ver acima) e sobre os **códigos promocionais** (`allow_promotion_codes` foi removido).
- Fazer uma compra real de 1 alojamento e cancelá-la ou reembolsá-la no Stripe, para validar o percurso completo.
- Faturas: enquanto o InvoiceXpress não estiver configurado, cada pagamento aparece em **Gestão → Faturas** para emitir à mão.

## Recursos

- Suporte do Stripe: https://support.stripe.com
- Stripe MCP (documentação e ferramentas para agentes): https://docs.stripe.com/mcp
