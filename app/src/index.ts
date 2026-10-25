import { type Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import {
  type ReservaCompleta,
  definicaoInicial,
  gerarToken,
  gravarDefinicao,
  lerDefinicao,
  listarAlojamentos,
  listarDeclaracoesTmt,
  listarPassos,
  listarReservas,
  obterAlojamento,
  obterImagemPasso,
  obterReserva,
  obterReservaPorToken,
  prepararInstalacao,
} from "./db";
import { configAlojamento, regrasTmt } from "./lib/concelhos";
import { hojeLisboa } from "./lib/datas";
import { type EstadoGuardado, URL_LICENCAS_PREDEFINIDO, avisoLicenca, consultarLicenca } from "./lib/licenca";
import { estadoCodigo, mesesAteAnterior, ordenarPendentes, pendentesReserva, pendentesTmt } from "./lib/regras";
import { SENHA_MINIMA, iguais, verificarSenha } from "../../comum/senha";
import { calcularTmt, cobraTmt } from "./lib/tmt";
import type { Alojamento } from "./lib/tipos";
import {
  type Papel,
  type Utilizador,
  codigosDisponiveis,
  contarUtilizadores,
  criarUtilizador,
  emailValido,
  eUltimoGestor,
  gerarCodigos,
  listarUtilizadores,
  mudarSenha,
  novaVersaoSessao,
  obterPorEmail,
  obterUtilizador,
  usarCodigo,
} from "./lib/utilizadores";
import {
  type ResumoMesTmt,
  paginaAlojamento,
  paginaAlojamentos,
  paginaCodigos,
  paginaConfigurar,
  paginaConta,
  paginaDefinicoes,
  paginaInstrucoes,
  paginaLogin,
  paginaNovaReserva,
  paginaPainel,
  paginaRecuperar,
  paginaReserva,
  paginaSemAcesso,
  paginaTmt,
  paginaUtilizadores,
} from "./views/admin";
import { paginaHospede } from "./views/hospede";
import { VERSAO } from "./versao";

type Env = {
  DB: D1Database;
  // Opcionais: instalações anteriores à configuração no painel. Os valores na base de dados prevalecem.
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  CODIGO_CHAVES?: string;
  URL_PUBLICO?: string;
  URL_LICENCAS?: string; // servidor de licenças (predefinido: https://bookgest.pt)
  PLATAFORMA?: Fetcher; // ligação direta à plataforma, só na instalação do fornecedor (mesma conta Cloudflare)
};

type Variaveis = { utilizador: Utilizador };
type Ctx = Context<{ Bindings: Env; Variables: Variaveis }>;

const COOKIE = "sessao";
const MAX_IMAGEM = 1_500_000;

const app = new Hono<{ Bindings: Env; Variables: Variaveis }>();

app.use("*", async (c, next) => {
  await prepararInstalacao(c.env.DB, c.env.CODIGO_CHAVES);
  await next();
});

// ---------- Autenticação ----------

async function segredoSessao(c: Ctx): Promise<string> {
  if (c.env.SESSION_SECRET) return c.env.SESSION_SECRET;
  const aleatorio = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  return definicaoInicial(c.env.DB, "segredo_sessao", aleatorio);
}

// Cookie "<id>:<versão>": a versão muda quando a palavra-passe é alterada ou o utilizador desativado,
// o que termina as sessões abertas noutros dispositivos.
async function abrirSessao(c: Ctx, u: Pick<Utilizador, "id" | "versao_sessao">) {
  await setSignedCookie(c, COOKIE, `${u.id}:${u.versao_sessao}`, await segredoSessao(c), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// Instalações anteriores aos utilizadores: palavra-passe única (definida no painel ou no segredo ADMIN_PASSWORD).
async function senhaLegadaCorreta(c: Ctx, senha: string): Promise<boolean> {
  const guardada = await lerDefinicao(c.env.DB, "senha");
  if (guardada) return verificarSenha(senha, guardada);
  if (!c.env.ADMIN_PASSWORD) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return iguais(await hash(senha), await hash(c.env.ADMIN_PASSWORD));
}

type EstadoAcesso = "utilizadores" | "legado" | "nova";

async function estadoAcesso(c: Ctx): Promise<EstadoAcesso> {
  if (await contarUtilizadores(c.env.DB)) return "utilizadores";
  return c.env.ADMIN_PASSWORD || (await lerDefinicao(c.env.DB, "senha")) ? "legado" : "nova";
}

app.get("/", (c) => c.redirect("/admin"));

app.get("/login", async (c) => {
  const estado = await estadoAcesso(c);
  return estado === "nova" ? c.redirect("/configurar") : c.html(paginaLogin({ legado: estado === "legado" }));
});

app.post("/login", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  const senha = String(b.password ?? "");
  const estado = await estadoAcesso(c);

  if (estado === "legado") {
    // Primeira entrada com email: a palavra-passe atual confirma a identidade e o email fica a ser o do gestor.
    if (!email) return c.html(paginaLogin({ legado: true, erro: "Indique um email válido." }), 400);
    if (!(await senhaLegadaCorreta(c, senha))) return c.html(paginaLogin({ legado: true, erro: "Palavra-passe errada." }), 401);
    const id = await criarUtilizador(c.env.DB, { email, nome: null, senha, papel: "gestor" });
    await c.env.DB.prepare("DELETE FROM definicoes WHERE chave IN ('senha', 'versao_sessao')").run();
    const u = (await obterUtilizador(c.env.DB, id))!;
    await abrirSessao(c, u);
    return c.html(paginaCodigos(await gerarCodigos(c.env.DB, u.id), { primeiraVez: true }));
  }

  const u = email ? await obterPorEmail(c.env.DB, email) : null;
  if (!u || !u.ativo || !(await verificarSenha(senha, u.senha))) {
    return c.html(paginaLogin({ erro: "Email ou palavra-passe errados.", email: b.email }), 401);
  }
  await c.env.DB.prepare("UPDATE utilizadores SET ultimo_acesso = ? WHERE id = ?").bind(new Date().toISOString(), u.id).run();
  await abrirSessao(c, u);
  return c.redirect("/admin");
});

app.post("/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.redirect("/login");
});

// Assistente de primeiro arranque: só numa instalação sem utilizadores nem palavra-passe anterior.
app.get("/configurar", async (c) => ((await estadoAcesso(c)) === "nova" ? c.html(paginaConfigurar()) : c.redirect("/login")));

app.post("/configurar", async (c) => {
  if ((await estadoAcesso(c)) !== "nova") return c.redirect("/login");
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  if (!email) return c.html(paginaConfigurar("Indique um email válido."), 400);
  const erro = validarNovaSenha(b.senha, b.confirmar);
  if (erro) return c.html(paginaConfigurar(erro), 400);
  const id = await criarUtilizador(c.env.DB, { email, nome: b.nome?.trim() || null, senha: b.senha, papel: "gestor" });
  const u = (await obterUtilizador(c.env.DB, id))!;
  await abrirSessao(c, u);
  return c.html(paginaCodigos(await gerarCodigos(c.env.DB, u.id), { primeiraVez: true }));
});

// Palavra-passe esquecida (gestor): com um dos códigos de recuperação. A equipa pede ao gestor.
app.get("/recuperar", (c) => c.html(paginaRecuperar()));

app.post("/recuperar", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  const u = email ? await obterPorEmail(c.env.DB, email) : null;
  const erroSenha = validarNovaSenha(b.senha, b.confirmar);
  if (erroSenha) return c.html(paginaRecuperar(erroSenha), 400);
  if (!u || !u.ativo || u.papel !== "gestor" || !(await usarCodigo(c.env.DB, u.id, String(b.codigo ?? "")))) {
    return c.html(paginaRecuperar("Email ou código de recuperação inválidos."), 400);
  }
  await mudarSenha(c.env.DB, u.id, b.senha);
  await abrirSessao(c, (await obterUtilizador(c.env.DB, u.id))!);
  return c.redirect("/admin/conta?recuperado=1");
});

function validarNovaSenha(senha: string | undefined, confirmar: string | undefined): string | null {
  if (!senha || senha.length < SENHA_MINIMA) return `A palavra-passe tem de ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha !== confirmar) return "As palavras-passe não coincidem.";
  return null;
}

const exigirSessao = async (c: Ctx, next: () => Promise<void>) => {
  const [id, versao] = String((await getSignedCookie(c, await segredoSessao(c), COOKIE)) || "").split(":");
  const u = Number(id) ? await obterUtilizador(c.env.DB, Number(id)) : null;
  if (!u || !u.ativo || u.versao_sessao !== versao) return c.redirect("/login");
  c.set("utilizador", u);
  await next();
};
app.use("/admin", exigirSessao);
app.use("/admin/*", exigirSessao);

// A equipa trata das reservas; configuração, dados fiscais e documentos dos hóspedes são só do gestor.
const soGestor = async (c: Ctx, next: () => Promise<void>) => {
  if (c.get("utilizador").papel !== "gestor") return c.html(paginaSemAcesso(), 403);
  await next();
};
for (const caminho of [
  "/admin/alojamentos", "/admin/alojamentos/*", "/admin/instrucoes", "/admin/tmt", "/admin/tmt/*",
  "/admin/definicoes", "/admin/definicoes/*", "/admin/utilizadores", "/admin/utilizadores/*",
  "/admin/reservas/:id/valores", "/admin/reservas/:id/siba", "/admin/reservas/:id/fatura", "/admin/reservas/:id/cancelar",
]) {
  app.use(caminho, soGestor);
}

const papel = (c: Ctx): Papel => c.get("utilizador").papel;

// ---------- Painel ----------

type MapaAlojamentos = Map<number, Alojamento>;

async function carregarTudo(db: D1Database) {
  const [reservas, alojamentos, declaracoes] = await Promise.all([listarReservas(db), listarAlojamentos(db), listarDeclaracoesTmt(db)]);
  return { reservas, alojamentos, mapa: new Map(alojamentos.map((a) => [a.id, a])) as MapaAlojamentos, declaracoes };
}

function alojamentoDa(mapa: MapaAlojamentos, rc: ReservaCompleta): Alojamento {
  const a = mapa.get(rc.reserva.alojamento_id);
  if (!a) throw new Error(`Reserva ${rc.reserva.id} sem alojamento`);
  return a;
}

app.get("/admin", async (c) => {
  const agora = new Date();
  const [{ reservas, alojamentos, mapa, declaracoes }, licenca] = await Promise.all([carregarTudo(c.env.DB), lerLicenca(c.env.DB)]);
  const p = papel(c);
  if (!alojamentos.length) return p === "gestor" ? c.redirect("/admin/alojamentos/novo") : c.html(paginaSemAcesso());
  const todos = [
    ...reservas.flatMap((rc) => pendentesReserva(rc.reserva, rc.hospedes, rc.faturacao, configAlojamento(alojamentoDa(mapa, rc)), agora)),
    ...alojamentos.flatMap((a) =>
      pendentesTmt(mesesTmt(reservas, a.id, agora), declaracoes, { id: a.id, concelho: a.concelho, regras: regrasTmt(a) }),
    ),
  ];
  // A equipa só vê o que depende dela: formulários e dados de hóspedes por preencher.
  const pendentes = p === "gestor" ? todos : todos.filter((x) => x.tipo === "formulario" || x.tipo === "dados_hospedes");
  const aviso = p === "gestor" ? avisoLicenca(licenca.chave, licenca.estado, alojamentos.filter((a) => a.ativo).length, agora) : null;
  return c.html(paginaPainel(ordenarPendentes(pendentes), reservas, mapa, agora, aviso, p));
});

app.get("/admin/reservas/nova", async (c) => {
  const ativos = (await listarAlojamentos(c.env.DB)).filter((a) => a.ativo);
  if (!ativos.length) return papel(c) === "gestor" ? c.redirect("/admin/alojamentos/novo") : c.html(paginaSemAcesso());
  return c.html(paginaNovaReserva(ativos, papel(c)));
});

app.post("/admin/reservas", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const checkin = data(b.checkin);
  const checkout = data(b.checkout);
  const n = Number(b.n_hospedes);
  const alojamento = await obterAlojamento(c.env.DB, Number(b.alojamento_id));
  if (!alojamento?.ativo) return c.text("Escolha o alojamento.", 400);
  if (!b.nome_titular?.trim() || !checkin || !checkout || checkout <= checkin || !(n >= 1)) {
    return c.text("Dados inválidos: confirme nome, datas e n.º de hóspedes.", 400);
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO reservas (alojamento_id, token, ref_booking, nome_titular, checkin, checkout, n_hospedes, valor_total_cents, comissao_cents, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(alojamento.id, gerarToken(), b.ref_booking?.trim() || null, b.nome_titular.trim(), checkin, checkout, n,
      cents(b.valor_total) ?? 0, cents(b.comissao) ?? 0, new Date().toISOString())
    .run();
  return c.redirect(`/admin/reservas/${res.meta.last_row_id}`);
});

app.get("/admin/reservas/:id", async (c) => {
  const rc = await obterReserva(c.env.DB, Number(c.req.param("id")));
  if (!rc) return c.notFound();
  const alojamento = (await obterAlojamento(c.env.DB, rc.reserva.alojamento_id))!;
  const agora = new Date();
  // Atrás do porteiro (bookgest.pt → workers.dev) o pedido chega com o endereço do workers.dev:
  // o link para o hóspede usa o endereço público, quando definido.
  const link = new URL(`/c/${rc.reserva.token}`, c.env.URL_PUBLICO || c.req.url).toString();
  const pendentes = ordenarPendentes(pendentesReserva(rc.reserva, rc.hospedes, rc.faturacao, configAlojamento(alojamento), agora));
  return c.html(paginaReserva(rc, alojamento, link, pendentes, agora, papel(c)));
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

// Meses a declarar: desde o mês da primeira reserva do alojamento até ao mês anterior ao atual.
function mesesTmt(reservas: ReservaCompleta[], alojamentoId: number, agora: Date): string[] {
  const primeiro = reservas
    .filter((rc) => rc.reserva.alojamento_id === alojamentoId)
    .map((rc) => rc.reserva.checkin.slice(0, 7))
    .sort()[0];
  return primeiro ? mesesAteAnterior(primeiro, agora) : [];
}

app.get("/admin/tmt", async (c) => {
  const agora = new Date();
  const { reservas, alojamentos, declaracoes } = await carregarTudo(c.env.DB);
  const comTaxa = alojamentos.filter((a) => cobraTmt(regrasTmt(a)));
  const porAlojamento = comTaxa.map((a) => {
    const regras = regrasTmt(a);
    const meses = [...mesesTmt(reservas, a.id, agora), hojeLisboa(agora).slice(0, 7)];
    const resumos: ResumoMesTmt[] = meses.reverse().map((mes) => {
      const doMes = reservas.filter((rc) => rc.reserva.alojamento_id === a.id && !rc.reserva.cancelada && rc.reserva.checkin.startsWith(mes));
      const calculos = doMes.map((rc) => calcularTmt(rc.reserva.checkin, rc.reserva.checkout, rc.hospedes, regras));
      return {
        mes,
        hospedes: calculos.reduce((s, t) => s + t.hospedesTributaveis, 0),
        dormidasTotais: calculos.reduce((s, t) => s + t.dormidasTotais, 0),
        dormidas: calculos.reduce((s, t) => s + t.dormidasTributaveis, 0),
        dormidasAcimaLimite: calculos.reduce((s, t) => s + t.dormidasAcimaLimite, 0),
        dormidasMenores: calculos.reduce((s, t) => s + t.dormidasMenores, 0),
        valorCents: calculos.reduce((s, t) => s + t.valorCents, 0),
        semDados: doMes.filter((rc) => rc.hospedes.length < rc.reserva.n_hospedes).length,
        declaracao: declaracoes.find((d) => d.alojamento_id === a.id && d.mes === mes),
      };
    });
    return { alojamento: a, resumos };
  });
  return c.html(paginaTmt(porAlojamento, alojamentos.length > 1));
});

app.post("/admin/tmt/:alojamento/:mes/:acao{declarado|pago}", async (c) => {
  const mes = c.req.param("mes");
  const alojamento = await obterAlojamento(c.env.DB, Number(c.req.param("alojamento")));
  if (!alojamento || !/^\d{4}-\d{2}$/.test(mes)) return c.notFound();
  const coluna = c.req.param("acao") === "declarado" ? "declarado_em" : "pago_em";
  await c.env.DB.prepare(
    `INSERT INTO declaracoes_tmt_alojamento (alojamento_id, mes, ${coluna}) VALUES (?, ?, ?)
     ON CONFLICT(alojamento_id, mes) DO UPDATE SET ${coluna} = excluded.${coluna}`,
  )
    .bind(alojamento.id, mes, new Date().toISOString())
    .run();
  return c.redirect("/admin/tmt");
});

// ---------- Alojamentos ----------

app.get("/admin/alojamentos", async (c) => c.html(paginaAlojamentos(await listarAlojamentos(c.env.DB))));

app.get("/admin/alojamentos/novo", async (c) => {
  const primeiro = !(await listarAlojamentos(c.env.DB)).length;
  return c.html(paginaAlojamento(null, { primeiro, codigoSugerido: primeiro ? c.env.CODIGO_CHAVES : undefined }));
});

app.post("/admin/alojamentos", async (c) => {
  const v = lerAlojamento(await c.req.parseBody<Record<string, string>>());
  if (typeof v === "string") {
    const primeiro = !(await listarAlojamentos(c.env.DB)).length;
    return c.html(paginaAlojamento(null, { primeiro, erro: v }), 400);
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO alojamentos (nome, morada, registo_al, codigo_cofre, hora_checkin, horas_antes_codigo, horas_prazo_hospedes,
       concelho, tmt_valor_cents, tmt_max_noites, tmt_idade_minima, tmt_dia_declaracao, tmt_dia_pagamento, tmt_portal, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(...valoresAlojamento(v), new Date().toISOString())
    .run();
  return c.redirect(`/admin/alojamentos/${res.meta.last_row_id}?guardado=1`);
});

app.get("/admin/alojamentos/:id", async (c) => {
  const a = await obterAlojamento(c.env.DB, Number(c.req.param("id")));
  if (!a) return c.notFound();
  return c.html(paginaAlojamento(a, { guardado: c.req.query("guardado") === "1" }));
});

app.post("/admin/alojamentos/:id", async (c) => {
  const a = await obterAlojamento(c.env.DB, Number(c.req.param("id")));
  if (!a) return c.notFound();
  const v = lerAlojamento(await c.req.parseBody<Record<string, string>>());
  if (typeof v === "string") return c.html(paginaAlojamento(a, { erro: v }), 400);
  await c.env.DB.prepare(
    `UPDATE alojamentos SET nome = ?, morada = ?, registo_al = ?, codigo_cofre = ?, hora_checkin = ?, horas_antes_codigo = ?,
       horas_prazo_hospedes = ?, concelho = ?, tmt_valor_cents = ?, tmt_max_noites = ?, tmt_idade_minima = ?,
       tmt_dia_declaracao = ?, tmt_dia_pagamento = ?, tmt_portal = ?
     WHERE id = ?`,
  )
    .bind(...valoresAlojamento(v), a.id)
    .run();
  return c.redirect(`/admin/alojamentos/${a.id}?guardado=1`);
});

// Arquivar em vez de apagar: as reservas e declarações têm de ser conservadas.
app.post("/admin/alojamentos/:id/:acao{arquivar|reativar}", async (c) => {
  await c.env.DB.prepare("UPDATE alojamentos SET ativo = ? WHERE id = ?")
    .bind(c.req.param("acao") === "reativar" ? 1 : 0, Number(c.req.param("id")))
    .run();
  return c.redirect("/admin/alojamentos");
});

// ---------- Instruções de chegada (por alojamento) ----------

// Endereço antigo: vai para as instruções do primeiro alojamento criado.
app.get("/admin/instrucoes", async (c) => {
  const primeiro = await c.env.DB.prepare("SELECT MIN(id) AS id FROM alojamentos").first<number>("id");
  return c.redirect(primeiro ? `/admin/alojamentos/${primeiro}/instrucoes` : "/admin/alojamentos/novo");
});

async function mostrarInstrucoes(c: Ctx, a: Alojamento, erro?: string) {
  return c.html(paginaInstrucoes(a, await listarPassos(c.env.DB, a.id), erro), erro ? 400 : 200);
}

// Nas rotas com :passo, as consultas filtram também pelo alojamento: um passo de outro alojamento não é tocado.
async function alojamentoDoPedido(c: Ctx): Promise<Alojamento | null> {
  return obterAlojamento(c.env.DB, Number(c.req.param("id")));
}

app.get("/admin/alojamentos/:id/instrucoes", async (c) => {
  const a = await alojamentoDoPedido(c);
  return a ? mostrarInstrucoes(c, a) : c.notFound();
});

// Devolve [bytes, tipo] da foto enviada, null se não houver, ou uma mensagem de erro.
async function lerImagem(valor: unknown): Promise<[ArrayBuffer, string] | null | string> {
  if (!(valor instanceof File) || valor.size === 0) return null;
  if (!valor.type.startsWith("image/")) return "O ficheiro tem de ser uma imagem.";
  if (valor.size > MAX_IMAGEM) return "Foto demasiado grande (máx. 1,5 MB).";
  return [await valor.arrayBuffer(), valor.type];
}

app.post("/admin/alojamentos/:id/instrucoes", async (c) => {
  const a = await alojamentoDoPedido(c);
  if (!a) return c.notFound();
  const b = await c.req.parseBody();
  const imagem = await lerImagem(b.imagem);
  const texto = String(b.texto ?? "").trim();
  if (typeof imagem === "string") return mostrarInstrucoes(c, a, imagem);
  if (!imagem && !texto) return mostrarInstrucoes(c, a, "Adicione uma foto ou um texto.");
  await c.env.DB.prepare(
    `INSERT INTO passos (alojamento_id, ordem, texto, imagem, imagem_tipo, atualizado_em)
     VALUES (?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM passos WHERE alojamento_id = ?), ?, ?, ?, ?)`,
  )
    .bind(a.id, a.id, texto, imagem?.[0] ?? null, imagem?.[1] ?? null, new Date().toISOString())
    .run();
  return c.redirect(`/admin/alojamentos/${a.id}/instrucoes`);
});

app.post("/admin/alojamentos/:id/instrucoes/:passo", async (c) => {
  const a = await alojamentoDoPedido(c);
  if (!a) return c.notFound();
  const passo = Number(c.req.param("passo"));
  const b = await c.req.parseBody();
  const imagem = await lerImagem(b.imagem);
  if (typeof imagem === "string") return mostrarInstrucoes(c, a, imagem);
  const agora = new Date().toISOString();
  const texto = String(b.texto ?? "").trim();
  await (imagem
    ? c.env.DB.prepare("UPDATE passos SET texto = ?, imagem = ?, imagem_tipo = ?, atualizado_em = ? WHERE id = ? AND alojamento_id = ?")
        .bind(texto, imagem[0], imagem[1], agora, passo, a.id)
    : c.env.DB.prepare("UPDATE passos SET texto = ?, atualizado_em = ? WHERE id = ? AND alojamento_id = ?").bind(texto, agora, passo, a.id)
  ).run();
  return c.redirect(`/admin/alojamentos/${a.id}/instrucoes`);
});

app.post("/admin/alojamentos/:id/instrucoes/:passo/mover", async (c) => {
  const a = await alojamentoDoPedido(c);
  if (!a) return c.notFound();
  const passos = await listarPassos(c.env.DB, a.id);
  const i = passos.findIndex((p) => p.id === Number(c.req.param("passo")));
  const j = i + (c.req.query("dir") === "-1" ? -1 : 1);
  if (i >= 0 && j >= 0 && j < passos.length) {
    [passos[i], passos[j]] = [passos[j], passos[i]];
    await c.env.DB.batch(passos.map((p, ordem) => c.env.DB.prepare("UPDATE passos SET ordem = ? WHERE id = ?").bind(ordem + 1, p.id)));
  }
  return c.redirect(`/admin/alojamentos/${a.id}/instrucoes`);
});

app.post("/admin/alojamentos/:id/instrucoes/:passo/apagar", async (c) => {
  const a = await alojamentoDoPedido(c);
  if (!a) return c.notFound();
  await c.env.DB.prepare("DELETE FROM passos WHERE id = ? AND alojamento_id = ?").bind(Number(c.req.param("passo")), a.id).run();
  return c.redirect(`/admin/alojamentos/${a.id}/instrucoes`);
});

async function responderImagem(db: D1Database, passo: number, alojamentoId: number) {
  const img = await obterImagemPasso(db, passo, alojamentoId);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(img.bytes, {
    headers: { "Content-Type": img.tipo, "Cache-Control": "private, max-age=86400" },
  });
}

app.get("/admin/alojamentos/:id/instrucoes/:passo/imagem", (c) =>
  responderImagem(c.env.DB, Number(c.req.param("passo")), Number(c.req.param("id"))),
);

// ---------- Definições ----------

async function mostrarDefinicoes(c: Ctx, opcoes: { erro?: string; guardado?: boolean } = {}) {
  const licenca = await lerLicenca(c.env.DB);
  const ativos = (await listarAlojamentos(c.env.DB)).filter((a) => a.ativo).length;
  return c.html(
    paginaDefinicoes({ ...opcoes, licenca: { ...licenca, aviso: avisoLicenca(licenca.chave, licenca.estado, ativos, new Date()) } }),
    opcoes.erro ? 400 : 200,
  );
}

app.get("/admin/definicoes", (c) => mostrarDefinicoes(c));

// ---------- A minha conta (todos os utilizadores) ----------

async function mostrarConta(c: Ctx, opcoes: { erro?: string; ok?: string } = {}) {
  const u = c.get("utilizador");
  const codigos = u.papel === "gestor" ? await codigosDisponiveis(c.env.DB, u.id) : null;
  return c.html(paginaConta(u, codigos, opcoes), opcoes.erro ? 400 : 200);
}

app.get("/admin/conta", (c) => {
  const ok = c.req.query("recuperado") === "1"
    ? "Palavra-passe redefinida. Esse código de recuperação já não serve: gere novos se lhe restarem poucos."
    : c.req.query("guardado") === "1" ? "Guardado." : undefined;
  return mostrarConta(c, { ok });
});

app.post("/admin/conta/dados", async (c) => {
  const u = c.get("utilizador");
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  if (!email) return mostrarConta(c, { erro: "Indique um email válido." });
  const outro = await obterPorEmail(c.env.DB, email);
  if (outro && outro.id !== u.id) return mostrarConta(c, { erro: "Esse email já pertence a outro utilizador." });
  await c.env.DB.prepare("UPDATE utilizadores SET email = ?, nome = ? WHERE id = ?").bind(email, b.nome?.trim() || null, u.id).run();
  return c.redirect("/admin/conta?guardado=1");
});

app.post("/admin/conta/senha", async (c) => {
  const u = c.get("utilizador");
  const b = await c.req.parseBody<Record<string, string>>();
  if (!(await verificarSenha(String(b.atual ?? ""), u.senha))) return mostrarConta(c, { erro: "A palavra-passe atual está errada." });
  const erro = validarNovaSenha(b.senha, b.confirmar);
  if (erro) return mostrarConta(c, { erro });
  await mudarSenha(c.env.DB, u.id, b.senha);
  await abrirSessao(c, (await obterUtilizador(c.env.DB, u.id))!);
  return mostrarConta(c, { ok: "Palavra-passe alterada. As sessões noutros dispositivos foram terminadas." });
});

app.post("/admin/conta/codigos", async (c) => {
  const u = c.get("utilizador");
  if (u.papel !== "gestor") return c.html(paginaSemAcesso(), 403);
  const { atual } = await c.req.parseBody<{ atual: string }>();
  if (!(await verificarSenha(String(atual ?? ""), u.senha))) return mostrarConta(c, { erro: "A palavra-passe atual está errada." });
  return c.html(paginaCodigos(await gerarCodigos(c.env.DB, u.id), { primeiraVez: false }));
});

// ---------- Utilizadores (gestor) ----------

async function mostrarUtilizadores(c: Ctx, opcoes: { erro?: string; ok?: string } = {}) {
  return c.html(paginaUtilizadores(await listarUtilizadores(c.env.DB), c.get("utilizador").id, opcoes), opcoes.erro ? 400 : 200);
}

app.get("/admin/utilizadores", (c) => mostrarUtilizadores(c));

app.post("/admin/utilizadores", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  const p = b.papel === "gestor" ? "gestor" : "equipa";
  if (!email) return mostrarUtilizadores(c, { erro: "Indique um email válido." });
  if (await obterPorEmail(c.env.DB, email)) return mostrarUtilizadores(c, { erro: "Já existe um utilizador com esse email." });
  const erro = validarNovaSenha(b.senha, b.senha);
  if (erro) return mostrarUtilizadores(c, { erro });
  await criarUtilizador(c.env.DB, { email, nome: b.nome?.trim() || null, senha: b.senha, papel: p });
  return mostrarUtilizadores(c, { ok: `Utilizador ${email} criado. Dê-lhe a palavra-passe e peça-lhe que a mude em "Conta".` });
});

async function outroUtilizador(c: Ctx): Promise<Utilizador | null> {
  const u = await obterUtilizador(c.env.DB, Number(c.req.param("id")));
  return u && u.id !== c.get("utilizador").id ? u : null; // a própria conta muda-se em "Conta"
}

app.post("/admin/utilizadores/:id/senha", async (c) => {
  const u = await outroUtilizador(c);
  if (!u) return c.notFound();
  const { senha } = await c.req.parseBody<{ senha: string }>();
  const erro = validarNovaSenha(senha, senha);
  if (erro) return mostrarUtilizadores(c, { erro });
  await mudarSenha(c.env.DB, u.id, senha);
  return mostrarUtilizadores(c, { ok: `Nova palavra-passe definida para ${u.email}.` });
});

app.post("/admin/utilizadores/:id/:acao{desativar|reativar}", async (c) => {
  const u = await outroUtilizador(c);
  if (!u) return c.notFound();
  const ativar = c.req.param("acao") === "reativar";
  if (!ativar && u.papel === "gestor" && (await eUltimoGestor(c.env.DB, u.id))) {
    return mostrarUtilizadores(c, { erro: "Não pode desativar o último gestor." });
  }
  // Desativar termina logo as sessões dessa pessoa.
  await c.env.DB.prepare("UPDATE utilizadores SET ativo = ?, versao_sessao = ? WHERE id = ?")
    .bind(ativar ? 1 : 0, novaVersaoSessao(), u.id)
    .run();
  return c.redirect("/admin/utilizadores");
});

app.post("/admin/utilizadores/:id/papel", async (c) => {
  const u = await outroUtilizador(c);
  if (!u) return c.notFound();
  const { papel: novo } = await c.req.parseBody<{ papel: string }>();
  if (novo !== "gestor" && novo !== "equipa") return c.text("Papel inválido.", 400);
  if (novo === "equipa" && u.papel === "gestor" && (await eUltimoGestor(c.env.DB, u.id))) {
    return mostrarUtilizadores(c, { erro: "Tem de haver pelo menos um gestor." });
  }
  await c.env.DB.prepare("UPDATE utilizadores SET papel = ? WHERE id = ?").bind(novo, u.id).run();
  return c.redirect("/admin/utilizadores");
});

app.post("/admin/definicoes/licenca", async (c) => {
  const { chave } = await c.req.parseBody<{ chave: string }>();
  const limpa = String(chave ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,64}$/.test(limpa)) return mostrarDefinicoes(c, { erro: "Chave de licença inválida." });
  await gravarDefinicao(c.env.DB, "licenca_chave", limpa);
  await c.env.DB.prepare("DELETE FROM definicoes WHERE chave = 'licenca_estado'").run();
  await verificarLicenca(c.env);
  return c.redirect("/admin/definicoes");
});

// ---------- Licença ----------

async function lerLicenca(db: D1Database): Promise<{ chave: string | null; estado: EstadoGuardado | null; erro: string | null }> {
  const [chave, estado, erro] = await Promise.all([
    lerDefinicao(db, "licenca_chave"),
    lerDefinicao(db, "licenca_estado"),
    lerDefinicao(db, "licenca_erro"),
  ]);
  return { chave, estado: estado ? (JSON.parse(estado) as EstadoGuardado) : null, erro };
}

// Corre uma vez por dia (cron) e ao guardar a chave. Sem resposta, mantém o último estado conhecido.
async function verificarLicenca(env: Env): Promise<void> {
  const chave = await lerDefinicao(env.DB, "licenca_chave");
  if (!chave) return;
  const alojamentos = (await env.DB.prepare("SELECT COUNT(*) AS n FROM alojamentos WHERE ativo = 1").first<number>("n")) ?? 0;
  try {
    const r = await consultarLicenca(env.URL_LICENCAS || URL_LICENCAS_PREDEFINIDO, { chave, versao: VERSAO, alojamentos }, env.PLATAFORMA);
    const guardado: EstadoGuardado = { estado: r.estado, alojamentosPagos: r.alojamentosPagos, verificadoEm: new Date().toISOString() };
    await gravarDefinicao(env.DB, "licenca_estado", JSON.stringify(guardado));
    await env.DB.prepare("DELETE FROM definicoes WHERE chave = 'licenca_erro'").run();
  } catch (e) {
    console.error("Verificação da licença falhou", e);
    await gravarDefinicao(env.DB, "licenca_erro", String(e).slice(0, 300));
  }
}

// ---------- Página do hóspede ----------

async function renderHospede(c: Ctx, token: string, erro?: string) {
  const rc = await obterReservaPorToken(c.env.DB, token);
  if (!rc) return null;
  const alojamento = (await obterAlojamento(c.env.DB, rc.reserva.alojamento_id))!;
  const cfg = configAlojamento(alojamento);
  const estado = estadoCodigo(rc.reserva, rc.hospedes, rc.faturacao, cfg, new Date());
  const passos = estado === "disponivel" ? await listarPassos(c.env.DB, alojamento.id) : [];
  return c.html(paginaHospede(rc, alojamento, estado, passos, cfg, erro), erro ? 400 : 200);
}

app.get("/c/:token", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return (await renderHospede(c, c.req.param("token"))) ?? c.notFound();
});

// As fotos mostram onde está o cofre: só são servidas quando o código está disponível,
// e só as do alojamento da reserva.
app.get("/c/:token/passo/:id", async (c) => {
  const rc = await obterReservaPorToken(c.env.DB, c.req.param("token"));
  if (!rc) return c.notFound();
  const alojamento = (await obterAlojamento(c.env.DB, rc.reserva.alojamento_id))!;
  if (estadoCodigo(rc.reserva, rc.hospedes, rc.faturacao, configAlojamento(alojamento), new Date()) !== "disponivel") {
    return c.notFound();
  }
  return responderImagem(c.env.DB, Number(c.req.param("id")), alojamento.id);
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

function lerAlojamento(b: Record<string, string>) {
  const texto = (k: string) => b[k]?.trim() || null;
  const inteiro = (k: string, min: number, max: number) => {
    const n = Number(b[k]?.trim());
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const nome = texto("nome");
  const codigo = texto("codigo_cofre");
  const hora = b.hora_checkin?.trim();
  const horasAntes = inteiro("horas_antes_codigo", 0, 168);
  const horasPrazo = inteiro("horas_prazo_hospedes", 0, 336);
  const valor = b.tmt_valor?.trim() ? cents(b.tmt_valor) : 0;
  const maxNoites = b.tmt_max_noites?.trim() ? inteiro("tmt_max_noites", 0, 365) : 0;
  const idade = b.tmt_idade_minima?.trim() ? inteiro("tmt_idade_minima", 0, 25) : 0;
  const diaDecl = inteiro("tmt_dia_declaracao", 1, 31);
  const diaPag = inteiro("tmt_dia_pagamento", 1, 31);
  const concelho = texto("concelho");
  const portal = texto("tmt_portal");

  if (!nome) return "Indique o nome do alojamento.";
  if (!codigo) return "Indique o código do cofre das chaves.";
  if (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return "Hora de check-in inválida (ex.: 15:00).";
  if (horasAntes == null) return "Horas antes do check-in para mostrar o código: entre 0 e 168.";
  if (horasPrazo == null) return "Prazo para os restantes hóspedes: entre 0 e 336 horas.";
  if (valor == null || valor < 0) return "Valor da taxa turística inválido.";
  if (valor > 0 && !concelho) return "Indique o concelho da taxa turística.";
  if (maxNoites == null || idade == null || diaDecl == null || diaPag == null) return "Confira os campos da taxa turística.";
  if (portal && !/^https:\/\/\S+$/.test(portal)) return "O endereço do portal da câmara tem de começar por https://";
  return {
    nome, morada: texto("morada"), registo_al: texto("registo_al"), codigo_cofre: codigo, hora_checkin: hora,
    horas_antes_codigo: horasAntes, horas_prazo_hospedes: horasPrazo, concelho: concelho ?? "", tmt_valor_cents: valor,
    tmt_max_noites: maxNoites, tmt_idade_minima: idade, tmt_dia_declaracao: diaDecl, tmt_dia_pagamento: diaPag, tmt_portal: portal,
  };
}

// Mesma ordem das colunas no INSERT e no UPDATE de alojamentos.
function valoresAlojamento(v: Exclude<ReturnType<typeof lerAlojamento>, string>) {
  return [v.nome, v.morada, v.registo_al, v.codigo_cofre, v.hora_checkin, v.horas_antes_codigo, v.horas_prazo_hospedes,
    v.concelho, v.tmt_valor_cents, v.tmt_max_noites, v.tmt_idade_minima, v.tmt_dia_declaracao, v.tmt_dia_pagamento, v.tmt_portal];
}

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

export default {
  fetch: app.fetch,
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(prepararInstalacao(env.DB, env.CODIGO_CHAVES).then(() => verificarLicenca(env)));
  },
} satisfies ExportedHandler<Env>;
