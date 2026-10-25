# bookgest — plano de produto

Transformar a app pessoal num produto para pequenos gestores particulares de
Alojamento Local, **sem que o fornecedor tenha acesso às reservas nem aos dados
dos hóspedes**.

## Decisões

| Tema | Decisão |
|---|---|
| Onde ficam os dados | Dois modos: **Simples** (por omissão, alojado na conta do fornecedor, uma app e uma base por cliente; o fornecedor é subcontratante RGPD) e **Privado** (na conta Cloudflare do gestor, sem acesso do fornecedor) |
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
- [x] Vários alojamentos por gestor (nome, morada, n.º de registo AL, código do
  cofre, hora de check-in, passos de chegada).
- [x] Configuração no painel em vez de variáveis do wrangler; assistente de
  primeiro arranque (palavra-passe, primeiro alojamento).
- [x] Regras da taxa turística por alojamento, com predefinições por concelho
  (Almada; restantes a acrescentar só com fonte oficial confirmada).
- [x] Migração dos dados da instalação atual sem perdas.

### Fase 2 — Plataforma comercial (bookgest.pt)
Código em `plataforma/`; passos de configuração em [PLATAFORMA.md](PLATAFORMA.md).
- [x] Página de apresentação e preço (o botão de compra só aparece com `VENDAS_ABERTAS = "sim"`).
- [x] Pagamento recorrente por alojamento com Stripe Checkout; alterações e
  cancelamento no portal de cliente do Stripe (sem contas de utilizador próprias).
- [x] Faturas-recibo emitidas no InvoiceXpress (certificado pela AT) a cada pagamento;
  sem InvoiceXpress, ficam "por emitir" na página de gestão.
- [x] Servidor de licenças: cada instalação comunica diariamente chave, versão e
  n.º de alojamentos ativos; a app mostra avisos (sem bloquear nada).
- [x] Página de gestão do fornecedor (`/gestao`): licenças, cortesias, faturas.
- [ ] Configurar Stripe, InvoiceXpress e atividade nas Finanças (fornecedor).
- [ ] Mudar o DNS do bookgest.pt para o Cloudflare e ligar o domínio à plataforma
  (sai do proxy Hetzner).

### Entre fases — Utilizadores (feito)
- [x] Entrada com email e palavra-passe; vários utilizadores com os papéis gestor e equipa.
- [x] Recuperação com códigos de recuperação (gestor); a equipa pede ao gestor.
- [x] Recuperação por email (todos os utilizadores): a instalação pede à plataforma que
  envie o link (Resend, a partir de bookgest.pt). O link só funciona no browser onde foi
  pedido (segunda parte secreta num cookie), por isso nem a plataforma nem o Resend o
  conseguem usar. A plataforma só guarda um hash do destinatário, para limitar abusos.

### Fase 3 — Instalador e atualização automática (feito; falta testar com uma conta Cloudflare real)
Passos de configuração em [PLATAFORMA.md](PLATAFORMA.md) (secções 6 e 7).
- [x] Instalador em `/instalar`: chave de licença → conta e chave de API do Cloudflare → base de dados,
  migrações, publicação, workers.dev e cron diário na conta do gestor. A chave de API fica como segredo
  na conta do gestor; a plataforma só guarda o endereço da instalação.
- [x] Código de uso único no fim da instalação para criar a conta de gestor.
- [x] Versões assinadas (Ed25519) no GitHub Actions; a plataforma e as instalações só aceitam versões
  com assinatura válida.
- [x] Atualização diária: migrações em falta + publicação do novo código, mantendo as ligações.
- [x] Novas reservas suspensas ao fim de 14 dias de licença inativa ou alojamentos a mais
  (dados e reservas existentes sempre acessíveis).
- [x] O email da licença de cortesia leva o link do instalador.

Plano original:
- Assistente passo a passo (com capturas) para criar a conta Cloudflare e a chave.
- Publicação inicial a partir do bookgest.pt; a chave fica como segredo na conta
  do gestor, não na plataforma.
- Servidor de versões (versões assinadas).
- Bloqueio de novos links de check-in com licença inativa ou alojamentos a mais
  (depois de um período de aviso).
- O instalador cria a conta de gestor (fecha a janela em que o assistente
  de primeiro arranque está aberto a quem chegar primeiro).
- Atualização diária: verificar assinatura, aplicar migrações, publicar.

### Modo Simples (alojado pelo bookgest)
Passos de configuração em [PLATAFORMA.md](PLATAFORMA.md) (secção 8).
- [x] Registo com confirmação de email e 30 dias grátis sem cartão (`/registar`, fechado até
  `REGISTOS_ABERTOS = "sim"`); subscrição no fim do teste (`/assinar`) ligada à mesma licença.
- [x] Criação automática da instalação na conta do fornecedor: app `bk-<nome>` e base D1 própria por cliente.
- [x] Licenças compradas ou de cortesia sem instalação: escolher entre "Criar" (alojado) e "Instalar" (privado).
- [x] Atualização central das instalações alojadas pela plataforma (de hora a hora, 5 por execução).
- [x] Termos provisórios (`/termos`).
- [ ] Contrato de subcontratação de dados e termos revistos por advogado.
- [ ] Endereços `<nome>.bookgest.pt` (depois de o DNS do bookgest.pt passar para o Cloudflare).

### Funcionalidades (a partir da análise dos concorrentes: stay'in, EazyAL, Hostkit)
- [x] Importação de reservas pelos calendários iCal do Booking e do Airbnb (de hora a hora).
- [ ] Completar nome, preço e hóspedes a partir dos emails de confirmação reencaminhados.
- [ ] SIBA automático (ficheiro; Web Service a confirmar com siba@ssi.gov.pt).
- [ ] Modelo 30 e resumo do IVA; faturação certificada (InvoiceXpress/Moloni) do gestor.
- [ ] Página do hóspede em mais línguas, guia local, leitura do documento por fotografia.
- [ ] Apagar os dados dos hóspedes após o prazo legal; receita real por estadia; limpezas.

### Fase 4 — Piloto
- O fornecedor é o cliente n.º 1 (migra para este modelo).
- 3 a 5 gestores conhecidos, grátis, em troca de feedback.
- Termos de utilização, política de privacidade, página de suporte.

### Fase 5 — Funcionalidades que justificam o preço
- Importação iCal do Booking e do Airbnb.
- Comunicação ao SIBA a partir da app.
- Faturas emitidas através do programa de faturação do gestor.
