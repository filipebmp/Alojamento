import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import {
  CAMINHO_API_EMAILS_RESERVAS,
  type EmailReservaEntregue,
  CAMINHO_API_EMAIL_AVISOS,
  CAMINHO_API_EMAIL_RECUPERACAO,
  CAMINHO_API_LICENCA,
  type RespostaLicenca,
  pedidoAvisosValido,
  pedidoEmailValido,
  pedidoValido,
} from "../../comum/licenca";
import { iguais } from "../../comum/senha";
import { ErroCloudflare } from "../../comum/cloudflare";
import PostalMime from "postal-mime";
import { htmlParaTexto, lerEmailReserva } from "./emails-reservas";
import { CAMINHO_API_VERSOES, CHAVE_PUBLICA_VERSOES, type Versao, type VersaoAssinada, assinaturaConfere, compararVersoes } from "../../comum/versoes";
import {
  type ResultadoInstalacao,
  atualizarAlojada,
  instalar,
  mudarParaDominio,
  nomeAlojado,
  precisaAtualizar,
  slugValido,
} from "./instalador";
import { Cloudflare } from "../../comum/cloudflare";
import {
  type ConfigEmail,
  emailAvisos,
  emailConfirmarRegisto,
  linkPainel,
  emailEnderecos,
  emailInstalacaoPronta,
  emailLicencaCortesia,
  emailRecuperacao,
  enviarEmail,
  hashEmail,
} from "./email";
import { type ConfigInvoiceXpress, type Fatura, emitirFatura, registarFatura } from "./faturas";
import {
  type Cliente,
  type Licenca,
  atualizarSubscricao,
  criarCortesia,
  criarTeste,
  estadoLicenca,
  garantirLicencaCheckout,
  guardarCliente,
  obterLicencaPorCheckout,
  obterLicencaPorChave,
  registarComunicacao,
} from "./licencas";
import { type CheckoutSession, ErroStripe, type Evento, type Invoice, type Price, type Subscription, assinaturaValida, stripe } from "./stripe";
import {
  paginaAssinar,
  paginaCriar,
  paginaEntrar as paginaEntrarCliente,
  paginaInstalado,
  paginaInstalar,
  paginaInstalarCloudflare,
  paginaRegistar,
  paginaTermos,
} from "./views-instalar";
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
  RESEND_API_KEY?: string;
  EMAIL_REMETENTE?: string; // ex.: "bookgest <nao-responder@bookgest.pt>"
  RESEND_URL?: string; // só para testes locais
  CF_API_URL?: string; // só para testes locais (API do Cloudflare simulada)
  // Modo alojado: conta Cloudflare do fornecedor onde ficam as instalações dos clientes.
  CF_API_TOKEN?: string;
  CF_CONTA?: string;
  CF_SUBDOMINIO?: string; // subdomínio workers.dev da conta (endereços sem domínio próprio)
  DOMINIO_ALOJADAS?: string; // ex.: "bookgest.pt" → instalações alojadas em <nome>.bookgest.pt
  ZONA_ID?: string; // id da zona do domínio no Cloudflare (se vazio, é procurado pela API)
  REGISTOS_ABERTOS?: string; // "sim" para aceitar registos com período experimental
  // Domínio dos endereços reservas-<código>@… (exige Email Routing com "catch-all" para esta app). Vazio = desligado.
  DOMINIO_EMAIL_RESERVAS?: string;
  // Outros endereços do domínio (ex.: contacto@) são reencaminhados para aqui (endereço verificado no Email Routing).
  ENCAMINHAR_EMAILS?: string;
  // Endereço da instalação que servia o bookgest.pt antes da plataforma: os links já enviados a hóspedes continuam a funcionar.
  INSTALACAO_ANTIGA?: string;
};

type Ctx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// ---------- Transição: bookgest.pt servia a instalação do fornecedor ----------

for (const caminho of ["/c/*", "/admin", "/admin/*", "/login", "/logout", "/configurar", "/recuperar", "/recuperar/*", "/estilo.css", "/manifest.webmanifest", "/sw.js"]) {
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
  c.html(paginaInicio({ precoCents: await precoMensal(c.env), vendasAbertas: vendasAbertas(c.env), registosAbertos: registosAbertos(c.env), contacto: c.env.CONTACTO ?? null,
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
  return c.html(paginaObrigado(licenca?.chave ?? null, c.env.CONTACTO ?? null, c.env.STRIPE_PORTAL || null, licenca?.url_instalacao ?? null));
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
  return c.json<RespostaLicenca>({
    estado: estadoLicenca(licenca),
    alojamentosPagos: licenca.alojamentos_pagos,
    versaoAtual: await versaoMaisRecente(c.env.DB),
    fimTeste: licenca.tipo === "teste" ? licenca.valida_ate : null,
    emailReservas: await enderecoEmailReservas(c.env, licenca),
  });
});

// ---------- Versões da app (publicadas pelo GitHub Actions, assinadas) ----------

async function versaoMaisRecente(db: D1Database): Promise<string | null> {
  const vs = (await db.prepare("SELECT versao FROM versoes").all<{ versao: string }>()).results.map((r) => r.versao);
  return vs.sort(compararVersoes).at(-1) ?? null;
}

async function obterVersao(db: D1Database, versao: string): Promise<VersaoAssinada | null> {
  return db.prepare("SELECT payload, assinatura FROM versoes WHERE versao = ?").bind(versao).first<VersaoAssinada>();
}

// Não precisa de outra autenticação: só aceita versões assinadas com a chave privada do GitHub.
app.post(CAMINHO_API_VERSOES, async (c) => {
  if (!CHAVE_PUBLICA_VERSOES) return c.json({ erro: "Chave pública das versões por definir" }, 503);
  const v = await c.req.json<VersaoAssinada>().catch(() => null);
  if (typeof v?.payload !== "string" || typeof v.assinatura !== "string" || !(await assinaturaConfere(v.payload, v.assinatura, CHAVE_PUBLICA_VERSOES))) {
    return c.json({ erro: "Assinatura inválida" }, 403);
  }
  const versao = (JSON.parse(v.payload) as Versao).versao;
  if (!/^\d+\.\d+\.\d+$/.test(versao)) return c.json({ erro: "Versão inválida" }, 400);
  const existente = await obterVersao(c.env.DB, versao);
  if (existente) {
    return existente.payload === v.payload
      ? c.json({ estado: "ja_publicada", versao })
      : c.json({ erro: `A versão ${versao} já foi publicada com outro conteúdo: aumente VERSAO em app/src/versao.ts` }, 409);
  }
  await c.env.DB.prepare("INSERT INTO versoes (versao, payload, assinatura, publicada_em) VALUES (?, ?, ?, ?)")
    .bind(versao, v.payload, v.assinatura, new Date().toISOString())
    .run();
  return c.json({ estado: "publicada", versao }, 201);
});

app.get(`${CAMINHO_API_VERSOES}/:versao{\\d+\\.\\d+\\.\\d+}`, async (c) => {
  const v = await obterVersao(c.env.DB, c.req.param("versao"));
  return v ? c.json(v) : c.json({ erro: "Versão desconhecida" }, 404);
});

// ---------- Instalador (na conta Cloudflare do gestor) ----------

async function licencaParaInstalar(db: D1Database, chave: string | undefined): Promise<Licenca | string> {
  const l = chave ? await obterLicencaPorChave(db, chave.trim().toUpperCase()) : null;
  if (!l) return "Chave de licença desconhecida. Confirme-a no email que recebeu.";
  if (estadoLicenca(l) !== "ativa") return "Esta licença não está ativa.";
  return l;
}

app.get("/instalar", (c) => c.html(paginaInstalar(c.req.query("chave") ?? "")));

app.post("/instalar", async (c) => {
  const { chave } = await c.req.parseBody<{ chave: string }>();
  const l = await licencaParaInstalar(c.env.DB, chave);
  if (typeof l === "string") return c.html(paginaInstalar(chave ?? "", l), 400);
  return c.html(paginaInstalarCloudflare(l.chave));
});

app.post("/instalar/concluir", async (c) => {
  const { chave, token } = await c.req.parseBody<{ chave: string; token: string }>();
  const l = await licencaParaInstalar(c.env.DB, chave);
  if (typeof l === "string") return c.html(paginaInstalar(chave ?? "", l), 400);
  const t = String(token ?? "").trim();
  if (!/^[A-Za-z0-9_-]{30,}$/.test(t)) return c.html(paginaInstalarCloudflare(l.chave, "A chave de API não parece correta: copie-a de novo do Cloudflare."), 400);
  const atual = await versaoMaisRecente(c.env.DB);
  const assinada = atual ? await obterVersao(c.env.DB, atual) : null;
  if (!assinada) return c.html(paginaInstalarCloudflare(l.chave, "Ainda não há nenhuma versão publicada para instalar. Contacte-nos."), 503);
  try {
    const r = await instalar(t, {
      versao: JSON.parse(assinada.payload) as Versao,
      chaveLicenca: l.chave,
      urlLicencas: urlBase(c),
      apiCloudflare: c.env.CF_API_URL || undefined,
    });
    await c.env.DB.prepare("UPDATE licencas SET modo = 'privado', url_instalacao = ?, instalada_em = ? WHERE id = ?")
      .bind(r.url, new Date().toISOString(), l.id)
      .run();
    return c.html(paginaInstalado(r));
  } catch (e) {
    // Nunca registar a chave de API do gestor: só a mensagem do Cloudflare.
    const msg = e instanceof ErroCloudflare ? e.message : "erro inesperado";
    console.error("Instalação falhou:", msg);
    return c.html(paginaInstalarCloudflare(l.chave, `O Cloudflare recusou um passo da instalação: ${msg}`), 502);
  }
});

// ---------- Modo "Simples": instalações alojadas na conta do fornecedor ----------

const alojamentoDisponivel = (env: Env) => !!env.CF_API_TOKEN && !!env.CF_CONTA;
const sufixoEndereco = (env: Env) =>
  env.DOMINIO_ALOJADAS ? `<nome>.${env.DOMINIO_ALOJADAS}` : `bk-<nome>.${env.CF_SUBDOMINIO || "…"}.workers.dev`;

let zonaEmCache: string | null = null;

async function zonaDominio(env: Env): Promise<string> {
  if (env.ZONA_ID) return env.ZONA_ID;
  if (zonaEmCache) return zonaEmCache;
  const zonas = await new Cloudflare(env.CF_API_TOKEN!, env.CF_API_URL || undefined)
    .pedido<{ id: string; name: string }[]>("GET", `/zones?name=${env.DOMINIO_ALOJADAS}`);
  const z = zonas.find((x) => x.name === env.DOMINIO_ALOJADAS);
  if (!z) throw new ErroCloudflare(`zona ${env.DOMINIO_ALOJADAS} não encontrada (defina ZONA_ID)`);
  return (zonaEmCache = z.id);
}

async function dominioAlojada(env: Env, slug: string) {
  return env.DOMINIO_ALOJADAS ? { hostname: `${slug}.${env.DOMINIO_ALOJADAS}`, zona: await zonaDominio(env) } : undefined;
}

async function versaoParaInstalar(db: D1Database): Promise<Versao | null> {
  const atual = await versaoMaisRecente(db);
  const assinada = atual ? await obterVersao(db, atual) : null;
  return assinada ? (JSON.parse(assinada.payload) as Versao) : null;
}

// Reserva o nome do endereço para a licença (o índice único impede dois clientes com o mesmo) e cria a instalação.
async function criarAlojada(c: Ctx, l: Licenca, slug: string): Promise<ResultadoInstalacao | string> {
  if (!alojamentoDisponivel(c.env)) return "A criação de instalações não está disponível de momento. Contacte-nos.";
  const versao = await versaoParaInstalar(c.env.DB);
  if (!versao) return "Ainda não há nenhuma versão publicada para instalar. Contacte-nos.";
  try {
    const r = await c.env.DB.prepare("UPDATE licencas SET slug = ? WHERE id = ? AND (slug IS NULL OR slug = ?)").bind(slug, l.id, slug).run();
    if (!r.meta.changes) return "Esta licença já tem outro endereço.";
  } catch {
    return "Esse nome de endereço já está a ser usado. Escolha outro.";
  }
  try {
    const r = await instalar(c.env.CF_API_TOKEN!, {
      versao,
      chaveLicenca: l.chave,
      urlLicencas: urlBase(c),
      apiCloudflare: c.env.CF_API_URL || undefined,
      alojado: { conta: c.env.CF_CONTA!, nome: nomeAlojado(slug), dominio: await dominioAlojada(c.env, slug) },
    });
    await c.env.DB.prepare(
      "UPDATE licencas SET modo = 'alojado', url_instalacao = ?, instalada_em = ?, cf_base = ?, versao_publicada = ?, erro_atualizacao = NULL WHERE id = ?",
    )
      .bind(r.url, new Date().toISOString(), r.base, versao.versao, l.id)
      .run();
    await enviarInstalacaoPronta(c.env, l, r);
    return r;
  } catch (e) {
    const msg = e instanceof ErroCloudflare ? e.message : String(e);
    console.error("Criação da instalação alojada falhou:", msg);
    return `Não foi possível criar a instalação (${msg}). Tente de novo ou contacte-nos.`;
  }
}

// Envia o endereço e o link de criação da conta (para o cliente não os perder se fechar a página).
async function enviarInstalacaoPronta(env: Env, l: Licenca, r: ResultadoInstalacao): Promise<void> {
  const cfg = configEmail(env);
  const email = l.cliente_id ? await env.DB.prepare("SELECT email FROM clientes WHERE id = ?").bind(l.cliente_id).first<string>("email") : null;
  if (!cfg || !email) return;
  const linkConta = r.tokenConfiguracao ? `${r.url}/configurar?t=${r.tokenConfiguracao}` : null;
  await enviarEmail(cfg, { para: email, responderPara: env.CONTACTO || null, ...emailInstalacaoPronta({ url: r.url, linkConta }) })
    .catch((e) => console.error("Email de instalação pronta falhou", e));
}

app.get("/termos", (c) => c.html(paginaTermos(c.env.CONTACTO || null)));

// Entrar: cada cliente tem o seu endereço. Envia-o por email (a página não revela se o email é cliente).
// O browser lembra-se do último endereço usado (cookie só deste site), para a próxima entrada ser um clique.
const COOKIE_ENDERECO = "endereco";

function lembrarEndereco(c: Ctx, slug: string) {
  setCookie(c, COOKIE_ENDERECO, slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "Lax", secure: new URL(c.req.url).protocol === "https:" });
}

const opcoesEntrar = (c: Ctx) => ({ endereco: getCookie(c, COOKIE_ENDERECO), dominio: c.env.DOMINIO_ALOJADAS || undefined });

app.get("/entrar", (c) => c.html(paginaEntrarCliente(opcoesEntrar(c))));

// Aceita "casa", "casa.bookgest.pt" ou o endereço completo, e leva ao ecrã de login dessa instalação.
app.post("/entrar/ir", async (c) => {
  const { endereco } = await c.req.parseBody<{ endereco: string }>();
  const nome = String(endereco ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]
    .replace(c.env.DOMINIO_ALOJADAS ? `.${c.env.DOMINIO_ALOJADAS}` : /$^/, "").replace(/^bk-/, "").replace(/\..*$/, "");
  const l = nome ? await c.env.DB.prepare("SELECT url_instalacao FROM licencas WHERE slug = ? AND url_instalacao IS NOT NULL").bind(nome).first<string>("url_instalacao") : null;
  if (!l) return c.html(paginaEntrarCliente({ ...opcoesEntrar(c), endereco: String(endereco ?? ""), erroEndereco: "Não encontrámos esse endereço. Confirme-o ou peça-o por email abaixo." }), 404);
  lembrarEndereco(c, nome);
  return c.redirect(`${l}/login`);
});

app.post("/entrar", async (c) => {
  const { email } = await c.req.parseBody<{ email: string }>();
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return c.html(paginaEntrarCliente({ ...opcoesEntrar(c), erro: "Indique um email válido." }), 400);
  const cfg = configEmail(c.env);
  const licencas = (await c.env.DB.prepare(
    `SELECT l.id, l.url_instalacao FROM licencas l JOIN clientes c ON c.id = l.cliente_id
     WHERE lower(c.email) = ? AND l.url_instalacao IS NOT NULL ORDER BY l.id`,
  ).bind(e).all<{ id: number; url_instalacao: string }>()).results;
  if (cfg && licencas.length) {
    const para = await hashEmail(e);
    const recentes = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM envios_email WHERE para_hash = ? AND enviado_em > ?")
      .bind(para, new Date(Date.now() - 3_600_000).toISOString())
      .first<number>("n");
    if ((recentes ?? 0) < LIMITE_POR_DESTINATARIO_HORA) {
      try {
        await enviarEmail(cfg, { para: e, responderPara: c.env.CONTACTO || null, ...emailEnderecos([...new Set(licencas.map((l) => l.url_instalacao))]) });
        await c.env.DB.prepare("INSERT INTO envios_email (licenca_id, para_hash, enviado_em) VALUES (?, ?, ?)")
          .bind(licencas[0].id, para, new Date().toISOString())
          .run();
      } catch (err) {
        console.error("Email com os endereços falhou", err);
      }
    }
  }
  return c.html(paginaEntrarCliente({ enviado: true }));
});

const registosAbertos = (env: Env) => env.REGISTOS_ABERTOS === "sim" && alojamentoDisponivel(env) && !!configEmail(env);

app.get("/registar", (c) => {
  if (!registosAbertos(c.env)) return c.html(paginaMensagem("Em breve", "Os registos ainda não estão abertos."), 403);
  return c.html(paginaRegistar({ sufixo: sufixoEndereco(c.env) }));
});

app.post("/registar", async (c) => {
  if (!registosAbertos(c.env)) return c.html(paginaMensagem("Em breve", "Os registos ainda não estão abertos."), 403);
  const b = await c.req.parseBody<Record<string, string>>();
  const valores = { nome: b.nome?.trim() || undefined, email: b.email?.trim().toLowerCase(), slug: b.slug?.trim().toLowerCase(), sufixo: sufixoEndereco(c.env) };
  const slug = slugValido(b.slug);
  if (!valores.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email)) return c.html(paginaRegistar({ ...valores, erro: "Indique um email válido." }), 400);
  if (!slug) return c.html(paginaRegistar({ ...valores, erro: "Nome do endereço inválido ou reservado: 3 a 30 letras minúsculas, números ou hífens." }), 400);
  if (!b.termos) return c.html(paginaRegistar({ ...valores, erro: "Tem de aceitar os termos." }), 400);
  if (await c.env.DB.prepare("SELECT 1 FROM licencas WHERE slug = ?").bind(slug).first()) {
    return c.html(paginaRegistar({ ...valores, erro: "Esse nome de endereço já está a ser usado. Escolha outro." }), 400);
  }
  const ontem = new Date(Date.now() - 86_400_000).toISOString();
  const recentes = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM registos WHERE email = ? AND criado_em > ?").bind(valores.email, ontem).first<number>("n");
  if ((recentes ?? 0) >= 3) return c.html(paginaRegistar({ ...valores, erro: "Já pediu vários registos hoje. Veja o seu email (e o spam)." }), 429);

  const token = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const agora = new Date().toISOString();
  await c.env.DB.prepare("INSERT INTO registos (token_hash, nome, email, slug, aceitou_termos_em, criado_em) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await hashEmail(token), valores.nome ?? null, valores.email, slug, agora, agora)
    .run();
  try {
    await enviarEmail(configEmail(c.env)!, { para: valores.email, ...emailConfirmarRegisto(`${urlBase(c)}/registar/confirmar/${token}`) });
  } catch (e) {
    console.error("Email de confirmação falhou", e);
    return c.html(paginaRegistar({ ...valores, erro: "Não foi possível enviar o email de confirmação. Tente de novo." }), 502);
  }
  return c.html(paginaRegistar({ ...valores, enviado: true }));
});

// Confirmação do email: cria o cliente, a licença experimental e a instalação.
app.get("/registar/confirmar/:token{[0-9a-f]{48}}", async (c) => {
  c.header("Referrer-Policy", "no-referrer");
  const db = c.env.DB;
  const r = await db.prepare("SELECT * FROM registos WHERE token_hash = ?").bind(await hashEmail(c.req.param("token")))
    .first<{ id: number; nome: string | null; email: string; slug: string; criado_em: string; confirmado_em: string | null; licenca_id: number | null }>();
  if (!r || (!r.confirmado_em && r.criado_em < new Date(Date.now() - 2 * 86_400_000).toISOString())) {
    return c.html(paginaMensagem("Link inválido", "O link expirou ou não existe. Registe-se de novo."), 400);
  }
  // Abrir o link outra vez não cria outra instalação.
  if (r.licenca_id) {
    const l = await db.prepare("SELECT * FROM licencas WHERE id = ?").bind(r.licenca_id).first<Licenca>();
    if (l?.url_instalacao) return c.html(paginaMensagem("Já está criado", `O seu bookgest está em ${l.url_instalacao}`));
  }
  let licencaId = r.licenca_id;
  if (!licencaId) {
    const agora = new Date().toISOString();
    const cliente = (await db.prepare("INSERT INTO clientes (email, nome, criado_em) VALUES (?, ?, ?)").bind(r.email, r.nome, agora).run()).meta.last_row_id;
    licencaId = await criarTeste(db, cliente);
    await db.prepare("UPDATE registos SET confirmado_em = ?, licenca_id = ? WHERE id = ?").bind(agora, licencaId, r.id).run();
  }
  const l = (await db.prepare("SELECT * FROM licencas WHERE id = ?").bind(licencaId).first<Licenca>())!;
  const res = await criarAlojada(c, l, r.slug);
  if (typeof res === "string") return c.html(paginaCriar(l.chave, { erro: res, slug: r.slug, sufixo: sufixoEndereco(c.env) }), 502);
  lembrarEndereco(c, r.slug);
  return c.html(paginaInstalado(res));
});

// Licença sem instalação (comprada no site ou de cortesia): criar a instalação alojada.
async function licencaParaCriar(db: D1Database, chave: string | undefined): Promise<Licenca | string> {
  const l = await licencaParaInstalar(db, chave);
  if (typeof l === "string") return l;
  if (l.url_instalacao) return `Esta licença já tem uma instalação: ${l.url_instalacao}`;
  return l;
}

app.get("/criar", async (c) => {
  const l = await licencaParaCriar(c.env.DB, c.req.query("chave"));
  if (typeof l === "string") return c.html(paginaMensagem("Não é possível criar", l), 400);
  return c.html(paginaCriar(l.chave, { sufixo: sufixoEndereco(c.env) }));
});

app.post("/criar", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const l = await licencaParaCriar(c.env.DB, b.chave);
  if (typeof l === "string") return c.html(paginaMensagem("Não é possível criar", l), 400);
  const slug = slugValido(b.slug);
  if (!slug) return c.html(paginaCriar(l.chave, { erro: "Nome do endereço inválido ou reservado: 3 a 30 letras minúsculas, números ou hífens.", slug: b.slug, sufixo: sufixoEndereco(c.env) }), 400);
  const res = await criarAlojada(c, l, slug);
  if (typeof res === "string") return c.html(paginaCriar(l.chave, { erro: res, slug, sufixo: sufixoEndereco(c.env) }), 400);
  lembrarEndereco(c, slug);
  return c.html(paginaInstalado(res));
});

// Subscrição de uma licença existente (fim do período experimental): o checkout fica ligado a ela.
app.get("/assinar", async (c) => {
  const l = await obterLicencaPorChave(c.env.DB, String(c.req.query("chave") ?? "").trim().toUpperCase());
  if (!l) return c.html(paginaMensagem("Licença desconhecida", "Confirme o link."), 404);
  const ativa = l.tipo === "stripe" && estadoLicenca(l) === "ativa";
  // Assinatura ativa ou cortesia: só se muda o n.º de alojamentos (no portal do Stripe, ou pedindo ao bookgest).
  if (!ativa && l.tipo !== "cortesia" && !vendasAbertas(c.env)) {
    return c.html(paginaMensagem("Em breve", "As subscrições ainda não estão abertas. Contacte-nos."), 403);
  }
  return c.html(paginaAssinar(l.chave, {
    precoCents: await precoMensal(c.env),
    alojamentos: Math.max(1, l.alojamentos_ativos ?? 1),
    ativa,
    cortesia: l.tipo === "cortesia" && !l.revogada,
    alojamentosPagos: l.alojamentos_pagos,
    portal: c.env.STRIPE_PORTAL || null,
    contacto: c.env.CONTACTO || null,
  }));
});

app.post("/assinar", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const l = await obterLicencaPorChave(c.env.DB, String(b.chave ?? "").trim().toUpperCase());
  if (!l || !vendasAbertas(c.env)) return c.html(paginaMensagem("Não é possível subscrever", "Contacte-nos."), 400);
  const n = Number(b.alojamentos);
  if (!Number.isInteger(n) || n < 1 || n > 50) return c.html(paginaAssinar(l.chave, { precoCents: await precoMensal(c.env), alojamentos: 1, erro: "Indique entre 1 e 50 alojamentos." }), 400);
  const email = l.cliente_id ? await c.env.DB.prepare("SELECT email FROM clientes WHERE id = ?").bind(l.cliente_id).first<string>("email") : null;
  const base = urlBase(c);
  const sessao = await stripe<{ url: string }>(c.env.STRIPE_SECRET_KEY!, "POST", "/checkout/sessions", {
    mode: "subscription",
    client_reference_id: String(l.id),
    customer_email: email ?? undefined,
    line_items: [{ price: c.env.STRIPE_PRECO, quantity: n, adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 } }],
    success_url: `${base}/obrigado?sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/assinar?chave=${encodeURIComponent(l.chave)}`,
    locale: "pt",
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    allow_promotion_codes: true,
  });
  return c.redirect(sessao.url, 303);
});

// Atualiza as instalações alojadas para a versão mais recente (algumas por execução, por causa do limite de
// pedidos por execução do Cloudflare). Corre de hora a hora.
const ALOJADAS_POR_EXECUCAO = 5;

async function atualizarAlojadas(env: Env): Promise<void> {
  if (!alojamentoDisponivel(env)) return;
  const v = await versaoParaInstalar(env.DB);
  if (!v) return;
  const alojadas = (await env.DB.prepare("SELECT * FROM licencas WHERE modo = 'alojado' AND slug IS NOT NULL AND cf_base IS NOT NULL ORDER BY erro_atualizacao IS NOT NULL, id").all<Licenca>()).results;
  // Instalações criadas antes do domínio próprio passam para <nome>.<domínio> (também nesta tarefa horária).
  const semDominio = (l: Licenca) => !!env.DOMINIO_ALOJADAS && !l.url_instalacao?.endsWith(`.${env.DOMINIO_ALOJADAS}`);
  for (const l of alojadas.filter((x) => precisaAtualizar(x.versao_publicada, v.versao) || semDominio(x)).slice(0, ALOJADAS_POR_EXECUCAO)) {
    try {
      if (precisaAtualizar(l.versao_publicada, v.versao)) {
        await atualizarAlojada(env.CF_API_TOKEN!, env.CF_CONTA!, nomeAlojado(l.slug!), l.cf_base!, v, env.CF_API_URL || undefined);
      }
      if (semDominio(l)) {
        const d = (await dominioAlojada(env, l.slug!))!;
        await mudarParaDominio(env.CF_API_TOKEN!, env.CF_CONTA!, nomeAlojado(l.slug!), v,
          { ...d, urlLicencas: env.URL_PUBLICO || `https://${env.DOMINIO_ALOJADAS}` }, env.CF_API_URL || undefined);
        await env.DB.prepare("UPDATE licencas SET url_instalacao = ? WHERE id = ?").bind(`https://${d.hostname}`, l.id).run();
      }
      await env.DB.prepare("UPDATE licencas SET versao_publicada = ?, erro_atualizacao = NULL WHERE id = ?").bind(v.versao, l.id).run();
    } catch (e) {
      console.error(`Atualização de ${l.slug} falhou`, e);
      await env.DB.prepare("UPDATE licencas SET erro_atualizacao = ? WHERE id = ?").bind(String(e).slice(0, 300), l.id).run();
    }
  }
}

// ---------- Email de recuperação (pedido por uma instalação) ----------

const LIMITE_POR_LICENCA_HORA = 20;
const LIMITE_POR_DESTINATARIO_HORA = 3;

function configEmail(env: Env): ConfigEmail | null {
  if (!env.RESEND_API_KEY) return null;
  return { apiKey: env.RESEND_API_KEY, remetente: env.EMAIL_REMETENTE || "bookgest <nao-responder@bookgest.pt>", url: env.RESEND_URL || undefined };
}

app.post(CAMINHO_API_EMAIL_RECUPERACAO, async (c) => {
  const pedido = await c.req.json().catch(() => null);
  if (!pedidoEmailValido(pedido)) return c.json({ erro: "Pedido inválido" }, 400);
  const cfg = configEmail(c.env);
  if (!cfg) return c.json({ erro: "Envio de email não configurado" }, 503);
  // Qualquer licença conhecida serve, mesmo inativa: recuperar o acesso aos dados nunca é bloqueado.
  const licenca = await obterLicencaPorChave(c.env.DB, pedido.chave);
  if (!licenca) return c.json({ erro: "Licença desconhecida" }, 403);

  const db = c.env.DB;
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const para = await hashEmail(pedido.para);
  const [porLicenca, porDestinatario] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM envios_email WHERE licenca_id = ? AND enviado_em > ? AND tipo = 'recuperacao'").bind(licenca.id, desde).first<number>("n"),
    db.prepare("SELECT COUNT(*) AS n FROM envios_email WHERE para_hash = ? AND enviado_em > ? AND tipo = 'recuperacao'").bind(para, desde).first<number>("n"),
  ]);
  if ((porLicenca ?? 0) >= LIMITE_POR_LICENCA_HORA || (porDestinatario ?? 0) >= LIMITE_POR_DESTINATARIO_HORA) {
    return c.json({ erro: "Demasiados pedidos: tente daqui a uma hora" }, 429);
  }
  try {
    await enviarEmail(cfg, { para: pedido.para, ...emailRecuperacao(pedido.link) });
  } catch (e) {
    console.error("Envio do email de recuperação falhou", e);
    return c.json({ erro: "O envio do email falhou" }, 502);
  }
  await db.prepare("INSERT INTO envios_email (licenca_id, para_hash, enviado_em) VALUES (?, ?, ?)")
    .bind(licenca.id, para, new Date().toISOString())
    .run();
  return c.json({ ok: true }, 202);
});

// Aviso diário ao gestor. O texto é sempre o da plataforma (só recebe tipos e quantidades) e o botão leva à
// instalação da licença (ou a um endereço bookgest.pt): não serve para enviar outros conteúdos.
const LIMITE_AVISOS_POR_LICENCA_DIA = 10;
const LIMITE_AVISOS_POR_DESTINATARIO_DIA = 2;

app.post(CAMINHO_API_EMAIL_AVISOS, async (c) => {
  const pedido = await c.req.json().catch(() => null);
  if (!pedidoAvisosValido(pedido)) return c.json({ erro: "Pedido inválido" }, 400);
  const cfg = configEmail(c.env);
  if (!cfg) return c.json({ erro: "Envio de email não configurado" }, 503);
  const licenca = await obterLicencaPorChave(c.env.DB, pedido.chave);
  if (!licenca || licenca.revogada) return c.json({ erro: "Licença desconhecida" }, 403);

  const db = c.env.DB;
  const desde = new Date(Date.now() - 20 * 3_600_000).toISOString();
  const para = await hashEmail(pedido.para);
  const [porLicenca, porDestinatario] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM envios_email WHERE licenca_id = ? AND enviado_em > ? AND tipo = 'avisos'").bind(licenca.id, desde).first<number>("n"),
    db.prepare("SELECT COUNT(*) AS n FROM envios_email WHERE para_hash = ? AND enviado_em > ? AND tipo = 'avisos'").bind(para, desde).first<number>("n"),
  ]);
  if ((porLicenca ?? 0) >= LIMITE_AVISOS_POR_LICENCA_DIA || (porDestinatario ?? 0) >= LIMITE_AVISOS_POR_DESTINATARIO_DIA) {
    return c.json({ erro: "Aviso já enviado hoje" }, 429);
  }
  const painel = linkPainel(pedido.painel, licenca.url_instalacao, c.env.URL_PUBLICO);
  try {
    await enviarEmail(cfg, { para: pedido.para, ...emailAvisos(pedido.itens, painel) });
  } catch (e) {
    console.error("Envio do aviso diário falhou", e);
    return c.json({ erro: "O envio do email falhou" }, 502);
  }
  await db.prepare("INSERT INTO envios_email (licenca_id, para_hash, enviado_em, tipo) VALUES (?, ?, ?, 'avisos')")
    .bind(licenca.id, para, new Date().toISOString())
    .run();
  return c.json({ ok: true }, 202);
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

async function mostrarLicencas(c: Ctx, novaChave?: string, mensagem?: { ok: boolean; texto: string }) {
  const [licencas, clientes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM licencas ORDER BY id DESC").all<Licenca>(),
    c.env.DB.prepare("SELECT * FROM clientes").all<Cliente>(),
  ]);
  const porId = new Map(clientes.results.map((x) => [x.id, x]));
  const preco = await precoMensal(c.env);
  const env = c.env;
  const estado = [
    {
      nome: "Chave secreta do Stripe",
      ok: /^(sk|rk)_/.test(env.STRIPE_SECRET_KEY ?? ""),
      detalhe: !env.STRIPE_SECRET_KEY
        ? "segredo STRIPE_SECRET_KEY em falta"
        : env.STRIPE_SECRET_KEY.startsWith("pk_")
          ? "é a chave publicável (pk_…): use a chave secreta (sk_…)"
          : env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "modo de teste" : env.STRIPE_SECRET_KEY.slice(0, 8) + "…",
    },
    { nome: "Preço", ok: preco != null, detalhe: preco != null ? `${(preco / 100).toFixed(2).replace(".", ",")} € por alojamento` : erroPreco ?? (env.STRIPE_PRECO ? "sem resposta" : "STRIPE_PRECO em falta") },
    { nome: "Segredo do webhook", ok: !!env.STRIPE_WEBHOOK_SECRET, detalhe: env.STRIPE_WEBHOOK_SECRET ? "definido" : "segredo STRIPE_WEBHOOK_SECRET em falta" },
    { nome: "Vendas abertas", ok: vendasAbertas(env), detalhe: env.VENDAS_ABERTAS === "sim" ? "sim" : "não" },
    { nome: "Email (Resend)", ok: !!configEmail(env), detalhe: configEmail(env)?.remetente ?? "segredo RESEND_API_KEY em falta" },
    { nome: "InvoiceXpress", ok: !!configInvoiceXpress(env), detalhe: configInvoiceXpress(env) ? env.INVOICEXPRESS_CONTA! : "não configurado (faturas à mão)" },
  ];
  return c.html(paginaLicencas(licencas.results.map((l) => ({ licenca: l, cliente: l.cliente_id ? porId.get(l.cliente_id) ?? null : null })), estado, novaChave, mensagem));
}

app.get("/gestao", async (c) => {
  const nova = Number(c.req.query("nova"));
  const chave = nova ? await c.env.DB.prepare("SELECT chave FROM licencas WHERE id = ?").bind(nova).first<string>("chave") : null;
  const email = c.req.query("email");
  const mensagem = email === "enviado"
    ? { ok: true, texto: `Chave enviada por email para ${c.req.query("para") ?? ""}.` }
    : email ? { ok: false, texto: `O email não foi enviado: ${email}` }
    : c.req.query("ok") ? { ok: true, texto: c.req.query("ok")!.slice(0, 200) }
    : c.req.query("erro") ? { ok: false, texto: c.req.query("erro")!.slice(0, 300) }
    : undefined;
  return mostrarLicencas(c, chave ?? undefined, mensagem);
});

// Envia a chave de uma cortesia ao cliente. Devolve o parâmetro a pôr no endereço da página.
async function enviarChaveCortesia(env: Env, licencaId: number, base: string): Promise<string> {
  const cfg = configEmail(env);
  if (!cfg) return "email=" + encodeURIComponent("Resend não configurado");
  const l = await env.DB.prepare(
    "SELECT l.chave, l.alojamentos_pagos, c.email, c.nome FROM licencas l JOIN clientes c ON c.id = l.cliente_id WHERE l.id = ? AND l.tipo = 'cortesia'",
  )
    .bind(licencaId)
    .first<{ chave: string; alojamentos_pagos: number; email: string | null; nome: string | null }>();
  if (!l?.email) return "email=" + encodeURIComponent("licença sem email");
  try {
    await enviarEmail(cfg, {
      para: l.email,
      responderPara: env.CONTACTO || null,
      ...emailLicencaCortesia({
        chave: l.chave,
        nome: l.nome,
        alojamentos: l.alojamentos_pagos,
        linkCriar: `${base}/criar?chave=${encodeURIComponent(l.chave)}`,
        linkInstalar: `${base}/instalar?chave=${encodeURIComponent(l.chave)}`,
      }),
    });
    return `email=enviado&para=${encodeURIComponent(l.email)}`;
  } catch (e) {
    console.error("Envio da licença falhou", e);
    return "email=" + encodeURIComponent(e instanceof Error ? e.message : String(e));
  }
}

app.post("/gestao/licencas", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const n = Number(b.alojamentos);
  if (!Number.isInteger(n) || n < 1 || n > 1000) return c.text("Número de alojamentos inválido.", 400);
  const email = b.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text("Email inválido.", 400);
  const nome = b.nome?.trim() || null;
  const id = await criarCortesia(c.env.DB, n, b.notas?.trim() || null, email ? { email, nome } : null);
  const envio = email && b.enviar ? `&${await enviarChaveCortesia(c.env, id, urlBase(c))}` : "";
  // Redireciona: atualizar a página não volta a submeter o formulário (nem cria outra licença).
  return c.redirect(`/gestao?nova=${id}${envio}`);
});

app.post("/gestao/licencas/:id/enviar", async (c) => {
  return c.redirect(`/gestao?${await enviarChaveCortesia(c.env, Number(c.req.param("id")), urlBase(c))}`);
});

// Só cortesias que nunca foram usadas por uma instalação (ex.: criadas por engano).
// Só licenças que nenhuma instalação usou (criadas por engano ou em testes). Uma assinatura do Stripe é cancelada
// primeiro; as faturas ficam (são registos fiscais), só deixam de apontar para a licença.
app.post("/gestao/licencas/:id/apagar", async (c) => {
  const id = Number(c.req.param("id"));
  const l = await c.env.DB.prepare("SELECT * FROM licencas WHERE id = ? AND ultima_comunicacao IS NULL AND url_instalacao IS NULL").bind(id).first<Licenca>();
  if (!l) return c.redirect("/gestao");
  if (l.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(l.stripe_estado ?? "")) {
    try {
      await stripe(c.env.STRIPE_SECRET_KEY!, "DELETE", `/subscriptions/${l.stripe_subscription_id}`);
    } catch (e) {
      if (!(e instanceof ErroStripe) || !/No such subscription|canceled/i.test(e.message)) {
        return c.redirect(`/gestao?${new URLSearchParams({ erro: `A assinatura no Stripe não foi cancelada: ${e instanceof Error ? e.message : e}` })}`);
      }
    }
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE faturas SET licenca_id = NULL WHERE licenca_id = ?").bind(id),
    c.env.DB.prepare("UPDATE registos SET licenca_id = NULL WHERE licenca_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM envios_email WHERE licenca_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM emails_reservas WHERE licenca_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM licencas WHERE id = ?").bind(id),
  ]);
  return c.redirect(`/gestao?${new URLSearchParams({ ok: `Licença ${l.chave} apagada.` })}`);
});

// N.º de alojamentos de uma licença de cortesia (as pagas mudam-se no Stripe).
app.post("/gestao/licencas/:id/alojamentos", async (c) => {
  const n = Number((await c.req.parseBody<Record<string, string>>()).alojamentos);
  if (!Number.isInteger(n) || n < 1 || n > 1000) return c.text("Indique entre 1 e 1000 alojamentos.", 400);
  await c.env.DB.prepare("UPDATE licencas SET alojamentos_pagos = ?, atualizado_em = ? WHERE id = ? AND tipo = 'cortesia'")
    .bind(n, new Date().toISOString(), Number(c.req.param("id")))
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

// ---------- Emails de reserva reencaminhados pelos gestores ----------

const TAMANHO_MAXIMO_EMAIL = 2_000_000;
const EMAILS_POR_DIA = 200;
const DIAS_RETENCAO_EMAILS = 7;

// Endereço de cada licença (código aleatório: ninguém consegue adivinhar e enviar reservas falsas).
async function enderecoEmailReservas(env: Env, l: Licenca): Promise<string | null> {
  if (!env.DOMINIO_EMAIL_RESERVAS) return null;
  let token = l.email_token;
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
    await env.DB.prepare("UPDATE licencas SET email_token = ? WHERE id = ? AND email_token IS NULL").bind(token, l.id).run();
    token = (await env.DB.prepare("SELECT email_token FROM licencas WHERE id = ?").bind(l.id).first<string>("email_token"))!;
  }
  return `reservas-${token}@${env.DOMINIO_EMAIL_RESERVAS}`;
}

async function receberEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const token = message.to.toLowerCase().match(/^reservas-([a-z0-9]{8,20})@/)?.[1];
  if (!token) {
    if (env.ENCAMINHAR_EMAILS) return message.forward(env.ENCAMINHAR_EMAILS);
    return message.setReject("Endereço desconhecido");
  }
  const licenca = await env.DB.prepare("SELECT * FROM licencas WHERE email_token = ?").bind(token).first<Licenca>();
  if (!licenca) return message.setReject("Endereço desconhecido");
  if (message.rawSize > TAMANHO_MAXIMO_EMAIL) return message.setReject("Mensagem demasiado grande");
  const ontem = new Date(Date.now() - 86_400_000).toISOString();
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM emails_reservas WHERE licenca_id = ? AND recebido_em > ?").bind(licenca.id, ontem).first<number>("n");
  if ((n ?? 0) >= EMAILS_POR_DIA) return message.setReject("Demasiadas mensagens");

  const email = await PostalMime.parse(message.raw);
  const texto = email.text?.trim() || htmlParaTexto(email.html ?? "");
  const dados = lerEmailReserva({ de: email.from?.address ?? message.from, assunto: email.subject ?? "", texto });
  const agora = new Date();
  await env.DB.prepare("INSERT INTO emails_reservas (licenca_id, dados, recebido_em, expira_em) VALUES (?, ?, ?, ?)")
    .bind(licenca.id, JSON.stringify(dados), agora.toISOString(), new Date(agora.getTime() + DIAS_RETENCAO_EMAILS * 86_400_000).toISOString())
    .run();
}

// A instalação vai buscar os dados pendentes e confirma-os (são apagados logo a seguir).
app.post(CAMINHO_API_EMAILS_RESERVAS, async (c) => {
  const p = await c.req.json<{ chave?: string; confirmar?: number[] }>().catch(() => null);
  const licenca = typeof p?.chave === "string" ? await obterLicencaPorChave(c.env.DB, p.chave) : null;
  if (!licenca) return c.json({ erro: "Licença desconhecida" }, 403);
  const confirmar = (p?.confirmar ?? []).filter((x) => Number.isInteger(x)).slice(0, 500);
  if (confirmar.length) {
    await c.env.DB.prepare(`DELETE FROM emails_reservas WHERE licenca_id = ? AND id IN (${confirmar.map(() => "?").join(",")})`)
      .bind(licenca.id, ...confirmar)
      .run();
  }
  const itens = (await c.env.DB.prepare("SELECT id, dados, recebido_em FROM emails_reservas WHERE licenca_id = ? ORDER BY id LIMIT 50")
    .bind(licenca.id)
    .all<{ id: number; dados: string; recebido_em: string }>()).results;
  return c.json<{ itens: EmailReservaEntregue[] }>({ itens: itens.map((i) => ({ id: i.id, recebidoEm: i.recebido_em, dados: JSON.parse(i.dados) })) });
});

export default {
  fetch: app.fetch,
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await env.DB.prepare("DELETE FROM emails_reservas WHERE expira_em < ?").bind(new Date().toISOString()).run();
      await atualizarAlojadas(env);
    })());
  },
  async email(message: ForwardableEmailMessage, env: Env) {
    await receberEmail(message, env);
  },
} satisfies ExportedHandler<Env>;
