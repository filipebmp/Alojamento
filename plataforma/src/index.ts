import { type Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { CAMINHO_API_LICENCA, type RespostaLicenca, pedidoValido } from "../../comum/licenca";
import { iguais } from "../../comum/senha";
import { type ConfigInvoiceXpress, type Fatura, emitirFatura, registarFatura } from "./faturas";
import {
  type Cliente,
  type Licenca,
  atualizarSubscricao,
  criarCortesia,
  estadoLicenca,
  garantirLicencaCheckout,
  guardarCliente,
  obterLicencaPorCheckout,
  obterLicencaPorChave,
  registarComunicacao,
} from "./licencas";
import { type CheckoutSession, type Evento, type Invoice, type Price, type Subscription, assinaturaValida, stripe } from "./stripe";
import { paginaEntrar, paginaFaturas, paginaInicio, paginaLicencas, paginaMensagem, paginaObrigado } from "./views";

type Env = {
  DB: D1Database;
  URL_PUBLICO?: string;
  CONTACTO?: string;
  VENDAS_ABERTAS?: string; // "sim" para mostrar o botão de compra
  STRIPE_PRECO?: string; // id do preço mensal por alojamento (price_…)
  STRIPE_PORTAL?: string; // link de acesso ao portal do cliente (alterar, cancelar)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ADMIN_PASSWORD?: string; // acesso à página de gestão
  INVOICEXPRESS_CONTA?: string;
  INVOICEXPRESS_API_KEY?: string;
  INVOICEXPRESS_IMPOSTO?: string;
  // Endereço da instalação que servia o bookgest.pt antes da plataforma: os links já enviados a hóspedes continuam a funcionar.
  INSTALACAO_ANTIGA?: string;
};

type Ctx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// ---------- Transição: bookgest.pt servia a instalação do fornecedor ----------

for (const caminho of ["/c/*", "/admin", "/admin/*", "/login", "/logout", "/configurar"]) {
  app.all(caminho, async (c, next) => {
    if (!c.env.INSTALACAO_ANTIGA) return next();
    const url = new URL(c.req.url);
    return c.redirect(new URL(url.pathname + url.search, c.env.INSTALACAO_ANTIGA).toString(), 307);
  });
}

// ---------- Site público ----------

let precoEmCache: { cents: number | null; ate: number } | null = null;
let erroPreco: string | null = null; // mostrado na gestão para diagnosticar a configuração do Stripe

async function precoMensal(env: Env): Promise<number | null> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRECO) return null;
  if (precoEmCache && precoEmCache.ate > Date.now()) return precoEmCache.cents;
  try {
    const p = await stripe<Price>(env.STRIPE_SECRET_KEY, "GET", `/prices/${env.STRIPE_PRECO}`);
    precoEmCache = { cents: p.unit_amount, ate: Date.now() + 3_600_000 };
    erroPreco = null;
    return p.unit_amount;
  } catch (e) {
    console.error("Preço do Stripe indisponível", e);
    erroPreco = String(e instanceof Error ? e.message : e);
    return null;
  }
}

const vendasAbertas = (env: Env) => env.VENDAS_ABERTAS === "sim" && !!env.STRIPE_SECRET_KEY && !!env.STRIPE_PRECO;
const urlBase = (c: Ctx) => c.env.URL_PUBLICO || new URL(c.req.url).origin;

app.get("/", async (c) =>
  c.html(paginaInicio({ precoCents: await precoMensal(c.env), vendasAbertas: vendasAbertas(c.env), contacto: c.env.CONTACTO ?? null,
    portal: c.env.STRIPE_PORTAL || null })),
);

app.post("/comprar", async (c) => {
  if (!vendasAbertas(c.env)) return c.html(paginaMensagem("Em breve", "As vendas ainda não estão abertas."), 403);
  const { alojamentos } = await c.req.parseBody<{ alojamentos: string }>();
  const n = Number(alojamentos);
  if (!Number.isInteger(n) || n < 1 || n > 50) return c.html(paginaMensagem("Número inválido", "Indique entre 1 e 50 alojamentos."), 400);
  const base = urlBase(c);
  const sessao = await stripe<{ url: string }>(c.env.STRIPE_SECRET_KEY!, "POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: c.env.STRIPE_PRECO, quantity: n, adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 } }],
    success_url: `${base}/obrigado?sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/#precos`,
    locale: "pt",
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    allow_promotion_codes: true,
  });
  return c.redirect(sessao.url, 303);
});

app.get("/obrigado", async (c) => {
  const id = c.req.query("sessao") ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return c.notFound();
  let licenca = await obterLicencaPorCheckout(c.env.DB, id);
  // O webhook pode chegar depois do cliente: nesse caso a licença é criada aqui, com os dados confirmados pelo Stripe.
  if (!licenca && c.env.STRIPE_SECRET_KEY) {
    const s = await stripe<CheckoutSession>(c.env.STRIPE_SECRET_KEY, "GET", `/checkout/sessions/${id}`, { expand: ["subscription"] });
    if (s.status === "complete" && s.subscription && typeof s.subscription === "object") {
      licenca = await garantirLicencaCheckout(c.env.DB, s, s.subscription);
    }
  }
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.html(paginaObrigado(licenca?.chave ?? null, c.env.CONTACTO ?? null, c.env.STRIPE_PORTAL || null));
});

// ---------- Webhooks do Stripe ----------

app.post("/stripe/webhook", async (c) => {
  const corpo = await c.req.text();
  if (!c.env.STRIPE_WEBHOOK_SECRET || !(await assinaturaValida(corpo, c.req.header("Stripe-Signature"), c.env.STRIPE_WEBHOOK_SECRET))) {
    return c.text("Assinatura inválida", 400);
  }
  const evento = JSON.parse(corpo) as Evento;
  const db = c.env.DB;
  if (await db.prepare("SELECT 1 FROM eventos_stripe WHERE id = ?").bind(evento.id).first()) return c.text("ok");

  // Todos os passos são idempotentes: se algum falhar, o Stripe reenvia o evento e o tratamento é repetido.
  switch (evento.type) {
    case "checkout.session.completed": {
      const s = evento.data.object as CheckoutSession;
      const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
      if (subId && c.env.STRIPE_SECRET_KEY) {
        const sub = await stripe<Subscription>(c.env.STRIPE_SECRET_KEY, "GET", `/subscriptions/${subId}`);
        await garantirLicencaCheckout(db, s, sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await atualizarSubscricao(db, evento.data.object as Subscription);
      break;
    case "invoice.paid": {
      const i = evento.data.object as Invoice;
      // Os dados de faturação da fatura do Stripe são os que vão para a fatura-recibo.
      await guardarCliente(db, i.customer, {
        email: i.customer_email,
        nome: i.customer_name,
        nif: i.customer_tax_ids?.[0]?.value ?? null,
        morada: i.customer_address,
      });
      const fatura = await registarFatura(db, i);
      const ix = configInvoiceXpress(c.env);
      if (fatura && ix) c.executionCtx.waitUntil(emitirFatura(db, fatura, ix));
      break;
    }
  }
  await db.prepare("INSERT OR IGNORE INTO eventos_stripe (id, tipo, recebido_em) VALUES (?, ?, ?)")
    .bind(evento.id, evento.type, new Date().toISOString())
    .run();
  return c.text("ok");
});

function configInvoiceXpress(env: Env): ConfigInvoiceXpress | null {
  if (!env.INVOICEXPRESS_CONTA || !env.INVOICEXPRESS_API_KEY) return null;
  return { conta: env.INVOICEXPRESS_CONTA, apiKey: env.INVOICEXPRESS_API_KEY, imposto: env.INVOICEXPRESS_IMPOSTO || "IVA23", taxaIva: 0.23 };
}

// ---------- API de licenças (chamada diariamente por cada instalação) ----------

app.post(CAMINHO_API_LICENCA, async (c) => {
  const pedido = await c.req.json().catch(() => null);
  if (!pedidoValido(pedido)) return c.json({ erro: "Pedido inválido" }, 400);
  const licenca = await obterLicencaPorChave(c.env.DB, pedido.chave);
  if (!licenca) return c.json<RespostaLicenca>({ estado: "desconhecida", alojamentosPagos: 0 });
  await registarComunicacao(c.env.DB, licenca.id, pedido.versao, pedido.alojamentos);
  return c.json<RespostaLicenca>({ estado: estadoLicenca(licenca), alojamentosPagos: licenca.alojamentos_pagos });
});

// ---------- Gestão (fornecedor) ----------

const COOKIE = "gestao";

async function segredoSessao(db: D1Database): Promise<string> {
  const aleatorio = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  await db.prepare("INSERT OR IGNORE INTO definicoes (chave, valor) VALUES ('segredo_sessao', ?)").bind(aleatorio).run();
  return (await db.prepare("SELECT valor FROM definicoes WHERE chave = 'segredo_sessao'").first<string>("valor"))!;
}

app.get("/gestao/entrar", (c) => c.html(paginaEntrar()));

app.post("/gestao/entrar", async (c) => {
  const { password } = await c.req.parseBody<{ password: string }>();
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  if (!c.env.ADMIN_PASSWORD || !iguais(await hash(String(password ?? "")), await hash(c.env.ADMIN_PASSWORD))) {
    return c.html(paginaEntrar(c.env.ADMIN_PASSWORD ? "Palavra-passe errada." : "Gestão desativada: defina ADMIN_PASSWORD."), 401);
  }
  await setSignedCookie(c, COOKIE, "fornecedor", await segredoSessao(c.env.DB), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/gestao",
    maxAge: 60 * 60 * 24 * 7,
  });
  return c.redirect("/gestao");
});

app.post("/gestao/sair", (c) => {
  deleteCookie(c, COOKIE, { path: "/gestao" });
  return c.redirect("/gestao/entrar");
});

const exigirSessao = async (c: Ctx, next: () => Promise<void>) => {
  if ((await getSignedCookie(c, await segredoSessao(c.env.DB), COOKIE)) !== "fornecedor") return c.redirect("/gestao/entrar");
  await next();
};
app.use("/gestao", exigirSessao);
app.use("/gestao/licencas/*", exigirSessao);
app.use("/gestao/licencas", exigirSessao);
app.use("/gestao/faturas", exigirSessao);
app.use("/gestao/faturas/*", exigirSessao);

async function mostrarLicencas(c: Ctx, novaChave?: string) {
  const [licencas, clientes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM licencas ORDER BY id DESC").all<Licenca>(),
    c.env.DB.prepare("SELECT * FROM clientes").all<Cliente>(),
  ]);
  const porId = new Map(clientes.results.map((x) => [x.id, x]));
  const preco = await precoMensal(c.env);
  const env = c.env;
  const estado = [
    { nome: "Chave secreta do Stripe", ok: !!env.STRIPE_SECRET_KEY, detalhe: env.STRIPE_SECRET_KEY ? (env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "modo de teste" : env.STRIPE_SECRET_KEY.slice(0, 8) + "…") : "segredo STRIPE_SECRET_KEY em falta" },
    { nome: "Preço", ok: preco != null, detalhe: preco != null ? `${(preco / 100).toFixed(2).replace(".", ",")} € por alojamento` : erroPreco ?? (env.STRIPE_PRECO ? "sem resposta" : "STRIPE_PRECO em falta") },
    { nome: "Segredo do webhook", ok: !!env.STRIPE_WEBHOOK_SECRET, detalhe: env.STRIPE_WEBHOOK_SECRET ? "definido" : "segredo STRIPE_WEBHOOK_SECRET em falta" },
    { nome: "Vendas abertas", ok: vendasAbertas(env), detalhe: env.VENDAS_ABERTAS === "sim" ? "sim" : "não" },
    { nome: "InvoiceXpress", ok: !!configInvoiceXpress(env), detalhe: configInvoiceXpress(env) ? env.INVOICEXPRESS_CONTA! : "não configurado (faturas à mão)" },
  ];
  return c.html(paginaLicencas(licencas.results.map((l) => ({ licenca: l, cliente: l.cliente_id ? porId.get(l.cliente_id) ?? null : null })), estado, novaChave));
}

app.get("/gestao", async (c) => {
  const nova = Number(c.req.query("nova"));
  const chave = nova ? await c.env.DB.prepare("SELECT chave FROM licencas WHERE id = ?").bind(nova).first<string>("chave") : null;
  return mostrarLicencas(c, chave ?? undefined);
});

app.post("/gestao/licencas", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const n = Number(b.alojamentos);
  if (!Number.isInteger(n) || n < 1 || n > 1000) return c.text("Número de alojamentos inválido.", 400);
  const chave = await criarCortesia(c.env.DB, n, b.notas?.trim() || null);
  const id = await c.env.DB.prepare("SELECT id FROM licencas WHERE chave = ?").bind(chave).first<number>("id");
  // Redireciona: atualizar a página não volta a submeter o formulário (nem cria outra licença).
  return c.redirect(`/gestao?nova=${id}`);
});

// Só cortesias que nunca foram usadas por uma instalação (ex.: criadas por engano).
app.post("/gestao/licencas/:id/apagar", async (c) => {
  await c.env.DB.prepare("DELETE FROM licencas WHERE id = ? AND tipo = 'cortesia' AND ultima_comunicacao IS NULL")
    .bind(Number(c.req.param("id")))
    .run();
  return c.redirect("/gestao");
});

app.post("/gestao/licencas/:id/:acao{revogar|reativar}", async (c) => {
  await c.env.DB.prepare("UPDATE licencas SET revogada = ?, atualizado_em = ? WHERE id = ? AND tipo = 'cortesia'")
    .bind(c.req.param("acao") === "revogar" ? 1 : 0, new Date().toISOString(), Number(c.req.param("id")))
    .run();
  return c.redirect("/gestao");
});

app.get("/gestao/faturas", async (c) => {
  const [faturas, clientes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM faturas ORDER BY pago_em DESC").all<Fatura>(),
    c.env.DB.prepare("SELECT * FROM clientes").all<Cliente>(),
  ]);
  const porId = new Map(clientes.results.map((x) => [x.id, x]));
  return c.html(paginaFaturas(
    faturas.results.map((f) => ({ fatura: f, cliente: f.cliente_id ? porId.get(f.cliente_id) ?? null : null })),
    !!configInvoiceXpress(c.env),
  ));
});

app.post("/gestao/faturas/:id/emitir", async (c) => {
  const ix = configInvoiceXpress(c.env);
  const f = await c.env.DB.prepare("SELECT * FROM faturas WHERE id = ?").bind(Number(c.req.param("id"))).first<Fatura>();
  if (ix && f) await emitirFatura(c.env.DB, f, ix);
  return c.redirect("/gestao/faturas");
});

app.post("/gestao/faturas/:id/manual", async (c) => {
  const { numero } = await c.req.parseBody<{ numero: string }>();
  if (!numero?.trim()) return c.text("Indique o número da fatura.", 400);
  await c.env.DB.prepare("UPDATE faturas SET estado = 'emitida', numero = ?, erro = NULL, emitida_em = ? WHERE id = ? AND estado != 'emitida'")
    .bind(numero.trim(), new Date().toISOString(), Number(c.req.param("id")))
    .run();
  return c.redirect("/gestao/faturas");
});

export default app;
