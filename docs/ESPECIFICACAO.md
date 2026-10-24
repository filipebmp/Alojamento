# Especificação — Gestão de Alojamento Local

Aplicação pessoal (PWA, instalável no telemóvel) para automatizar as tarefas
repetitivas de **um** Alojamento Local em **Almada**, com reservas pelo
**Booking.com** (30–50 reservas/ano).

> ⚠️ As regras legais abaixo foram recolhidas de fontes públicas (out. 2026) e
> devem ser confirmadas nas fontes oficiais antes de cada automatização.

## 1. Contexto do titular

| Item | Valor |
|---|---|
| Enquadramento | ENI, Categoria B, regime de IVA normal (não isento) |
| Contabilista | Não |
| Faturação | InvoiceXpress (software certificado, via API) |
| Pagamentos | O Booking cobra ao hóspede e transfere para o titular |
| Taxa turística | O Booking cobra ao hóspede; o titular declara e entrega à CM Almada |
| Balcão Virtual Almada | Estabelecimento já inscrito |
| Cofre das chaves | Código fixo |
| Alojamento da app | Cloudflare Workers + D1 (plano gratuito) |

## 2. Regras legais

### 2.1 Faturação (CIVA art. 36.º)
- Emitir **fatura-recibo** até ao 5.º dia útil após o check-out (fim da prestação).
- Cliente: nome + NIF (PT) **ou** país + n.º de identificação fiscal/documento (estrangeiro).
- Linha de alojamento: **IVA 6%** sobre o valor total pago pelo hóspede
  (a comissão do Booking não é descontada).
- Linha da taxa municipal turística: **não sujeita a IVA** (receita municipal).
  *Confirmar menção/motivo a usar no InvoiceXpress.*
- ATCUD, QR Code e comunicação à AT (SAF-T) são tratados pelo InvoiceXpress.

### 2.2 Taxa Municipal Turística de Almada (Regulamento n.º 125/2026)
- Em vigor desde 06/02/2026.
- **2 € por hóspede por noite**, máximo **5 noites** por estadia.
- Idade mínima: **>12 anos** (página da CM) vs **≥13** (outras fontes) — *confirmar*.
- Isenções: alojamento por determinação de entidades públicas, emergência social,
  proteção civil, ou decisão expressa da câmara.
- Declaração **mensal** no Balcão Virtual (n.º hóspedes, dormidas tributáveis,
  valor cobrado), **obrigatória mesmo sem dormidas** — até dia 15 (*confirmar*).
- Pagamento até dia 30 (*confirmar*).
- A app calcula o valor devido e compara com o valor que o Booking cobrou
  (deteta configuração errada da taxa no extranet do Booking).

### 2.3 SIBA — comunicação de hóspedes estrangeiros (Lei 23/2007 art. 16.º; Portaria 415/2008)
- Todos os hóspedes **não portugueses** (incluindo UE, menores e bebés).
- Prazo: **3 dias úteis** após a entrada. Comunicação também da saída.
- Dados: nome, data de nascimento, nacionalidade, país de residência,
  tipo/n.º/país emissor do documento, datas de entrada e saída.
- Portal: https://siba.ssi.gov.pt — sem API pública conhecida;
  a app prepara os dados e alerta (fase posterior: avaliar envio por ficheiro).

### 2.4 IVA trimestral
- Declaração periódica com vendas (IVA 6%) e **autoliquidação** do IVA das
  comissões do Booking (prestador UE): quadro 06, campos 16/17, com dedução.
- A app gera um resumo trimestral (vendas, IVA liquidado, comissões).
  *Validar com contabilista.*

### 2.5 RGPD
- Dados de identificação dos hóspedes são dados pessoais: recolher só o necessário,
  informar o hóspede (aviso de privacidade no formulário), definir prazo de
  conservação e apagar depois. Não guardar fotos de documentos.

## 3. Fluxo de uma reserva

```
1. Reserva no Booking  →  registo na app (manual rápido; importação depois)
2. App gera link único de check-in  →  titular envia por mensagem
3. Titular da reserva preenche o formulário (obrigatório):
     - dados de faturação (nome, NIF/ID, país, morada opcional)
     - n.º de hóspedes e idades (para a taxa turística)
     - os seus dados de identificação (SIBA, se estrangeiro)
4. Formulário completo  →  app revela o CÓDIGO DAS CHAVES
     (só a partir de X horas antes do check-in)
5. Restantes hóspedes preenchem os seus dados até 24/48 h após o check-in
     → lembretes automáticos; alerta ao titular se faltar alguém
6. Dados completos  →  SIBA pronto a submeter (prazo: 3 dias úteis)
7. Check-out  →  fatura-recibo emitida no InvoiceXpress e enviada por email ao hóspede
8. Fim do mês  →  resumo da taxa turística para declarar no Balcão Virtual
9. Fim do trimestre  →  resumo para a declaração periódica de IVA
```

### 3.1 Código das chaves
- Revelado apenas quando o **titular da reserva** completou o formulário e
  falta menos de N horas para o check-in (configurável, ex.: 24 h).
- Guardado cifrado; mostrado na página do hóspede (não enviado em texto livre).
- O cofre atual tem **código fixo**: a app mostra sempre o mesmo código
  (segredo `CODIGO_CHAVES`). Ao mudar o código no cofre, atualizar o segredo.
- Recomendação: mudar o código regularmente (idealmente por reserva).
  Um cofre/fechadura com códigos temporários (ex.: PIN válido só entre
  check-in e check-out) elimina o risco de o código ficar conhecido.
- Os restantes hóspedes têm 24/48 h após o check-in para preencher;
  o prazo SIBA (3 dias úteis) fica cumprido.

## 4. Modelo de dados (inicial)

- **Reserva**: id, referência Booking, check-in, check-out, n.º hóspedes,
  valor total, comissão Booking, taxa turística cobrada pelo Booking, estado.
- **Hóspede**: reserva, é_titular, nome, data nasc., nacionalidade, país residência,
  tipo/n.º/país do documento, NIF (opcional).
- **DadosFaturação**: reserva, nome, NIF/ID, país, morada, email.
- **Fatura**: reserva, id InvoiceXpress, número, data, valor, estado.
- **ComunicaçãoSIBA**: hóspede, data entrada/saída, submetido_em.
- **DeclaraçãoTMT**: mês, hóspedes, dormidas tributáveis, valor, declarado_em, pago_em.

## 5. Arquitetura proposta

- **Frontend**: PWA (instalável, notificações push) — painel do titular + página
  pública do hóspede (link com token).
- **Backend**: API pequena + base de dados (Postgres) + tarefas agendadas
  (lembretes, alertas de prazos, emissão de faturas no check-out).
- **Integrações**: InvoiceXpress API (faturas-recibo); email para envio de faturas.

## 6. Roadmap

1. **MVP**: reservas (manual) + formulário do hóspede + código das chaves +
   cálculo da taxa turística + painel de pendentes com alertas.
2. Emissão automática de fatura-recibo no InvoiceXpress.
3. Resumos mensais (TMT) e trimestrais (IVA) + exportação para SIBA.
4. Importação de reservas (iCal / CSV / email do Booking).

## 7. Em aberto

- [ ] Idade mínima e prazos exatos da TMT de Almada.
- [ ] Menção da taxa turística na fatura (InvoiceXpress).
- [ ] Prazo de conservação dos dados dos hóspedes.
- [ ] Tipo de cofre/fechadura e se suporta códigos temporários.
- [ ] Hosting do backend.
