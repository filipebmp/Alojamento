import type { EstadoLicenca } from "../../comum/licenca";
import type { CheckoutSession, Morada, Subscription } from "./stripe";

export interface Licenca {
  id: number;
  chave: string;
  cliente_id: number | null;
  tipo: "stripe" | "cortesia" | "teste";
  stripe_checkout_id: string | null;
  stripe_subscription_id: string | null;
  stripe_estado: string | null;
  alojamentos_pagos: number;
  revogada: number;
  notas: string | null;
  versao: string | null;
  alojamentos_ativos: number | null;
  ultima_comunicacao: string | null;
  url_instalacao: string | null;
  instalada_em: string | null;
  modo: "alojado" | "privado" | null;
  valida_ate: string | null;
  slug: string | null;
  cf_base: string | null;
  versao_publicada: string | null;
  erro_atualizacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Cliente {
  id: number;
  stripe_customer_id: string | null;
  email: string | null;
  nome: string | null;
  nif: string | null;
  pais: string | null;
  morada: string | null;
  codigo_postal: string | null;
  cidade: string | null;
}

// Estados da assinatura no Stripe → estado da licença comunicado à instalação.
export function estadoLicenca(l: Pick<Licenca, "tipo" | "stripe_estado" | "revogada" | "valida_ate">, agora = new Date()): EstadoLicenca {
  if (l.revogada) return "inativa";
  if (l.tipo === "cortesia") return "ativa";
  if (l.tipo === "teste") return l.valida_ate && l.valida_ate > agora.toISOString() ? "ativa" : "inativa";
  switch (l.stripe_estado) {
    case "active":
    case "trialing":
      return "ativa";
    case "past_due":
    case "unpaid":
      return "pagamento_em_atraso";
    default:
      return "inativa";
  }
}

// Chave legível, sem letras ambíguas (0/O, 1/I/L): BG-XXXX-XXXX-XXXX-XXXX.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function gerarChave(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join("");
  return `BG-${letras.match(/.{4}/g)!.join("-")}`;
}

const agoraIso = () => new Date().toISOString();

export function obterLicencaPorChave(db: D1Database, chave: string) {
  return db.prepare("SELECT * FROM licencas WHERE chave = ?").bind(chave).first<Licenca>();
}

export function obterLicencaPorCheckout(db: D1Database, checkoutId: string) {
  return db.prepare("SELECT * FROM licencas WHERE stripe_checkout_id = ?").bind(checkoutId).first<Licenca>();
}

export function obterLicencaPorSubscricao(db: D1Database, subscricaoId: string) {
  return db.prepare("SELECT * FROM licencas WHERE stripe_subscription_id = ?").bind(subscricaoId).first<Licenca>();
}

// Cria ou atualiza o cliente a partir dos dados recolhidos pelo Stripe.
export async function guardarCliente(
  db: D1Database,
  stripeId: string,
  d: { email?: string | null; nome?: string | null; nif?: string | null; morada?: Morada | null },
): Promise<number> {
  const m = d.morada ?? null;
  await db.prepare(
    `INSERT INTO clientes (stripe_customer_id, email, nome, nif, pais, morada, codigo_postal, cidade, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(stripe_customer_id) DO UPDATE SET
       email = COALESCE(excluded.email, email), nome = COALESCE(excluded.nome, nome), nif = COALESCE(excluded.nif, nif),
       pais = COALESCE(excluded.pais, pais), morada = COALESCE(excluded.morada, morada),
       codigo_postal = COALESCE(excluded.codigo_postal, codigo_postal), cidade = COALESCE(excluded.cidade, cidade)`,
  )
    .bind(stripeId, d.email ?? null, d.nome ?? null, d.nif ?? null, m?.country ?? null,
      [m?.line1, m?.line2].filter(Boolean).join(", ") || null, m?.postal_code ?? null, m?.city ?? null, agoraIso())
    .run();
  return (await db.prepare("SELECT id FROM clientes WHERE stripe_customer_id = ?").bind(stripeId).first<number>("id"))!;
}

export const DIAS_TESTE = 30;
export const ALOJAMENTOS_TESTE = 3;

export async function criarTeste(db: D1Database, clienteId: number, agora = new Date()): Promise<number> {
  const iso = agora.toISOString();
  const ate = new Date(agora.getTime() + DIAS_TESTE * 86_400_000).toISOString();
  const res = await db.prepare(
    "INSERT INTO licencas (chave, cliente_id, tipo, alojamentos_pagos, valida_ate, criado_em, atualizado_em) VALUES (?, ?, 'teste', ?, ?, ?, ?)",
  )
    .bind(gerarChave(), clienteId, ALOJAMENTOS_TESTE, ate, iso, iso)
    .run();
  return res.meta.last_row_id;
}

// Chamado pelo webhook e pela página de agradecimento (a que chegar primeiro cria a licença).
// Com client_reference_id (subscrição a partir de um período experimental), a licença existente passa a paga.
export async function garantirLicencaCheckout(db: D1Database, s: CheckoutSession, sub: Subscription): Promise<Licenca> {
  const existente = Number(s.client_reference_id);
  if (existente) {
    await db.prepare(
      `UPDATE licencas SET tipo = 'stripe', stripe_checkout_id = ?, stripe_subscription_id = ?, stripe_estado = ?, alojamentos_pagos = ?,
         valida_ate = NULL, atualizado_em = ? WHERE id = ? AND tipo IN ('teste', 'stripe')`,
    )
      .bind(s.id, sub.id, sub.status, quantidade(sub), agoraIso(), existente)
      .run();
    if (s.customer) {
      await db.prepare("UPDATE clientes SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = (SELECT cliente_id FROM licencas WHERE id = ?)")
        .bind(s.customer, existente)
        .run();
    }
    const l = await obterLicencaPorCheckout(db, s.id);
    if (l) return l;
  }
  const clienteId = s.customer
    ? await guardarCliente(db, s.customer, {
        email: s.customer_details?.email,
        nome: s.customer_details?.name,
        nif: s.customer_details?.tax_ids?.[0]?.value ?? null,
        morada: s.customer_details?.address ?? null,
      })
    : null;
  const agora = agoraIso();
  await db.prepare(
    `INSERT OR IGNORE INTO licencas (chave, cliente_id, tipo, stripe_checkout_id, stripe_subscription_id, stripe_estado,
       alojamentos_pagos, criado_em, atualizado_em)
     VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(gerarChave(), clienteId, s.id, sub.id, sub.status, quantidade(sub), agora, agora)
    .run();
  return (await obterLicencaPorCheckout(db, s.id))!;
}

export function quantidade(sub: Subscription): number {
  return sub.items.data.reduce((n, i) => n + (i.quantity ?? 0), 0);
}

export async function atualizarSubscricao(db: D1Database, sub: Subscription): Promise<void> {
  await db.prepare("UPDATE licencas SET stripe_estado = ?, alojamentos_pagos = ?, atualizado_em = ? WHERE stripe_subscription_id = ?")
    .bind(sub.status, quantidade(sub), agoraIso(), sub.id)
    .run();
}

export async function criarCortesia(
  db: D1Database,
  alojamentos: number,
  notas: string | null,
  destinatario: { email: string; nome: string | null } | null,
): Promise<number> {
  const agora = agoraIso();
  // Cliente sem Stripe: só o necessário para lhe enviar a chave.
  const clienteId = destinatario
    ? (await db.prepare("INSERT INTO clientes (email, nome, criado_em) VALUES (?, ?, ?)").bind(destinatario.email, destinatario.nome, agora).run()).meta.last_row_id
    : null;
  const res = await db.prepare(
    "INSERT INTO licencas (chave, cliente_id, tipo, alojamentos_pagos, notas, criado_em, atualizado_em) VALUES (?, ?, 'cortesia', ?, ?, ?, ?)",
  )
    .bind(gerarChave(), clienteId, alojamentos, notas, agora, agora)
    .run();
  return res.meta.last_row_id;
}

export async function registarComunicacao(db: D1Database, id: number, versao: string, alojamentos: number): Promise<void> {
  await db.prepare("UPDATE licencas SET versao = ?, alojamentos_ativos = ?, ultima_comunicacao = ? WHERE id = ?")
    .bind(versao, alojamentos, agoraIso(), id)
    .run();
}
