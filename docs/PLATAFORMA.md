# Plataforma bookgest.pt — configuração

A plataforma (`plataforma/`) é publicada automaticamente, a cada push para `main`, em
`https://bookgest-plataforma.filipebmp.workers.dev`. Sem a configuração abaixo funciona
em modo "em breve": mostra o site, mas não vende.

Páginas: `/` (site), `/gestao` (licenças e faturas, só para o fornecedor),
`/api/v1/licenca` (chamada pelas instalações), `/stripe/webhook`.

## 0. Antes de vender (fora do código)

- **Finanças**: a venda de software tem de estar coberta pela atividade aberta
  (CAE adequado, IVA 23%). Confirmar com um contabilista.
- **Termos de utilização e política de privacidade** (previsto para a Fase 4).

## 1. Acesso à gestão

GitHub → *Settings → Secrets and variables → Actions* → novo segredo
`PLATAFORMA_ADMIN_PASSWORD`. Depois do próximo push: `/gestao`.

Primeiro passo útil: criar uma **licença de cortesia** para a sua própria instalação e
colá-la no painel da app, em *Definições → Licença*.

## 2. Stripe

Fazer tudo primeiro em **modo de teste** (chaves `sk_test_…`) e só depois repetir em modo real.

1. Criar a conta em stripe.com e preencher os dados da atividade.
2. *Product catalog* → novo produto "bookgest" com um preço **recorrente mensal**, em EUR,
   **com IVA incluído** (*Include tax in price*). Copiar o id do preço (`price_…`) para
   `STRIPE_PRECO` em `plataforma/wrangler.toml`.
3. *Developers → API keys* → chave secreta → segredo do GitHub `STRIPE_SECRET_KEY`.
4. *Developers → Webhooks* → novo destino:
   - endereço: `https://bookgest-plataforma.filipebmp.workers.dev/stripe/webhook`
     (mudar para `https://bookgest.pt/stripe/webhook` depois do passo 5);
   - eventos: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`;
   - segredo de assinatura (`whsec_…`) → segredo do GitHub `STRIPE_WEBHOOK_SECRET`.
5. *Settings → Billing → Customer portal*: permitir alterar a quantidade, o método de
   pagamento e cancelar; ativar o **link de acesso** dos clientes e copiá-lo para
   `STRIPE_PORTAL` em `plataforma/wrangler.toml`.
6. *Settings → Payment methods*: cartão e Débito Direto SEPA. (O Multibanco do Stripe
   serve para pagamentos únicos, não para assinaturas mensais.)
7. Em `plataforma/wrangler.toml`: `VENDAS_ABERTAS = "sim"` e `CONTACTO = "<email>"`.

Teste: comprar com o cartão de teste `4242 4242 4242 4242` → a página de agradecimento
mostra a chave → a licença aparece em `/gestao`.

## 3. InvoiceXpress (faturas certificadas)

Sem isto, cada pagamento fica "por emitir" em `/gestao/faturas`, para emitir à mão e
registar o número.

1. Na conta InvoiceXpress: *Definições → API* → chave → segredo do GitHub
   `INVOICEXPRESS_API_KEY`.
2. `INVOICEXPRESS_CONTA` em `plataforma/wrangler.toml` = o subdomínio da conta
   (`<conta>.app.invoicexpress.com`).
3. Confirmar que existe um imposto chamado `IVA23` (ou mudar `INVOICEXPRESS_IMPOSTO`).
4. ⚠️ A ligação ao InvoiceXpress ainda não foi testada contra a API real: fazer o
   primeiro pagamento em modo de teste e confirmar a fatura-recibo (valores, IVA,
   NIF do cliente) antes de abrir as vendas.

## 4. Resend (emails de recuperação de palavra-passe)

Sem isto, a recuperação funciona só com os códigos de recuperação dos gestores.

1. Criar conta em resend.com → *Domains → Add domain* → `bookgest.pt`.
2. Copiar os registos DNS indicados pelo Resend (SPF e DKIM, normalmente num subdomínio
   como `send.bookgest.pt` e em `resend._domainkey`) para o DNS do bookgest.pt (hoje na
   amen.pt; depois do passo 5, no Cloudflare). Não alteram o site nem outros emails.
3. Esperar que o Resend marque o domínio como verificado.
4. *API Keys → Create API key* (permissão "Sending access") → segredo do GitHub
   `RESEND_API_KEY`. O remetente é `EMAIL_REMETENTE` em `plataforma/wrangler.toml`.
5. Em `/gestao`, a linha "Email (Resend)" passa a ✅. Testar em `bookgest.pt/recuperar`.

## 5. Domínio bookgest.pt → plataforma

Hoje o bookgest.pt mostra a instalação do fornecedor através do proxy Hetzner. Passa a
mostrar a plataforma, servida diretamente pelo Cloudflare:

1. Cloudflare → *Add a domain* → `bookgest.pt` (plano Free). O Cloudflare indica dois
   servidores de nomes.
2. Na amen.pt, trocar os servidores de nomes do bookgest.pt pelos do Cloudflare e esperar
   pela ativação.
3. Num push para `main`:
   - `plataforma/wrangler.toml`: `URL_PUBLICO = "https://bookgest.pt"` e
     `INSTALACAO_ANTIGA = "https://gestao-alojamento-local.filipebmp.workers.dev"`
     (os links de check-in já enviados a hóspedes e o endereço `/admin` continuam a funcionar);
   - `app/wrangler.toml`: `URL_PUBLICO` = endereço da instalação (o `workers.dev`, ou um
     subdomínio próprio ligado a ela no Cloudflare) e apagar `URL_LICENCAS`.
4. Cloudflare → *Workers* → `bookgest-plataforma` → *Settings → Domains & Routes* →
   adicionar `bookgest.pt` e `www.bookgest.pt` (substituem os registos que apontavam para
   91.99.18.25).
5. No servidor Hetzner: `rm /opt/proxy/sites/bookgest.caddy && bash /opt/proxy/recarregar.sh`.
6. No Stripe, mudar o endereço do webhook para `https://bookgest.pt/stripe/webhook`.

## 6. Assinatura das versões (atualizações automáticas)

As instalações dos gestores só aceitam versões assinadas com a chave privada que existe apenas
no GitHub. Gerar o par de chaves **uma vez**, num computador seguro (por exemplo no servidor Hetzner):

```sh
openssl genpkey -algorithm ed25519 -out bookgest-assinatura.pem
cat bookgest-assinatura.pem                     # conteúdo completo → segredo do GitHub BOOKGEST_CHAVE_ASSINATURA
openssl pkey -in bookgest-assinatura.pem -pubout -outform DER | tail -c 32 | base64   # chave pública
```

- A chave pública vai para `CHAVE_PUBLICA_VERSOES` em `comum/versoes.ts`.
- Guardar uma cópia da chave privada num sítio seguro e offline e apagar o ficheiro do servidor.
  **Nunca** a partilhar: quem a tiver pode enviar código para as instalações dos gestores.
- Cada alteração à app que deva chegar aos gestores precisa de aumentar `VERSAO` em `app/src/versao.ts`.

## 7. Instalador

- Endereço: `https://bookgest-plataforma.filipebmp.workers.dev/instalar` (depois do passo 5,
  `https://bookgest.pt/instalar`). O email da licença de cortesia já leva o link com a chave.
- Enquanto o bookgest.pt passa pelo proxy Hetzner, acrescentar as rotas da plataforma no Caddy (ver secção 8).
- Antes do primeiro gestor: testar numa conta Cloudflare própria (cria um Worker e uma base `bookgest`,
  que se podem apagar depois).

## 8. Modo Simples (instalações alojadas na conta do fornecedor)

- Cada cliente tem uma app `bk-<nome>` e uma base D1 `bk-<nome>` na conta Cloudflare do fornecedor, em
  `https://bk-<nome>.filipebmp.workers.dev`. A plataforma cria-as e atualiza-as com a chave da publicação
  (`CLOUDFLARE_API_TOKEN`, enviada à plataforma como `CF_API_TOKEN`).
- **Plano Workers Paid** (≈ 5 $/mês) na conta do fornecedor antes dos primeiros clientes: o plano gratuito só
  permite 10 bases D1 e 100 Workers.
- Abrir os registos: `REGISTOS_ABERTOS = "sim"` em `plataforma/wrangler.toml` (exige o Resend configurado).
  Antes disso: termos e contrato de subcontratação de dados revistos (a página `/termos` é provisória).
- Rotas da plataforma no Caddy, enquanto o bookgest.pt passa pelo servidor Hetzner:

```bash
sed -i 's#@plataforma path .*#@plataforma path /gestao /gestao/* /site.css /instalar /instalar/* /api/* /registar /registar/* /criar /assinar /obrigado /comprar /termos /stripe/*#' /opt/proxy/sites/bookgest.caddy && bash /opt/proxy/recarregar.sh
```
