import { type Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { gerarToken, listarDeclaracoesTmt, listarReservas, obterReserva, obterReservaPorToken } from "./db";
import { hojeLisboa } from "./lib/datas";
import { estadoCodigo, mesesAteAnterior, ordenarPendentes, pendentesReserva, pendentesTmt } from "./lib/regras";
import { calcularTmt } from "./lib/tmt";
import type { Config } from "./lib/tipos";
import { type ResumoMesTmt, paginaLogin, paginaNovaReserva, paginaPainel, paginaReserva, paginaTmt } from "./views/admin";
import { paginaHospede } from "./views/hospede";

type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  CODIGO_CHAVES: string;
  HORAS_ANTES_CODIGO: string;
  HORA_CHECKIN: string;
  HORAS_PRAZO_HOSPEDES: string;
};

const COOKIE = "sessao";

const app = new Hono<{ Bindings: Env }>();

function config(env: Env): Config {
  return {
    horasAntesCodigo: Number(env.HORAS_ANTES_CODIGO),
    horaCheckin: env.HORA_CHECKIN,
    horasPrazoHospedes: Number(env.HORAS_PRAZO_HOSPEDES),
  };
}

// ---------- Autenticação do titular do AL ----------

async function iguais(a: string, b: string): Promise<boolean> {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [ha, hb] = await Promise.all([hash(a), hash(b)]);
  return ha.every((byte, i) => byte === hb[i]);
}

app.get("/", (c) => c.redirect("/admin"));
app.get("/login", (c) => c.html(paginaLogin()));

app.post("/login", async (c) => {
  const { password } = await c.req.parseBody<{ password: string }>();
  if (!c.env.ADMIN_PASSWORD || !(await iguais(String(password ?? ""), c.env.ADMIN_PASSWORD))) {
    return c.html(paginaLogin("Palavra-passe errada."), 401);
  }
  await setSignedCookie(c, COOKIE, "admin", c.env.SESSION_SECRET, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return c.redirect("/admin");
});

app.post("/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.redirect("/login");
});

app.use("/admin/*", async (c, next) => {
  if ((await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE)) !== "admin") return c.redirect("/login");
  await next();
});
app.use("/admin", async (c, next) => {
  if ((await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE)) !== "admin") return c.redirect("/login");
  await next();
});

// ---------- Painel ----------

app.get("/admin", async (c) => {
  const agora = new Date();
  const cfg = config(c.env);
  const [reservas, declaracoes] = await Promise.all([listarReservas(c.env.DB), listarDeclaracoesTmt(c.env.DB)]);
  const pendentes = [
    ...reservas.flatMap((rc) => pendentesReserva(rc.reserva, rc.hospedes, rc.faturacao, cfg, agora)),
    ...pendentesTmt(mesesTmt(reservas, agora), declaracoes),
  ];
  return c.html(paginaPainel(ordenarPendentes(pendentes), reservas, agora));
});

app.get("/admin/reservas/nova", (c) => c.html(paginaNovaReserva()));

app.post("/admin/reservas", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const checkin = data(b.checkin);
  const checkout = data(b.checkout);
  const n = Number(b.n_hospedes);
  if (!b.nome_titular?.trim() || !checkin || !checkout || checkout <= checkin || !(n >= 1)) {
    return c.text("Dados inválidos: confirme nome, datas e n.º de hóspedes.", 400);
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO reservas (token, ref_booking, nome_titular, checkin, checkout, n_hospedes, valor_total_cents, comissao_cents, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(gerarToken(), b.ref_booking?.trim() || null, b.nome_titular.trim(), checkin, checkout, n,
      cents(b.valor_total) ?? 0, cents(b.comissao) ?? 0, new Date().toISOString())
    .run();
  return c.redirect(`/admin/reservas/${res.meta.last_row_id}`);
});

app.get("/admin/reservas/:id", async (c) => {
  const rc = await obterReserva(c.env.DB, Number(c.req.param("id")));
  if (!rc) return c.notFound();
  const agora = new Date();
  const link = new URL(`/c/${rc.reserva.token}`, c.req.url).toString();
  const pendentes = ordenarPendentes(pendentesReserva(rc.reserva, rc.hospedes, rc.faturacao, config(c.env), agora));
  return c.html(paginaReserva(rc, link, pendentes, agora));
});

app.post("/admin/reservas/:id/valores", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  await c.env.DB.prepare("UPDATE reservas SET valor_total_cents = ?, comissao_cents = ?, tmt_cobrada_cents = ? WHERE id = ?")
    .bind(cents(b.valor_total) ?? 0, cents(b.comissao) ?? 0, cents(b.tmt_cobrada), Number(c.req.param("id")))
    .run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

app.post("/admin/reservas/:id/siba", async (c) => {
  await c.env.DB.prepare("UPDATE reservas SET siba_submetido_em = ? WHERE id = ?")
    .bind(new Date().toISOString(), Number(c.req.param("id")))
    .run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

app.post("/admin/reservas/:id/fatura", async (c) => {
  const { fatura_numero } = await c.req.parseBody<{ fatura_numero: string }>();
  if (!fatura_numero?.trim()) return c.text("Indique o número da fatura.", 400);
  await c.env.DB.prepare("UPDATE reservas SET fatura_numero = ?, fatura_emitida_em = ? WHERE id = ?")
    .bind(fatura_numero.trim(), new Date().toISOString(), Number(c.req.param("id")))
    .run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

app.post("/admin/reservas/:id/cancelar", async (c) => {
  await c.env.DB.prepare("UPDATE reservas SET cancelada = 1 WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

// ---------- Taxa municipal turística ----------

// Meses a declarar: desde o mês da primeira reserva até ao mês anterior ao atual.
function mesesTmt(reservas: Awaited<ReturnType<typeof listarReservas>>, agora: Date): string[] {
  const primeiro = reservas.map((rc) => rc.reserva.checkin.slice(0, 7)).sort()[0];
  return primeiro ? mesesAteAnterior(primeiro, agora) : [];
}

app.get("/admin/tmt", async (c) => {
  const agora = new Date();
  const [reservas, declaracoes] = await Promise.all([listarReservas(c.env.DB), listarDeclaracoesTmt(c.env.DB)]);
  const meses = [...mesesTmt(reservas, agora), hojeLisboa(agora).slice(0, 7)];
  const resumos: ResumoMesTmt[] = meses.reverse().map((mes) => {
    const doMes = reservas.filter((rc) => !rc.reserva.cancelada && rc.reserva.checkin.startsWith(mes));
    const calculos = doMes.map((rc) => calcularTmt(rc.reserva.checkin, rc.reserva.checkout, rc.hospedes));
    return {
      mes,
      hospedes: calculos.reduce((s, t) => s + t.hospedesTributaveis, 0),
      dormidas: calculos.reduce((s, t) => s + t.dormidasTributaveis, 0),
      valorCents: calculos.reduce((s, t) => s + t.valorCents, 0),
      semDados: doMes.filter((rc) => rc.hospedes.length < rc.reserva.n_hospedes).length,
      declaracao: declaracoes.find((d) => d.mes === mes),
    };
  });
  return c.html(paginaTmt(resumos));
});

app.post("/admin/tmt/:mes/:acao{declarado|pago}", async (c) => {
  const mes = c.req.param("mes");
  if (!/^\d{4}-\d{2}$/.test(mes)) return c.notFound();
  const coluna = c.req.param("acao") === "declarado" ? "declarado_em" : "pago_em";
  await c.env.DB.prepare(
    `INSERT INTO declaracoes_tmt (mes, ${coluna}) VALUES (?, ?) ON CONFLICT(mes) DO UPDATE SET ${coluna} = excluded.${coluna}`,
  )
    .bind(mes, new Date().toISOString())
    .run();
  return c.redirect("/admin/tmt");
});

// ---------- Página do hóspede ----------

async function renderHospede(c: Context<{ Bindings: Env }>, token: string, erro?: string) {
  const rc = await obterReservaPorToken(c.env.DB, token);
  if (!rc) return null;
  const cfg = config(c.env);
  const estado = estadoCodigo(rc.reserva, rc.hospedes, rc.faturacao, cfg, new Date());
  return c.html(paginaHospede(rc, estado, c.env.CODIGO_CHAVES, cfg, erro), erro ? 400 : 200);
}

app.get("/c/:token", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return (await renderHospede(c, c.req.param("token"))) ?? c.notFound();
});

app.post("/c/:token/titular", async (c) => {
  const token = c.req.param("token");
  const rc = await obterReservaPorToken(c.env.DB, token);
  if (!rc || rc.reserva.cancelada) return c.notFound();
  const b = await c.req.parseBody<Record<string, string>>();
  const titular = lerHospede(b, "t_");
  if (typeof titular === "string") return (await renderHospede(c, token, titular))!;
  if (!b.f_nome?.trim() || !b.f_nif?.trim() || !pais(b.f_pais)) {
    return (await renderHospede(c, token, "Preencha os dados da fatura. / Please fill in the invoice details."))!;
  }

  const db = c.env.DB;
  const agora = new Date().toISOString();
  const r = rc.reserva;
  const existentes = rc.hospedes.filter((h) => !h.titular).length;
  const emFalta = Math.max(0, r.n_hospedes - 1 - existentes);
  const outros = Array.from({ length: emFalta }, (_, i) => ({ nome: b[`o_nome_${i}`]?.trim(), nasc: data(b[`o_data_nascimento_${i}`]) }));
  if (outros.some((o) => !o.nome || !o.nasc)) {
    return (await renderHospede(c, token, "Indique nome e data de nascimento de todos os hóspedes. / Please enter name and date of birth for all guests."))!;
  }

  await db.batch([
    db.prepare("DELETE FROM hospedes WHERE reserva_id = ? AND titular = 1").bind(r.id),
    db.prepare(
      `INSERT INTO hospedes (reserva_id, titular, nome, data_nascimento, nacionalidade, pais_residencia, doc_tipo, doc_numero, doc_pais, criado_em)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(r.id, titular.nome, titular.data_nascimento, titular.nacionalidade, titular.pais_residencia, titular.doc_tipo,
      titular.doc_numero, titular.doc_pais, agora),
    ...outros.map((o) =>
      db.prepare("INSERT INTO hospedes (reserva_id, titular, nome, data_nascimento, criado_em) VALUES (?, 0, ?, ?, ?)")
        .bind(r.id, o.nome, o.nasc, agora),
    ),
    db.prepare(
      `INSERT INTO faturacao (reserva_id, nome, nif, pais, morada, codigo_postal, cidade, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(reserva_id) DO UPDATE SET nome = excluded.nome, nif = excluded.nif, pais = excluded.pais, morada = excluded.morada,
         codigo_postal = excluded.codigo_postal, cidade = excluded.cidade, email = excluded.email`,
    ).bind(r.id, b.f_nome.trim(), b.f_nif.replace(/\s/g, ""), pais(b.f_pais), b.f_morada?.trim() || null,
      b.f_codigo_postal?.trim() || null, b.f_cidade?.trim() || null, b.f_email?.trim() || null),
  ]);
  return c.redirect(`/c/${token}`);
});

app.post("/c/:token/hospede/:id", async (c) => {
  const token = c.req.param("token");
  const rc = await obterReservaPorToken(c.env.DB, token);
  const id = Number(c.req.param("id"));
  if (!rc || rc.reserva.cancelada || !rc.hospedes.some((h) => h.id === id)) return c.notFound();
  const h = lerHospede(await c.req.parseBody<Record<string, string>>(), "");
  if (typeof h === "string") return (await renderHospede(c, token, h))!;
  await c.env.DB.prepare(
    `UPDATE hospedes SET nome = ?, data_nascimento = ?, nacionalidade = ?, pais_residencia = ?, doc_tipo = ?, doc_numero = ?, doc_pais = ?
     WHERE id = ? AND reserva_id = ?`,
  )
    .bind(h.nome, h.data_nascimento, h.nacionalidade, h.pais_residencia, h.doc_tipo, h.doc_numero, h.doc_pais, id, rc.reserva.id)
    .run();
  return c.redirect(`/c/${token}`);
});

// ---------- Validação ----------

function lerHospede(b: Record<string, string>, p: string) {
  const nome = b[`${p}nome`]?.trim();
  const nasc = data(b[`${p}data_nascimento`]);
  const nacionalidade = pais(b[`${p}nacionalidade`]);
  if (!nome || !nasc || nasc >= hojeLisboa()) return "Nome e data de nascimento inválidos. / Invalid name or date of birth.";
  if (!nacionalidade) return "Indique a nacionalidade (código de 2 letras). / Enter nationality (2-letter code).";
  const doc = {
    pais_residencia: pais(b[`${p}pais_residencia`]),
    doc_tipo: ["P", "B", "O"].includes(b[`${p}doc_tipo`]) ? b[`${p}doc_tipo`] : null,
    doc_numero: b[`${p}doc_numero`]?.trim().toUpperCase() || null,
    doc_pais: pais(b[`${p}doc_pais`]),
  };
  if (nacionalidade !== "PT" && !(doc.pais_residencia && doc.doc_tipo && doc.doc_numero && doc.doc_pais)) {
    return "Para hóspedes estrangeiros, preencha o documento e o país de residência. / Foreign guests: please fill in ID document and country of residence.";
  }
  return { nome, data_nascimento: nasc, nacionalidade, ...doc };
}

function data(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function pais(v: string | undefined): string | null {
  const p = v?.trim().toUpperCase();
  return p && /^[A-Z]{2}$/.test(p) ? p : null;
}

function cents(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default app;
