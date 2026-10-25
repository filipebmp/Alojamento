# bookgest — plano de produto

Transformar a app pessoal num produto para pequenos gestores particulares de
Alojamento Local, **sem que o fornecedor tenha acesso às reservas nem aos dados
dos hóspedes**.

## Decisões

| Tema | Decisão |
|---|---|
| Onde ficam os dados | Na conta Cloudflare (gratuita) de cada gestor — "opção A" |
| Preço | Por alojamento, por mês |
| Código | Fechado (protegido por licença; publicado compactado) |

## Arquitetura

```
┌─────────────────────── FORNECEDOR (bookgest.pt) ───────────────────────┐
│                                                                        │
│  Site comercial        Conta do cliente         Servidor de licenças   │
│  (preços, registo) ──► (pagamento, faturas) ──► e de versões           │
│                                                 sabe: email, NIF,      │
│                                                 plano, n.º alojamentos,│
│                                                 versão instalada       │
│                                                 NÃO sabe: reservas,    │
│                                                 hóspedes, documentos   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ 1. instalação inicial (assistente)
                                   │ 2. "há versão nova?" / "licença ativa?"
                                   ▼
┌──────────── CONTA CLOUDFLARE DO GESTOR (gratuita, em nome dele) ───────┐
│                                                                        │
│   Worker bookgest  ◄──►  Base de dados D1 (reservas, hóspedes, fotos)  │
│                          só o gestor tem acesso                        │
│        ▲                                                               │
│        │ link de check-in                                              │
│   Hóspedes ── formulário ── código do cofre                            │
└────────────────────────────────────────────────────────────────────────┘
```

- **Instalação**: o gestor cria a conta Cloudflare e cola no assistente uma chave
  limitada (Workers + D1). O assistente cria a base de dados e publica a app.
- **Atualizações**: a instalação verifica diariamente se há versão nova
  (assinada pelo fornecedor) e publica-se a si própria.
- **Licença**: a instalação comunica diariamente `{licença, versão, n.º de
  alojamentos ativos}` — só números, sem dados pessoais. Licença caducada ou
  alojamentos a mais → avisos e, depois, sem novos links de check-in. Os dados
  **nunca** ficam bloqueados (o gestor tem obrigação legal de os guardar e consultar).
- **RGPD**: o fornecedor não guarda nem vê dados pessoais dos hóspedes → não é
  subcontratante; vende software.
- **Domínios**: as instalações dos gestores usam o seu `*.workers.dev` ou um
  domínio próprio ligado diretamente ao Cloudflare deles — **nunca** através de um
  proxy do fornecedor (que decifraria o tráfego).
- **Código fechado**: o código corre na conta do gestor e é tecnicamente legível;
  a proteção é contratual (termos de licença) e o valor está no que não se copia:
  atualizações, regras dos concelhos mantidas, suporte.

### Estrutura prevista do repositório

```
app/          a app que corre na conta de cada gestor
plataforma/   bookgest.pt: site, conta do cliente, licenças, versões
comum/        tipos partilhados (licença, protocolo de atualização)
```

A plataforma corre no Cloudflare do fornecedor (Workers + D1) e guarda apenas:
email, nome, NIF de faturação, plano, n.º de alojamentos pagos, versão instalada,
data da última comunicação.

## Fases

### Fase 1 — App instalável por qualquer gestor
- [ ] Vários alojamentos por gestor (nome, morada, n.º de registo AL, código do
  cofre, hora de check-in, passos de chegada).
- [ ] Configuração no painel em vez de variáveis do wrangler; assistente de
  primeiro arranque (palavra-passe, primeiro alojamento).
- [ ] Regras da taxa turística por alojamento, com predefinições por concelho
  (Almada; restantes a acrescentar só com fonte oficial confirmada).
- [ ] Migração dos dados da instalação atual sem perdas.

### Fase 2 — Plataforma comercial (bookgest.pt)
- Página de apresentação, preços, registo.
- Pagamento recorrente por alojamento (Stripe: cartão, Multibanco).
  As faturas têm de sair de um programa **certificado pela AT** (InvoiceXpress,
  Moloni…) ligado ao Stripe.
- Servidor de licenças e de versões (versões assinadas).
- Tirar o bookgest.pt do proxy Hetzner e servi-lo diretamente pelo Cloudflare.

### Fase 3 — Instalador e atualização automática
- Assistente passo a passo (com capturas) para criar a conta Cloudflare e a chave.
- Publicação inicial a partir do bookgest.pt; a chave fica como segredo na conta
  do gestor, não na plataforma.
- O instalador define a palavra-passe inicial (fecha a janela em que o assistente
  de primeiro arranque está aberto a quem chegar primeiro).
- Atualização diária: verificar assinatura, aplicar migrações, publicar.

### Fase 4 — Piloto
- O fornecedor é o cliente n.º 1 (migra para este modelo).
- 3 a 5 gestores conhecidos, grátis, em troca de feedback.
- Termos de utilização, política de privacidade, página de suporte.

### Fase 5 — Funcionalidades que justificam o preço
- Importação iCal do Booking e do Airbnb.
- Comunicação ao SIBA a partir da app.
- Faturas emitidas através do programa de faturação do gestor.
