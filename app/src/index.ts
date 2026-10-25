import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
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
import { hojeLisboa, somarDias } from "./lib/datas";
import { compararVersoes } from "../../comum/versoes";
import { atualizar } from "./lib/atualizacao";
import type { Plataforma } from "./lib/ical";
import { listarCalendarios, sincronizarCalendario, sincronizarTodos } from "./lib/importacao";
import { listarEmails, receberEmails } from "./lib/emails";
import {
  type EstadoGuardado,
  URL_LICENCAS_PREDEFINIDO,
  avisoLicenca,
  consultarLicenca,
  dataBloqueio,
  haProblema,
  pedirEmailRecuperacao,
  reservasBloqueadas,
} from "./lib/licenca";
import { estadoCodigo, mesesAteAnterior, ordenarPendentes, pendentesReserva, pendentesTmt } from "./lib/regras";
import { SENHA_MINIMA, iguais, verificarSenha } from "../../comum/senha";
import { calcularTmt, cobraTmt } from "./lib/tmt";
import type { Alojamento, DeclaracaoTmt, Reserva } from "./lib/tipos";
import {
  type Papel,
  type Utilizador,
  codigosDisponiveis,
  contarUtilizadores,
  criarPedidoRecuperacao,
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
  usarPedidoRecuperacao,
  validarPedidoRecuperacao,
} from "./lib/utilizadores";
import {
  type ResumoMesTmt,
  paginaAlojamento,
  paginaAlojamentos,
  paginaCodigos,
  paginaConfigurar,
  paginaConta,
  paginaDefinicoes,
  paginaEmails,
  paginaInstrucoes,
  paginaLogin,
  paginaNovaReserva,
  paginaNovaSenhaEmail,
  paginaRecuperar,
  paginaReserva,
  paginaReservasBloqueadas,
  paginaSemAcesso,
  paginaTmt,
  paginaUtilizadores,
} from "./views/admin";
import { paginaHospede } from "./views/hospede";
import { type VistaReservas, paginaCalendario, paginaHoje, paginaMais, paginaReservas } from "./views/painel";
import { barrasCalendario, numerosHoje } from "./lib/painel";
import { faturaPortal, regimeIvaValido } from "./lib/faturacao";
import { paisValido } from "./lib/paises";
import { NOMES_PROGRAMA, emitir, gravarConfigFaturacao, lerConfigFaturacao, lerFormularioFaturacao, testarLigacao } from "./lib/programas-faturacao";
import { paginaFaturacao } from "./views/faturacao";
import { paginaFaturaPortal } from "./views/fatura-portal";
import { ESTATICOS } from "./estaticos.gerado";
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
  // Só nas instalações feitas pelo instalador: permitem a atualização automática.
  CF_API_TOKEN?: string;
  CF_CONTA?: string;
  CF_SCRIPT?: string;
  CF_API_URL?: string; // só para testes locais
};

type Variaveis = { utilizador: Utilizador };
type Ctx = Context<{ Bindings: Env; Variables: Variaveis }>;

const COOKIE = "sessao";
const MAX_IMAGEM = 1_500_000;

const app = new Hono<{ Bindings: Env; Variables: Variaveis }>();

// Ficheiros estáticos (estilo, ícone, manifest, service worker), embutidos no código.
app.get("/:ficheiro{[a-z.]+\\.(css|svg|webmanifest|js)}", (c, next) => {
  const f = ESTATICOS[`/${c.req.param("ficheiro")}`];
  if (!f) return next();
  return c.body(f.conteudo, 200, { "Content-Type": f.tipo, "Cache-Control": "public, max-age=3600" });
});

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
// Instalações feitas pelo instalador: o assistente só abre com o código de uso único do link final da instalação
// (fecha a janela em que quem abrisse o endereço primeiro ficaria com a instalação).
async function codigoConfiguracaoValido(c: Ctx, t: string | undefined): Promise<boolean> {
  const guardado = await lerDefinicao(c.env.DB, "token_configuracao");
  if (!guardado) return true;
  if (!t) return false;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
  return iguais(new TextEncoder().encode([...d].map((b) => b.toString(16).padStart(2, "0")).join("")), new TextEncoder().encode(guardado));
}

const SEM_CODIGO = "Abra o link «Criar a minha conta» mostrado no fim da instalação.";

app.get("/configurar", async (c) => {
  if ((await estadoAcesso(c)) !== "nova") return c.redirect("/login");
  const t = c.req.query("t");
  return (await codigoConfiguracaoValido(c, t)) ? c.html(paginaConfigurar(undefined, t)) : c.html(paginaConfigurar(SEM_CODIGO, undefined, true), 403);
});

app.post("/configurar", async (c) => {
  if ((await estadoAcesso(c)) !== "nova") return c.redirect("/login");
  const b = await c.req.parseBody<Record<string, string>>();
  if (!(await codigoConfiguracaoValido(c, b.t))) return c.html(paginaConfigurar(SEM_CODIGO, undefined, true), 403);
  const email = emailValido(b.email);
  if (!email) return c.html(paginaConfigurar("Indique um email válido.", b.t), 400);
  const erro = validarNovaSenha(b.senha, b.confirmar);
  if (erro) return c.html(paginaConfigurar(erro, b.t), 400);
  await c.env.DB.prepare("DELETE FROM definicoes WHERE chave = 'token_configuracao'").run();
  const id = await criarUtilizador(c.env.DB, { email, nome: b.nome?.trim() || null, senha: b.senha, papel: "gestor" });
  const u = (await obterUtilizador(c.env.DB, id))!;
  await abrirSessao(c, u);
  return c.html(paginaCodigos(await gerarCodigos(c.env.DB, u.id), { primeiraVez: true }));
});

// Palavra-passe esquecida: link por email (todos os utilizadores) ou código de recuperação (gestor).
app.get("/recuperar", (c) => c.html(paginaRecuperar()));

const COOKIE_RECUPERACAO = "recuperacao";

app.post("/recuperar/email", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  if (!email) return c.html(paginaRecuperar({ erroEmail: "Indique um email válido." }), 400);
  const chave = await lerDefinicao(c.env.DB, "licenca_chave");
  if (!chave) {
    return c.html(paginaRecuperar({ erroEmail: "O envio por email precisa da chave de licença (Definições). Use um código de recuperação ou peça a um gestor." }), 503);
  }
  const u = await obterPorEmail(c.env.DB, email);
  // Sem utilizador ativo, a resposta é a mesma: a página não revela que emails existem.
  if (u?.ativo) {
    const pedido = await criarPedidoRecuperacao(c.env.DB, u.id);
    if (!pedido) return c.html(paginaRecuperar({ erroEmail: "Já pediu vários links na última hora. Use o mais recente ou tente mais tarde." }), 429);
    const link = new URL(`/recuperar/${pedido.token}`, c.env.URL_PUBLICO || c.req.url).toString();
    try {
      await pedirEmailRecuperacao(c.env.URL_LICENCAS || URL_LICENCAS_PREDEFINIDO, { chave, para: u.email, link }, c.env.PLATAFORMA);
    } catch (e) {
      console.error("Email de recuperação falhou", e);
      return c.html(paginaRecuperar({ erroEmail: `Não foi possível enviar o email (${e instanceof Error ? e.message : e}). Use um código de recuperação ou peça a um gestor.` }), 502);
    }
    // A segunda parte do link fica só neste browser (Lax: o cookie acompanha a abertura do link a partir do email).
    setCookie(c, COOKIE_RECUPERACAO, pedido.navegador, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/recuperar",
      maxAge: 3600,
    });
  }
  return c.html(paginaRecuperar({ enviado: true }));
});

async function pedidoDoLink(c: Ctx) {
  return validarPedidoRecuperacao(c.env.DB, c.req.param("token")!, getCookie(c, COOKIE_RECUPERACAO));
}

app.get("/recuperar/:token{[A-Za-z0-9_-]{32,}}", async (c) => {
  c.header("Referrer-Policy", "no-referrer");
  const p = await pedidoDoLink(c);
  return typeof p === "string" ? c.html(paginaNovaSenhaEmail(c.req.param("token"), p), 400) : c.html(paginaNovaSenhaEmail(c.req.param("token")));
});

app.post("/recuperar/:token{[A-Za-z0-9_-]{32,}}", async (c) => {
  const token = c.req.param("token");
  const p = await pedidoDoLink(c);
  if (typeof p === "string") return c.html(paginaNovaSenhaEmail(token, p), 400);
  const b = await c.req.parseBody<Record<string, string>>();
  const erro = validarNovaSenha(b.senha, b.confirmar);
  if (erro) return c.html(paginaNovaSenhaEmail(token, undefined, erro), 400);
  const u = await obterUtilizador(c.env.DB, p.utilizadorId);
  if (!u?.ativo || !(await usarPedidoRecuperacao(c.env.DB, p.id))) return c.html(paginaNovaSenhaEmail(token, "invalido"), 400);
  await mudarSenha(c.env.DB, u.id, b.senha);
  deleteCookie(c, COOKIE_RECUPERACAO, { path: "/recuperar" });
  await abrirSessao(c, (await obterUtilizador(c.env.DB, u.id))!);
  return c.redirect("/admin/conta?recuperado=email");
});

app.post("/recuperar", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const email = emailValido(b.email);
  const u = email ? await obterPorEmail(c.env.DB, email) : null;
  const erroSenha = validarNovaSenha(b.senha, b.confirmar);
  if (erroSenha) return c.html(paginaRecuperar({ erroCodigo: erroSenha }), 400);
  if (!u || !u.ativo || u.papel !== "gestor" || !(await usarCodigo(c.env.DB, u.id, String(b.codigo ?? "")))) {
    return c.html(paginaRecuperar({ erroCodigo: "Email ou código de recuperação inválidos." }), 400);
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
  "/admin/reservas/:id/valores", "/admin/reservas/:id/siba", "/admin/reservas/:id/fatura", "/admin/reservas/:id/fatura/portal", "/admin/reservas/:id/fatura/emitir", "/admin/reservas/:id/fatura/anular", "/admin/reservas/:id/siba/anular", "/admin/reservas/:id/cancelar",
  "/admin/reservas/:id/ignorar", "/admin/reservas/:id/manter", "/admin/emails", "/admin/emails/*", "/admin/mais",
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
  // Emails de reserva que precisam do gestor (por associar, ou confirmação do reencaminhamento do Gmail).
  const porTratar = await c.env.DB.prepare("SELECT estado, COUNT(*) AS n FROM emails_recebidos WHERE estado IN ('por_associar', 'confirmacao') GROUP BY estado")
    .all<{ estado: string; n: number }>();
  for (const e of porTratar.results) {
    todos.push({
      tipo: "email",
      descricao: e.estado === "confirmacao" ? "Confirmar o reencaminhamento de emails (Gmail)" : `${e.n} email(s) de reserva por associar`,
      prazo: null,
      link: "/admin/emails",
    });
  }
  const pendentes = p === "gestor" ? todos : todos.filter((x) => ["completar", "formulario", "dados_hospedes"].includes(x.tipo));
  const avisoBase = p === "gestor" ? avisoLicenca(licenca.chave, licenca.estado, alojamentos.filter((a) => a.ativo).length, agora) : null;
  const aviso = avisoBase && licenca.problemaDesde
    ? `${avisoBase} ${reservasBloqueadas(licenca.problemaDesde, agora) ? "Já não é possível criar reservas novas." : `A partir de ${dataBloqueio(licenca.problemaDesde).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })} deixa de ser possível criar reservas novas.`}`
    : avisoBase;
  // Filtro por alojamento (só com mais de um alojamento ativo).
  const ativos = alojamentos.filter((a) => a.ativo);
  const filtro = filtroAlojamento(c, ativos);
  const doFiltro = <T extends { alojamento_id?: number; alojamentoId?: number }>(x: T) =>
    filtro == null || (x.alojamento_id ?? x.alojamentoId) == null || (x.alojamento_id ?? x.alojamentoId) === filtro;
  const reservasFiltradas = reservas.filter((rc) => doFiltro(rc.reserva));
  const hoje = hojeLisboa(agora);
  return c.html(paginaHoje({
    hoje,
    pendentes: ordenarPendentes(pendentes.filter(doFiltro)),
    reservas: reservasFiltradas,
    alojamentos: ativos,
    filtro,
    numeros: numerosHoje(reservasFiltradas.map((rc) => rc.reserva), filtro == null ? ativos.length : 1, hoje),
    aviso,
    papel: p,
  }));
});

const origemValida = (v: string | undefined) => (["booking", "airbnb", "manual", "outra"].includes(v ?? "") ? v! : "manual");

function filtroAlojamento(c: Ctx, ativos: Alojamento[]): number | null {
  const id = Number(c.req.query("alojamento"));
  return ativos.length > 1 && ativos.some((a) => a.id === id) ? id : null;
}

app.get("/admin/calendario", async (c) => {
  const hoje = hojeLisboa(new Date());
  const pedido = c.req.query("inicio") ?? "";
  // Por omissão começa dois dias antes de hoje, para se verem também as saídas recentes.
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(pedido) && !Number.isNaN(Date.parse(pedido)) ? pedido : somarDias(hoje, -2);
  const dias = c.req.query("dias") === "28" ? 28 : 14;
  const [reservas, alojamentos] = await Promise.all([listarReservas(c.env.DB), listarAlojamentos(c.env.DB)]);
  const linhas = alojamentos.filter((a) => a.ativo).map((alojamento) => ({
    alojamento,
    barras: barrasCalendario(reservas.map((rc) => rc.reserva).filter((r) => r.alojamento_id === alojamento.id), inicio, dias),
  }));
  return c.html(paginaCalendario({ inicio, dias, hoje, linhas, papel: papel(c) }));
});

app.get("/admin/reservas", async (c) => {
  const [reservas, alojamentos] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM reservas WHERE ignorada = 0 ORDER BY checkin DESC").all<Reserva>(),
    listarAlojamentos(c.env.DB),
  ]);
  const vista = c.req.query("vista");
  return c.html(paginaReservas({
    hoje: hojeLisboa(new Date()),
    reservas: reservas.results,
    alojamentos: alojamentos.filter((a) => a.ativo),
    filtro: filtroAlojamento(c, alojamentos.filter((a) => a.ativo)),
    vista: (["anteriores", "canceladas"].includes(vista ?? "") ? vista : "proximas") as VistaReservas,
    pesquisa: (c.req.query("q") ?? "").slice(0, 100),
    papel: papel(c),
  }));
});

app.get("/admin/mais", (c) => c.html(paginaMais()));

app.get("/admin/reservas/nova", async (c) => {
  const bloqueio = await bloqueioReservas(c);
  if (bloqueio) return bloqueio;
  const ativos = (await listarAlojamentos(c.env.DB)).filter((a) => a.ativo);
  if (!ativos.length) return papel(c) === "gestor" ? c.redirect("/admin/alojamentos/novo") : c.html(paginaSemAcesso());
  const q = (k: string) => c.req.query(k) ?? "";
  // Pré-preenchida a partir de um email de reserva que não foi possível associar.
  const sugestao = { nome: q("nome"), checkin: q("checkin"), checkout: q("checkout"), n: q("n"), ref: q("ref"), origem: q("origem") };
  return c.html(paginaNovaReserva(ativos, papel(c), sugestao));
});

app.post("/admin/reservas", async (c) => {
  const bloqueio = await bloqueioReservas(c);
  if (bloqueio) return bloqueio;
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
    `INSERT INTO reservas (alojamento_id, token, ref_booking, nome_titular, checkin, checkout, n_hospedes, valor_total_cents, comissao_cents, origem, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(alojamento.id, gerarToken(), b.ref_booking?.trim() || null, b.nome_titular.trim(), checkin, checkout, n,
      cents(b.valor_total) ?? 0, cents(b.comissao) ?? 0, origemValida(b.origem), new Date().toISOString())
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
  const cfgFaturacao = papel(c) === "gestor" ? await lerConfigFaturacao(c.env.DB) : null;
  return c.html(paginaReserva(rc, alojamento, link, pendentes, agora, papel(c), {
    programa: cfgFaturacao?.programa ?? null,
    teste: cfgFaturacao?.programa === "vendus" && cfgFaturacao.teste,
    erro: c.req.query("erro_fatura")?.slice(0, 400) ?? null,
    aviso: c.req.query("aviso_fatura")?.slice(0, 400) ?? null,
    declaracaoTmt: await c.env.DB.prepare("SELECT * FROM declaracoes_tmt_alojamento WHERE alojamento_id = ? AND mes = ?")
      .bind(alojamento.id, rc.reserva.checkin.slice(0, 7))
      .first<DeclaracaoTmt>(),
  }));
});

app.post("/admin/reservas/:id/valores", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  await c.env.DB.prepare("UPDATE reservas SET valor_total_cents = ?, comissao_cents = ?, tmt_cobrada_cents = ? WHERE id = ?")
    .bind(cents(b.valor_total) ?? 0, cents(b.comissao) ?? 0, cents(b.tmt_cobrada), Number(c.req.param("id")))
    .run();
  // A plataforma só se muda nas reservas que não vêm de um calendário importado.
  if (b.origem) {
    await c.env.DB.prepare("UPDATE reservas SET origem = ? WHERE id = ? AND uid_externo IS NULL").bind(origemValida(b.origem), Number(c.req.param("id"))).run();
  }
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

app.post("/admin/reservas/:id/siba/anular", async (c) => {
  await c.env.DB.prepare("UPDATE reservas SET siba_submetido_em = NULL WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}#siba`);
});

// Só desliga a fatura da reserva no bookgest; uma fatura emitida num programa de faturação continua lá (anula-se nesse programa).
app.post("/admin/reservas/:id/fatura/anular", async (c) => {
  await c.env.DB.prepare(
    "UPDATE reservas SET fatura_numero = NULL, fatura_emitida_em = NULL, fatura_programa = NULL, fatura_externa_id = NULL, fatura_pdf = NULL WHERE id = ?",
  ).bind(Number(c.req.param("id"))).run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}#fatura`);
});

app.post("/admin/reservas/:id/siba", async (c) => {
  await c.env.DB.prepare("UPDATE reservas SET siba_submetido_em = ? WHERE id = ?")
    .bind(new Date().toISOString(), Number(c.req.param("id")))
    .run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

// Emite a fatura-recibo no programa de faturação ligado nas definições.
app.post("/admin/reservas/:id/fatura/emitir", async (c) => {
  const id = Number(c.req.param("id"));
  const voltar = (q: Record<string, string> = {}) => c.redirect(`/admin/reservas/${id}${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ""}#fatura`);
  const [rc, cfg] = await Promise.all([obterReserva(c.env.DB, id), lerConfigFaturacao(c.env.DB)]);
  if (!rc) return c.notFound();
  const { reserva: r, hospedes, faturacao: f } = rc;
  if (r.fatura_emitida_em) return voltar();
  if (!cfg) return voltar({ erro_fatura: "não há programa de faturação ligado (Definições → Faturação)." });
  if (!f) return voltar({ erro_fatura: "faltam os dados de faturação do hóspede." });
  if (!r.valor_total_cents) return voltar({ erro_fatura: "indique primeiro o valor pago pelo hóspede." });
  const a = (await obterAlojamento(c.env.DB, r.alojamento_id))!;
  const regras = regrasTmt(a);
  const tmt = cobraTmt(regras) ? calcularTmt(r.checkin, r.checkout, hospedes, regras).valorCents : 0;
  const dados = { fatura: faturaPortal(r, a, f, tmt), reservaId: r.id, regime: a.regime_iva, email: f.email, hoje: hojeLisboa(new Date()) };
  try {
    const { emitida, config } = await emitir(cfg, dados, {
      idExistente: r.fatura_programa === cfg.programa ? r.fatura_externa_id : null,
      guardarId: async (externo) => {
        await c.env.DB.prepare("UPDATE reservas SET fatura_programa = ?, fatura_externa_id = ? WHERE id = ?").bind(cfg.programa, externo, id).run();
      },
    });
    if (config !== cfg) await gravarConfigFaturacao(c.env.DB, config);
    const teste = cfg.programa === "vendus" && cfg.teste;
    if (teste || !emitida.numero) {
      // Rascunho (InvoiceXpress) ou documento de teste (Vendus): a reserva continua por faturar.
      await c.env.DB.prepare("UPDATE reservas SET fatura_programa = ?, fatura_externa_id = ?, fatura_pdf = ? WHERE id = ?")
        .bind(cfg.programa, teste ? null : emitida.idExterno, emitida.pdf ?? null, id).run();
      return voltar({
        aviso_fatura: teste
          ? `Fatura de teste ${emitida.numero ?? ""} criada no Vendus (sem valor fiscal). Desligue o modo de teste nas definições para emitir a sério.`
          : "Fatura criada em rascunho no InvoiceXpress. Confirme-a e finalize-a lá; depois registe o número aqui.",
      });
    }
    await c.env.DB.prepare(
      "UPDATE reservas SET fatura_programa = ?, fatura_externa_id = ?, fatura_pdf = ?, fatura_numero = ?, fatura_emitida_em = ? WHERE id = ?",
    ).bind(cfg.programa, emitida.idExterno, emitida.pdf ?? null, emitida.numero, new Date().toISOString(), id).run();
    return voltar();
  } catch (e) {
    return voltar({ erro_fatura: e instanceof Error ? e.message : String(e) });
  }
});

// Definições → Faturação
app.get("/admin/definicoes/faturacao", async (c) =>
  c.html(paginaFaturacao(await lerConfigFaturacao(c.env.DB), { ok: c.req.query("guardado") === "1" ? "Guardado." : undefined })));

app.post("/admin/definicoes/faturacao", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const atual = await lerConfigFaturacao(c.env.DB);
  const cfg = lerFormularioFaturacao(b, atual);
  if (typeof cfg === "string") return c.html(paginaFaturacao(atual, { erro: cfg, form: b }), 400);
  await gravarConfigFaturacao(c.env.DB, cfg);
  return c.redirect("/admin/definicoes/faturacao?guardado=1");
});

app.post("/admin/definicoes/faturacao/testar", async (c) => {
  const cfg = await lerConfigFaturacao(c.env.DB);
  if (!cfg) return c.redirect("/admin/definicoes/faturacao");
  try {
    const nova = await testarLigacao(cfg);
    if (nova !== cfg) await gravarConfigFaturacao(c.env.DB, nova);
    return c.html(paginaFaturacao(nova, { ok: `Ligação ao ${NOMES_PROGRAMA[cfg.programa]} a funcionar.` }));
  } catch (e) {
    return c.html(paginaFaturacao(cfg, { erro: `A ligação falhou: ${e instanceof Error ? e.message : String(e)}` }), 502);
  }
});

// Ajudante: os campos da fatura-recibo prontos a copiar para o Portal das Finanças.
app.get("/admin/reservas/:id/fatura/portal", async (c) => {
  const rc = await obterReserva(c.env.DB, Number(c.req.param("id")));
  if (!rc) return c.notFound();
  const { reserva: r, hospedes, faturacao: f } = rc;
  const a = (await obterAlojamento(c.env.DB, r.alojamento_id))!;
  const regras = regrasTmt(a);
  const falta = !f
    ? "O hóspede ainda não preencheu os dados de faturação (no formulário de check-in)."
    : !r.valor_total_cents
      ? "Indique primeiro o valor pago pelo hóspede, em Valores, na página da reserva."
      : null;
  const tmt = cobraTmt(regras) ? calcularTmt(r.checkin, r.checkout, hospedes, regras).valorCents : 0;
  return c.html(paginaFaturaPortal(r, f && !falta ? faturaPortal(r, a, f, tmt) : null, falta));
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
  await c.env.DB.prepare("UPDATE reservas SET cancelada = 1, desaparecida_em = NULL WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

// Dados que o calendário não traz (nome e n.º de hóspedes). Também para a equipa.
app.post("/admin/reservas/:id/dados", async (c) => {
  const b = await c.req.parseBody<Record<string, string>>();
  const n = Number(b.n_hospedes);
  if (!b.nome_titular?.trim() || !(n >= 1 && n <= 50)) return c.text("Indique o nome do titular e o n.º de hóspedes.", 400);
  await c.env.DB.prepare("UPDATE reservas SET nome_titular = ?, n_hospedes = ?, ref_booking = ?, incompleta = 0 WHERE id = ?")
    .bind(b.nome_titular.trim(), n, b.ref_booking?.trim() || null, Number(c.req.param("id")))
    .run();
  return c.redirect(`/admin/reservas/${c.req.param("id")}`);
});

// Datas bloqueadas no Booking que não são uma reserva: deixam de aparecer (e não voltam a ser importadas).
app.post("/admin/reservas/:id/ignorar", async (c) => {
  await c.env.DB.prepare("UPDATE reservas SET ignorada = 1, desaparecida_em = NULL WHERE id = ? AND uid_externo IS NOT NULL").bind(Number(c.req.param("id"))).run();
  return c.redirect("/admin");
});

// A reserva deixou de aparecer no calendário, mas continua válida.
app.post("/admin/reservas/:id/manter", async (c) => {
  await c.env.DB.prepare("UPDATE reservas SET desaparecida_em = NULL WHERE id = ?").bind(Number(c.req.param("id"))).run();
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

// Anular uma marcação feita por engano (só no bookgest: nada é enviado à câmara).
// Registada antes da rota de marcar: o padrão {declarado|pago} também apanharia ".../declarado/anular".
app.post("/admin/tmt/:alojamento/:mes/:acao{declarado|pago}/anular", async (c) => {
  const coluna = c.req.param("acao") === "declarado" ? "declarado_em" : "pago_em";
  await c.env.DB.prepare(`UPDATE declaracoes_tmt_alojamento SET ${coluna} = NULL WHERE alojamento_id = ? AND mes = ?`)
    .bind(Number(c.req.param("alojamento")), c.req.param("mes"))
    .run();
  return c.redirect("/admin/tmt");
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

app.get("/admin/alojamentos", async (c) =>
  c.html(paginaAlojamentos(await listarAlojamentos(c.env.DB), { limite: await limiteAlojamentos(c.env.DB) })));

// N.º de alojamentos ativos incluídos na licença. Sem licença verificada, só o primeiro alojamento.
async function limiteAlojamentos(db: D1Database): Promise<number> {
  const { estado } = await lerLicenca(db);
  return estado ? estado.alojamentosPagos : 1;
}

// Antes de criar ou reativar um alojamento: devolve a mensagem de recusa se a licença já estiver cheia.
// Se estiver, volta a perguntar ao servidor de licenças (a assinatura pode ter sido aumentada há pouco).
async function semVagaAlojamento(c: Ctx): Promise<string | null> {
  const contar = async () => (await listarAlojamentos(c.env.DB)).filter((a) => a.ativo).length;
  const ativos = await contar();
  if (ativos < (await limiteAlojamentos(c.env.DB))) return null;
  await verificarLicenca(c.env).catch(() => undefined);
  const limite = await limiteAlojamentos(c.env.DB);
  if (ativos < limite) return null;
  return `A sua licença inclui ${limite} alojamento(s) ativo(s) e já tem ${ativos}. Para acrescentar outro, aumente o número de alojamentos da assinatura (Definições → Licença) ou arquive um alojamento.`;
}

async function recusarAlojamento(c: Ctx, erro: string) {
  const alojamentos = await listarAlojamentos(c.env.DB);
  return c.html(paginaAlojamentos(alojamentos, { limite: await limiteAlojamentos(c.env.DB), erro }), 403);
}

app.get("/admin/alojamentos/novo", async (c) => {
  const semVaga = await semVagaAlojamento(c);
  if (semVaga) return recusarAlojamento(c, semVaga);
  const primeiro = !(await listarAlojamentos(c.env.DB)).length;
  return c.html(paginaAlojamento(null, { primeiro, codigoSugerido: primeiro ? c.env.CODIGO_CHAVES : undefined }));
});

app.post("/admin/alojamentos", async (c) => {
  const semVaga = await semVagaAlojamento(c);
  if (semVaga) return recusarAlojamento(c, semVaga);
  const v = lerAlojamento(await c.req.parseBody<Record<string, string>>());
  if (typeof v === "string") {
    const primeiro = !(await listarAlojamentos(c.env.DB)).length;
    return c.html(paginaAlojamento(null, { primeiro, erro: v }), 400);
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO alojamentos (nome, morada, registo_al, codigo_cofre, hora_checkin, horas_antes_codigo, horas_prazo_hospedes,
       concelho, tmt_valor_cents, tmt_max_noites, tmt_idade_minima, tmt_dia_declaracao, tmt_dia_pagamento, tmt_portal, regime_iva,
       tmt_valor_baixa_cents, tmt_alta_inicio, tmt_alta_fim, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(...valoresAlojamento(v), new Date().toISOString())
    .run();
  return c.redirect(`/admin/alojamentos/${res.meta.last_row_id}?guardado=1`);
});

app.get("/admin/alojamentos/:id", async (c) => {
  const a = await obterAlojamento(c.env.DB, Number(c.req.param("id")));
  if (!a) return c.notFound();
  return c.html(paginaAlojamento(a, {
    guardado: c.req.query("guardado") === "1",
    calendarios: await listarCalendarios(c.env.DB, a.id),
    reservas: await contarReservasAlojamento(c.env.DB, a.id),
  }));
});

// Reservas a sério (as datas marcadas como "não é uma reserva" não contam).
async function contarReservasAlojamento(db: D1Database, id: number): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM reservas WHERE alojamento_id = ? AND ignorada = 0").bind(id).first<number>("n")) ?? 0;
}

// Só um alojamento sem reservas pode ser apagado (ex.: criado por engano ou para testar); os outros arquivam-se.
app.post("/admin/alojamentos/:id/apagar", async (c) => {
  const id = Number(c.req.param("id"));
  const a = await obterAlojamento(c.env.DB, id);
  if (!a) return c.notFound();
  if (await contarReservasAlojamento(c.env.DB, id)) {
    return c.html(paginaAlojamento(a, {
      erro: "Este alojamento tem reservas: não pode ser apagado. Pode arquivá-lo.",
      calendarios: await listarCalendarios(c.env.DB, id),
      reservas: await contarReservasAlojamento(c.env.DB, id),
    }), 400);
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE emails_recebidos SET reserva_id = NULL WHERE reserva_id IN (SELECT id FROM reservas WHERE alojamento_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM hospedes WHERE reserva_id IN (SELECT id FROM reservas WHERE alojamento_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM faturacao WHERE reserva_id IN (SELECT id FROM reservas WHERE alojamento_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM reservas WHERE alojamento_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM calendarios WHERE alojamento_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM passos WHERE alojamento_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM declaracoes_tmt_alojamento WHERE alojamento_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM alojamentos WHERE id = ?").bind(id),
  ]);
  return c.redirect("/admin/alojamentos");
});

// ---------- Calendários (importação de reservas) ----------

const PLATAFORMAS: Plataforma[] = ["booking", "airbnb", "outra"];

app.post("/admin/alojamentos/:id/calendarios", async (c) => {
  const a = await obterAlojamento(c.env.DB, Number(c.req.param("id")));
  if (!a) return c.notFound();
  const b = await c.req.parseBody<Record<string, string>>();
  const url = b.url?.trim().replace(/^webcal:\/\//i, "https://");
  const plataforma = PLATAFORMAS.includes(b.plataforma as Plataforma) ? (b.plataforma as Plataforma) : null;
  if (!plataforma || !url || !/^https:\/\/\S+$/.test(url)) {
    return c.html(paginaAlojamento(a, { erro: "Escolha a plataforma e cole o link do calendário (começa por https://).", calendarios: await listarCalendarios(c.env.DB, a.id) }), 400);
  }
  const res = await c.env.DB.prepare("INSERT INTO calendarios (alojamento_id, plataforma, url, criado_em) VALUES (?, ?, ?, ?)")
    .bind(a.id, plataforma, url, new Date().toISOString())
    .run();
  const cal = (await listarCalendarios(c.env.DB, a.id)).find((x) => x.id === res.meta.last_row_id)!;
  await sincronizarCalendario(c.env.DB, cal);
  return c.redirect(`/admin/alojamentos/${a.id}#calendarios`);
});

app.post("/admin/alojamentos/:id/calendarios/sincronizar", async (c) => {
  const id = Number(c.req.param("id"));
  for (const cal of await listarCalendarios(c.env.DB, id)) await sincronizarCalendario(c.env.DB, cal);
  return c.redirect(`/admin/alojamentos/${id}#calendarios`);
});

app.post("/admin/alojamentos/:id/calendarios/:cal/apagar", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM calendarios WHERE id = ? AND alojamento_id = ?").bind(Number(c.req.param("cal")), id).run();
  return c.redirect(`/admin/alojamentos/${id}#calendarios`);
});

app.post("/admin/alojamentos/:id", async (c) => {
  const a = await obterAlojamento(c.env.DB, Number(c.req.param("id")));
  if (!a) return c.notFound();
  const v = lerAlojamento(await c.req.parseBody<Record<string, string>>());
  if (typeof v === "string") return c.html(paginaAlojamento(a, { erro: v }), 400);
  await c.env.DB.prepare(
    `UPDATE alojamentos SET nome = ?, morada = ?, registo_al = ?, codigo_cofre = ?, hora_checkin = ?, horas_antes_codigo = ?,
       horas_prazo_hospedes = ?, concelho = ?, tmt_valor_cents = ?, tmt_max_noites = ?, tmt_idade_minima = ?,
       tmt_dia_declaracao = ?, tmt_dia_pagamento = ?, tmt_portal = ?, regime_iva = ?,
       tmt_valor_baixa_cents = ?, tmt_alta_inicio = ?, tmt_alta_fim = ?
     WHERE id = ?`,
  )
    .bind(...valoresAlojamento(v), a.id)
    .run();
  return c.redirect(`/admin/alojamentos/${a.id}?guardado=1`);
});

// Arquivar em vez de apagar: as reservas e declarações têm de ser conservadas.
app.post("/admin/alojamentos/:id/:acao{arquivar|reativar}", async (c) => {
  if (c.req.param("acao") === "reativar") {
    const semVaga = await semVagaAlojamento(c);
    if (semVaga) return recusarAlojamento(c, semVaga);
  }
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
    paginaDefinicoes({
      ...opcoes,
      licenca: {
        ...licenca,
        aviso: avisoLicenca(licenca.chave, licenca.estado, ativos, new Date()),
        linkAssinar: licenca.chave ? `${c.env.URL_LICENCAS || URL_LICENCAS_PREDEFINIDO}/assinar?chave=${encodeURIComponent(licenca.chave)}` : null,
      },
      versao: { atual: VERSAO, automatica: !!c.env.CF_API_TOKEN, ultima: licenca.atualizacao },
    }),
    opcoes.erro ? 400 : 200,
  );
}

app.get("/admin/definicoes", (c) => mostrarDefinicoes(c));

// Verifica a licença e, havendo versão nova, atualiza já (em vez de esperar pelo dia seguinte).
app.post("/admin/definicoes/atualizar", async (c) => {
  await verificarLicenca(c.env);
  return c.redirect("/admin/definicoes");
});

// ---------- A minha conta (todos os utilizadores) ----------

async function mostrarConta(c: Ctx, opcoes: { erro?: string; ok?: string } = {}) {
  const u = c.get("utilizador");
  const codigos = u.papel === "gestor" ? await codigosDisponiveis(c.env.DB, u.id) : null;
  return c.html(paginaConta(u, codigos, opcoes), opcoes.erro ? 400 : 200);
}

app.get("/admin/conta", (c) => {
  const recuperado = c.req.query("recuperado");
  const ok = recuperado === "1"
    ? "Palavra-passe redefinida. Esse código de recuperação já não serve: gere novos se lhe restarem poucos."
    : recuperado === "email" ? "Palavra-passe redefinida."
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

async function lerLicenca(db: D1Database) {
  const [chave, estado, erro, problemaDesde, atualizacao] = await Promise.all([
    lerDefinicao(db, "licenca_chave"),
    lerDefinicao(db, "licenca_estado"),
    lerDefinicao(db, "licenca_erro"),
    lerDefinicao(db, "licenca_problema_desde"),
    lerDefinicao(db, "atualizacao"),
  ]);
  return {
    chave,
    estado: estado ? (JSON.parse(estado) as EstadoGuardado) : null,
    erro,
    problemaDesde,
    atualizacao: atualizacao ? (JSON.parse(atualizacao) as EstadoAtualizacao) : null,
  };
}

export interface EstadoAtualizacao {
  em: string;
  versao: string; // versão aplicada ou tentada
  erro?: string;
}

// Corre uma vez por dia (cron) e ao guardar a chave. Sem resposta, mantém o último estado conhecido.
// Emails de reserva reencaminhados: só quando a licença tem endereço (a plataforma tem o serviço ligado).
async function receberEmailsReservas(env: Env): Promise<void> {
  const { chave, estado } = await lerLicenca(env.DB);
  if (!chave || !estado?.emailReservas) return;
  try {
    await receberEmails(env.DB, chave, env.URL_LICENCAS || URL_LICENCAS_PREDEFINIDO, env.PLATAFORMA);
    await env.DB.prepare("DELETE FROM definicoes WHERE chave = 'emails_erro'").run();
  } catch (e) {
    console.error("Receção dos emails de reserva falhou", e);
    await gravarDefinicao(env.DB, "emails_erro", String(e instanceof Error ? e.message : e).slice(0, 200));
  }
}

app.get("/admin/emails", async (c) => {
  const { estado } = await lerLicenca(c.env.DB);
  return c.html(paginaEmails({
    endereco: estado?.emailReservas ?? null,
    privado: !!c.env.CF_API_TOKEN,
    emails: await listarEmails(c.env.DB),
    erro: await lerDefinicao(c.env.DB, "emails_erro"),
    verificado: c.req.query("verificado") === "1",
  }));
});

app.post("/admin/emails/verificar", async (c) => {
  await verificarLicenca(c.env); // obtém o endereço, se ainda não o tiver
  await receberEmailsReservas(c.env);
  return c.redirect("/admin/emails?verificado=1");
});

app.post("/admin/emails/:id/arquivar", async (c) => {
  await c.env.DB.prepare("UPDATE emails_recebidos SET estado = 'arquivado' WHERE id = ? AND estado IN ('por_associar', 'confirmacao')")
    .bind(Number(c.req.param("id")))
    .run();
  return c.redirect("/admin/emails");
});

async function verificarLicenca(env: Env): Promise<void> {
  const chave = await lerDefinicao(env.DB, "licenca_chave");
  if (!chave) return;
  const alojamentos = (await env.DB.prepare("SELECT COUNT(*) AS n FROM alojamentos WHERE ativo = 1").first<number>("n")) ?? 0;
  try {
    const r = await consultarLicenca(env.URL_LICENCAS || URL_LICENCAS_PREDEFINIDO, { chave, versao: VERSAO, alojamentos }, env.PLATAFORMA);
    const guardado: EstadoGuardado = {
      estado: r.estado,
      alojamentosPagos: r.alojamentosPagos,
      fimTeste: r.fimTeste ?? null,
      emailReservas: r.emailReservas ?? null,
      verificadoEm: new Date().toISOString(),
    };
    await gravarDefinicao(env.DB, "licenca_estado", JSON.stringify(guardado));
    await env.DB.prepare("DELETE FROM definicoes WHERE chave = 'licenca_erro'").run();
    // Conta desde quando há um problema (licença ou alojamentos a mais), para o bloqueio de novas reservas.
    if (haProblema(r, alojamentos)) await definicaoInicial(env.DB, "licenca_problema_desde", new Date().toISOString());
    else await env.DB.prepare("DELETE FROM definicoes WHERE chave = 'licenca_problema_desde'").run();
    if (r.versaoAtual && compararVersoes(r.versaoAtual, VERSAO) > 0) await atualizarInstalacao(env, r.versaoAtual);
  } catch (e) {
    console.error("Verificação da licença falhou", e);
    await gravarDefinicao(env.DB, "licenca_erro", String(e).slice(0, 300));
  }
}

async function atualizarInstalacao(env: Env, alvo: string): Promise<void> {
  if (!env.CF_API_TOKEN || !env.CF_CONTA || !env.CF_SCRIPT) return; // instalação publicada pelo GitHub (a do fornecedor)
  const estado: EstadoAtualizacao = { em: new Date().toISOString(), versao: alvo };
  try {
    await atualizar(env.DB, {
      token: env.CF_API_TOKEN,
      conta: env.CF_CONTA,
      script: env.CF_SCRIPT,
      urlPlataforma: env.URL_LICENCAS || URL_LICENCAS_PREDEFINIDO,
      servico: env.PLATAFORMA,
      apiCloudflare: env.CF_API_URL || undefined,
    }, alvo, VERSAO);
  } catch (e) {
    console.error("Atualização falhou", e);
    estado.erro = String(e instanceof Error ? e.message : e).slice(0, 300);
  }
  await gravarDefinicao(env.DB, "atualizacao", JSON.stringify(estado));
}

// Página mostrada em vez do formulário de reserva quando o período de tolerância da licença terminou.
async function bloqueioReservas(c: Ctx): Promise<Response | null> {
  const desde = await lerDefinicao(c.env.DB, "licenca_problema_desde");
  if (!reservasBloqueadas(desde, new Date())) return null;
  return c.html(paginaReservasBloqueadas(papel(c)), 403);
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
  const regimeIva = b.regime_iva ?? "6";
  if (!regimeIvaValido(regimeIva)) return "Escolha o regime de IVA.";
  // Épocas: só com valor da época baixa e os dois meses da época alta.
  const baixa = b.tmt_valor_baixa?.trim() ? cents(b.tmt_valor_baixa) : null;
  const altaDe = b.tmt_alta_inicio?.trim() ? inteiro("tmt_alta_inicio", 1, 12) : null;
  const altaAte = b.tmt_alta_fim?.trim() ? inteiro("tmt_alta_fim", 1, 12) : null;
  const comEpocas = baixa != null || altaDe != null || altaAte != null;
  if (comEpocas && (baixa == null || baixa < 0 || altaDe == null || altaAte == null)) {
    return "Época alta da taxa turística: indique o valor da época baixa e os meses de início e fim (ou deixe os três vazios).";
  }
  return {
    nome, morada: texto("morada"), registo_al: texto("registo_al"), codigo_cofre: codigo, hora_checkin: hora,
    horas_antes_codigo: horasAntes, horas_prazo_hospedes: horasPrazo, concelho: concelho ?? "", tmt_valor_cents: valor,
    tmt_max_noites: maxNoites, tmt_idade_minima: idade, tmt_dia_declaracao: diaDecl, tmt_dia_pagamento: diaPag, tmt_portal: portal,
    regime_iva: regimeIva,
    tmt_valor_baixa_cents: comEpocas ? baixa : null,
    tmt_alta_inicio: comEpocas ? altaDe : null,
    tmt_alta_fim: comEpocas ? altaAte : null,
  };
}

// Mesma ordem das colunas no INSERT e no UPDATE de alojamentos.
function valoresAlojamento(v: Exclude<ReturnType<typeof lerAlojamento>, string>) {
  return [v.nome, v.morada, v.registo_al, v.codigo_cofre, v.hora_checkin, v.horas_antes_codigo, v.horas_prazo_hospedes,
    v.concelho, v.tmt_valor_cents, v.tmt_max_noites, v.tmt_idade_minima, v.tmt_dia_declaracao, v.tmt_dia_pagamento, v.tmt_portal, v.regime_iva,
    v.tmt_valor_baixa_cents, v.tmt_alta_inicio, v.tmt_alta_fim];
}

function lerHospede(b: Record<string, string>, p: string) {
  const nome = b[`${p}nome`]?.trim();
  const nasc = data(b[`${p}data_nascimento`]);
  const nacionalidade = pais(b[`${p}nacionalidade`]);
  if (!nome || !nasc || nasc >= hojeLisboa()) return "Nome e data de nascimento inválidos. / Invalid name or date of birth.";
  if (!nacionalidade) return "Escolha a nacionalidade. / Choose your nationality.";
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
  return p && paisValido(p) ? p : null;
}

function cents(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default {
  fetch: app.fetch,
  // De hora a hora: calendários; a licença (e a atualização automática) uma vez por dia.
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await prepararInstalacao(env.DB, env.CODIGO_CHAVES);
      await sincronizarTodos(env.DB);
      await receberEmailsReservas(env);
      const estado = await lerDefinicao(env.DB, "licenca_estado");
      const ultima = estado ? Date.parse((JSON.parse(estado) as EstadoGuardado).verificadoEm) : 0;
      if (Date.now() - ultima > 20 * 3_600_000 || (await lerDefinicao(env.DB, "licenca_erro"))) await verificarLicenca(env);
    })());
  },
} satisfies ExportedHandler<Env>;
