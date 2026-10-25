// Ecrãs principais do painel: Hoje, Calendário, Reservas e "Mais" (telemóvel).

import { html, raw } from "hono/html";
import type { ReservaCompleta } from "../db";
import { diferencaDias, somarDias } from "../lib/datas";
import type { Barra, NumerosHoje } from "../lib/painel";
import { type Pendente, euros } from "../lib/regras";
import type { Alojamento, Reserva } from "../lib/tipos";
import type { Papel } from "../lib/utilizadores";
import { ITENS_MAIS, type NomeIcone, dataExtenso, dataPt, diaSemana, icone, mesCurto, pagina } from "./layout";

export type Origem = "booking" | "airbnb" | "direta" | "outra";

// "manual" = reserva direta (criada no bookgest sem plataforma).
export function origemReserva(r: Pick<Reserva, "origem" | "ref_booking">): Origem {
  return r.origem === "booking" || r.origem === "airbnb" || r.origem === "outra" ? r.origem : "direta";
}

const NOMES_ORIGEM: Record<Origem, string> = { booking: "Booking", airbnb: "Airbnb", direta: "Direta", outra: "Outra" };

export const chipOrigem = (r: Pick<Reserva, "origem" | "ref_booking">) => {
  const o = origemReserva(r);
  return html`<span class="chip ${o}">${NOMES_ORIGEM[o]}</span>`;
};

export function classePrazo(prazo: string | null, hoje: string): "atrasado" | "hoje" | "" | "info" {
  if (!prazo) return "info";
  if (prazo < hoje) return "atrasado";
  if (prazo === hoje) return "hoje";
  return "";
}

function chipPrazo(prazo: string | null, hoje: string) {
  const c = classePrazo(prazo, hoje);
  if (c === "info") return "";
  if (c === "atrasado") return html`<span class="chip atrasado">Atrasado</span>`;
  if (c === "hoje") return html`<span class="chip hoje">Hoje</span>`;
  return html`<span class="chip">${prazo!.slice(8, 10)}/${prazo!.slice(5, 7)}</span>`;
}

const ICONE_PENDENTE: Record<Pendente["tipo"], NomeIcone> = {
  email: "emails",
  completar: "reservas",
  desaparecida: "calendario",
  formulario: "conta",
  dados_hospedes: "conta",
  siba: "escudo",
  fatura: "tmt",
  tmt_divergente: "moeda",
  tmt_declarar: "moeda",
  tmt_pagar: "moeda",
};

// Os primeiros ficam sempre visíveis; os restantes num bloco que se abre.
const PENDENTES_VISIVEIS = 5;

export function linkPendente(p: Pendente): string {
  return p.link ?? (p.reservaId ? `/admin/reservas/${p.reservaId}` : "/admin/tmt");
}

function itemPendente(p: Pendente, hoje: string, nomeAlojamento: string | null) {
  const c = classePrazo(p.prazo, hoje);
  return html`<a class="item" href="${linkPendente(p)}">
    <span class="simbolo ${c === "info" ? "" : c}">${icone(ICONE_PENDENTE[p.tipo], 18)}</span>
    <span class="texto"><strong>${p.descricao}</strong>${nomeAlojamento ? html`<span>${nomeAlojamento}</span>` : ""}</span>
    ${chipPrazo(p.prazo, hoje)}</a>`;
}

const noites = (r: Pick<Reserva, "checkin" | "checkout">) => {
  const n = diferencaDias(r.checkin, r.checkout);
  return `${n} ${n === 1 ? "noite" : "noites"}`;
};

function nomeReserva(r: Reserva): string {
  return r.incompleta ? "Reserva por completar" : r.nome_titular;
}

// Linha de uma reserva: dia de entrada, nome, alojamento e origem.
function itemReserva(r: Reserva, alojamento: string | null, hoje: string) {
  const estado = r.cancelada
    ? html`<span class="chip atrasado">Cancelada</span>`
    : r.checkin === hoje
      ? html`<span class="chip hoje">Chega hoje</span>`
      : r.checkin < hoje && r.checkout > hoje
        ? html`<span class="chip ok">Em casa</span>`
        : r.checkout === hoje
          ? html`<span class="chip hoje">Sai hoje</span>`
          : chipOrigem(r);
  return html`<a class="item" href="/admin/reservas/${r.id}">
    <span class="dia"><strong>${r.checkin.slice(8, 10)}</strong><span>${mesCurto(r.checkin)}</span></span>
    <span class="texto"><strong>${nomeReserva(r)}</strong>
      <span>${[alojamento, noites(r), `${r.n_hospedes} hósp.`].filter(Boolean).join(" · ")}</span></span>
    ${estado}</a>`;
}

const menuDoPapel = (papel: Papel) => (papel === "gestor" ? true : ("equipa" as const));

// Botões para escolher o alojamento (só com mais de um).
function filtrosAlojamento(alojamentos: Alojamento[], atual: number | null, base: string, extra = "") {
  if (alojamentos.length < 2) return "";
  const sep = extra ? `&${extra}` : "";
  return html`<nav class="filtros" aria-label="Alojamento">
    <a href="${base}${extra ? `?${extra}` : ""}"${atual == null ? raw(' aria-current="true"') : ""}>Todos</a>
    ${alojamentos.map((a) => html`<a href="${base}?alojamento=${a.id}${sep}"${atual === a.id ? raw(' aria-current="true"') : ""}>${a.nome}</a>`)}
  </nav>`;
}

// ---------- Hoje ----------

export function paginaHoje(o: {
  hoje: string;
  pendentes: Pendente[];
  reservas: ReservaCompleta[];
  alojamentos: Alojamento[];
  filtro: number | null;
  numeros: NumerosHoje;
  aviso: string | null;
  papel: Papel;
}) {
  const nomes = new Map(o.alojamentos.map((a) => [a.id, a.nome]));
  const nome = (id: number | undefined) => (o.alojamentos.length > 1 && id != null ? nomes.get(id) ?? null : null);
  const visiveis = o.reservas.map((rc) => rc.reserva).filter((r) => !r.cancelada);
  const movimentos = visiveis
    .filter((r) => r.checkin >= o.hoje || r.checkout === o.hoje)
    .sort((a, b) => ((a.checkout === o.hoje ? a.checkout : a.checkin) < (b.checkout === o.hoje ? b.checkout : b.checkin) ? -1 : 1))
    .slice(0, 8);
  const n = o.numeros;
  const mes = dataExtenso(o.hoje).split(" de ")[1];

  return pagina("Hoje", html`
    ${o.aviso ? html`<p class="aviso"><a href="/admin/definicoes">${o.aviso}</a></p>` : ""}
    <div class="cabecalho">
      <div><p class="sobre">${dataExtenso(o.hoje)}</p><h1>Hoje</h1></div>
      <div class="botoes so-computador"><a class="botao" href="/admin/reservas/nova">${icone("mais_reserva", 18)}Nova reserva</a></div>
    </div>
    ${filtrosAlojamento(o.alojamentos, o.filtro, "/admin")}

    <div class="numeros">
      <div class="numero"><span>Entradas hoje</span><strong>${n.entradas}</strong></div>
      <div class="numero"><span>Saídas hoje</span><strong>${n.saidas}</strong></div>
      <div class="numero"><span>Ocupação em ${mes}</span><strong>${n.ocupacao == null ? "—" : `${n.ocupacao}%`}</strong></div>
      ${o.papel === "gestor"
        ? html`<div class="numero"><span>Receita em ${mes}</span><strong>${euros(n.receitaCents)}</strong><small>sem comissões</small></div>`
        : html`<div class="numero"><span>Hóspedes em casa</span><strong>${n.hospedados}</strong><small>reservas a decorrer</small></div>`}
    </div>

    <div class="colunas">
      <section>
        <div class="titulo-seccao"><h2>A tratar</h2>${o.pendentes.length ? html`<span>${o.pendentes.length}</span>` : ""}</div>
        <div class="grupo">${o.pendentes.length
          ? html`${o.pendentes.slice(0, PENDENTES_VISIVEIS).map((p) => itemPendente(p, o.hoje, nome(p.alojamentoId)))}
            ${o.pendentes.length > PENDENTES_VISIVEIS
              ? html`<details class="mais-itens"><summary>Ver mais ${o.pendentes.length - PENDENTES_VISIVEIS}</summary>
                  ${o.pendentes.slice(PENDENTES_VISIVEIS).map((p) => itemPendente(p, o.hoje, nome(p.alojamentoId)))}</details>`
              : ""}`
          : html`<div class="item"><span class="simbolo ok">${icone("visto", 18)}</span><span class="texto"><strong>Nada pendente</strong></span></div>`}</div>
      </section>
      <section>
        <div class="titulo-seccao"><h2>Entradas e saídas</h2><a href="/admin/calendario">Calendário</a></div>
        <div class="grupo">${movimentos.length
          ? movimentos.map((r) => itemReserva(r, nome(r.alojamento_id), o.hoje))
          : html`<p class="vazio">Sem reservas futuras.</p>`}</div>
        <p><a href="/admin/reservas">Todas as reservas</a></p>
      </section>
    </div>
  `, { admin: menuDoPapel(o.papel), seccao: "hoje", botaoNovo: true });
}

// ---------- Calendário ----------

export interface LinhaCalendario {
  alojamento: Alojamento;
  barras: Barra<Reserva>[];
}

export function paginaCalendario(o: { inicio: string; dias: number; hoje: string; linhas: LinhaCalendario[]; papel: Papel }) {
  const fim = somarDias(o.inicio, o.dias - 1);
  const dias = Array.from({ length: o.dias }, (_, i) => somarDias(o.inicio, i));
  const intervalo = `${Number(o.inicio.slice(8, 10))} ${mesCurto(o.inicio)} – ${Number(fim.slice(8, 10))} ${mesCurto(fim)} ${fim.slice(0, 4)}`;
  const passo = o.dias === 28 ? 14 : 7;
  const extra = o.dias === 28 ? "&dias=28" : "";
  const pct = (x: number) => `${((100 * x) / o.dias).toFixed(3)}%`;
  const barra = (b: Barra<Reserva>) => {
    const r = b.reserva;
    const classes = [origemReserva(r), r.incompleta ? "incompleta" : "", b.cortadaInicio ? "cortada-inicio" : "", b.cortadaFim ? "cortada-fim" : ""].filter(Boolean).join(" ");
    return html`<a class="cal-barra ${classes}" href="/admin/reservas/${r.id}" title="${nomeReserva(r)} · ${dataPt(r.checkin)} → ${dataPt(r.checkout)}"
      style="left: calc(${pct(b.inicio)} + 1px); width: calc(${pct(b.dias)} - 2px); top: ${b.linha * 38}px">${nomeReserva(r)}</a>`;
  };
  const semana = (d: string) => diaSemana(d).slice(0, 1).toUpperCase();
  const fds = (d: string) => ["sáb", "dom"].includes(diaSemana(d));

  return pagina("Calendário", html`
    <div class="cabecalho">
      <div><p class="sobre">${intervalo}</p><h1>Calendário</h1></div>
      <div class="navegar">
        <a href="/admin/calendario?inicio=${somarDias(o.inicio, -passo)}${extra}" aria-label="Anterior">${icone("voltar", 18)}</a>
        <a href="/admin/calendario${o.dias === 28 ? "?dias=28" : ""}">Hoje</a>
        <a href="/admin/calendario?inicio=${somarDias(o.inicio, passo)}${extra}" aria-label="Seguinte">${icone("seguinte", 18)}</a>
        <a class="so-computador" href="/admin/calendario?inicio=${o.inicio}${o.dias === 28 ? "" : "&dias=28"}">${o.dias === 28 ? "2 semanas" : "4 semanas"}</a>
      </div>
    </div>
    ${o.linhas.length
      ? html`<div class="calendario" style="--dias: ${o.dias}">
          <div class="cal-dias" aria-hidden="true">${dias.map((d) => html`<span class="${d === o.hoje ? "hoje" : fds(d) ? "fds" : ""}">${semana(d)}<b>${Number(d.slice(8, 10))}</b></span>`)}</div>
          ${o.linhas.map(({ alojamento: a, barras }) => html`<div class="cal-alojamento">
            <h3>${a.nome}</h3>
            <div class="cal-pista" style="--linhas: ${Math.max(1, ...barras.map((b) => b.linha + 1))}">${barras.map(barra)}</div>
          </div>`)}
          <div class="legenda"><span><i class="booking"></i>Booking</span><span><i class="airbnb"></i>Airbnb</span><span><i></i>Direta</span><span><i class="outra"></i>Outra</span></div>
        </div>`
      : html`<p class="vazio">Sem alojamentos ativos.</p>`}
    <p class="nota">As reservas do Booking e do Airbnb entram sozinhas quando o calendário (iCal) está ligado em
      ${o.papel === "gestor" ? html`<a href="/admin/alojamentos">Alojamentos</a>` : "Alojamentos"}.</p>
  `, { admin: menuDoPapel(o.papel), seccao: "calendario", botaoNovo: true });
}

// ---------- Reservas ----------

export type VistaReservas = "proximas" | "anteriores" | "canceladas";

export function paginaReservas(o: {
  hoje: string;
  reservas: Reserva[];
  alojamentos: Alojamento[];
  filtro: number | null;
  vista: VistaReservas;
  pesquisa: string;
  papel: Papel;
}) {
  const nomes = new Map(o.alojamentos.map((a) => [a.id, a.nome]));
  const nome = (id: number) => (o.alojamentos.length > 1 ? nomes.get(id) ?? null : null);
  const q = o.pesquisa.trim().toLowerCase();
  const lista = o.reservas
    .filter((r) => o.filtro == null || r.alojamento_id === o.filtro)
    .filter((r) => !q || r.nome_titular.toLowerCase().includes(q) || (r.ref_booking ?? "").toLowerCase().includes(q))
    .filter((r) => (o.vista === "canceladas" ? r.cancelada : !r.cancelada && (o.vista === "proximas" ? r.checkout >= o.hoje : r.checkout < o.hoje)));
  if (o.vista === "proximas") lista.sort((a, b) => (a.checkin < b.checkin ? -1 : 1));
  const params = (vista: VistaReservas) =>
    [o.filtro != null ? `alojamento=${o.filtro}` : "", vista !== "proximas" ? `vista=${vista}` : "", q ? `q=${encodeURIComponent(o.pesquisa)}` : ""].filter(Boolean).join("&");
  const vistas: [VistaReservas, string][] = [["proximas", "Próximas"], ["anteriores", "Anteriores"], ["canceladas", "Canceladas"]];

  return pagina("Reservas", html`
    <div class="cabecalho">
      <h1>Reservas</h1>
      <div class="botoes so-computador"><a class="botao" href="/admin/reservas/nova">${icone("mais_reserva", 18)}Nova reserva</a></div>
    </div>
    <form method="get" action="/admin/reservas" role="search">
      ${o.filtro != null ? html`<input type="hidden" name="alojamento" value="${o.filtro}">` : ""}
      ${o.vista !== "proximas" ? html`<input type="hidden" name="vista" value="${o.vista}">` : ""}
      <input type="search" name="q" value="${o.pesquisa}" placeholder="Procurar por nome ou referência" aria-label="Procurar">
    </form>
    <nav class="filtros" aria-label="Vista" style="margin-top: 10px">
      ${vistas.map(([v, t]) => {
        const p = params(v);
        return html`<a href="/admin/reservas${p ? `?${p}` : ""}"${o.vista === v ? raw(' aria-current="true"') : ""}>${t}</a>`;
      })}
    </nav>
    ${filtrosAlojamento(o.alojamentos, o.filtro, "/admin/reservas", [o.vista !== "proximas" ? `vista=${o.vista}` : "", q ? `q=${encodeURIComponent(o.pesquisa)}` : ""].filter(Boolean).join("&"))}
    <div class="grupo">${lista.length
      ? lista.slice(0, 100).map((r) => itemReserva(r, nome(r.alojamento_id), o.hoje))
      : html`<p class="vazio">${q ? "Nenhuma reserva encontrada." : "Sem reservas."}</p>`}</div>
    ${lista.length > 100 ? html`<p class="nota">A mostrar as primeiras 100. Use a pesquisa para encontrar outras.</p>` : ""}
  `, { admin: menuDoPapel(o.papel), seccao: "reservas", botaoNovo: true });
}

// ---------- Mais (telemóvel) ----------

export function paginaMais() {
  return pagina("Mais", html`<h1>Mais</h1>
    <div class="grupo">
      ${ITENS_MAIS.map((i) => html`<a class="item" href="${i.link}"><span class="simbolo">${icone(i.seccao as NomeIcone, 18)}</span>
        <span class="texto"><strong>${i.nome}</strong><span>${i.descricao ?? ""}</span></span>${icone("seguinte", 18)}</a>`)}
    </div>
    <form method="post" action="/logout"><button class="secundario">${icone("sair", 18)}Terminar sessão</button></form>
  `, { admin: true, seccao: "mais" });
}
