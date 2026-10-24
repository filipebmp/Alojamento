import { html } from "hono/html";
import type { ReservaCompleta } from "../db";
import { hojeLisboa } from "../lib/datas";
import { type Pendente, eEstrangeiro, euros, hospedeCompleto, prazosTmt } from "../lib/regras";
import { calcularTmt } from "../lib/tmt";
import type { DeclaracaoTmt } from "../lib/tipos";
import { dataPt, pagina } from "./layout";

export function paginaLogin(erro?: string) {
  return pagina("Entrar", html`<h1>Entrar</h1>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <form method="post" action="/login">
      <label>Palavra-passe <input type="password" name="password" required autofocus></label>
      <button type="submit">Entrar</button>
    </form>`);
}

function classePrazo(prazo: string | null, hoje: string): string {
  if (!prazo) return "info";
  if (prazo < hoje) return "atrasado";
  if (prazo === hoje) return "hoje";
  return "";
}

export function paginaPainel(pendentes: Pendente[], reservas: ReservaCompleta[], agora: Date) {
  const hoje = hojeLisboa(agora);
  const proximas = reservas.filter((rc) => !rc.reserva.cancelada && rc.reserva.checkout >= hoje).reverse();
  const passadas = reservas.filter((rc) => rc.reserva.cancelada || rc.reserva.checkout < hoje).slice(0, 20);
  const linhaReserva = ({ reserva: r }: ReservaCompleta) => html`<li><a href="/admin/reservas/${r.id}">
      <strong>${r.nome_titular}</strong> ${dataPt(r.checkin)} → ${dataPt(r.checkout)}${r.cancelada ? " (cancelada)" : ""}</a></li>`;

  return pagina("Painel", html`
    <h1>Pendentes</h1>
    ${pendentes.length
      ? html`<ul class="pendentes">${pendentes.map((p) => html`<li class="${classePrazo(p.prazo, hoje)}">
          <a href="${p.reservaId ? `/admin/reservas/${p.reservaId}` : "/admin/tmt"}">${p.descricao}</a>
          ${p.prazo ? html`<span class="prazo">até ${dataPt(p.prazo)}</span>` : ""}</li>`)}</ul>`
      : html`<p>✅ Nada pendente.</p>`}
    <h2>Próximas reservas</h2>
    ${proximas.length ? html`<ul class="lista">${proximas.map(linhaReserva)}</ul>` : html`<p>Sem reservas.</p>`}
    ${passadas.length ? html`<h2>Anteriores</h2><ul class="lista">${passadas.map(linhaReserva)}</ul>` : ""}
  `, { admin: true });
}

export function paginaNovaReserva() {
  return pagina("Nova reserva", html`<h1>Nova reserva</h1>
    <form method="post" action="/admin/reservas">
      <label>Nome do titular <input name="nome_titular" required></label>
      <label>Referência Booking <input name="ref_booking" inputmode="numeric"></label>
      <label>Check-in <input type="date" name="checkin" required></label>
      <label>Check-out <input type="date" name="checkout" required></label>
      <label>N.º de hóspedes <input type="number" name="n_hospedes" min="1" value="2" required></label>
      <label>Valor total pago pelo hóspede (€, sem taxa turística)
        <input name="valor_total" inputmode="decimal" placeholder="0,00"></label>
      <label>Comissão Booking (€) <input name="comissao" inputmode="decimal" placeholder="0,00"></label>
      <button type="submit">Criar</button>
    </form>`, { admin: true });
}

const NOMES_DOC: Record<string, string> = { P: "Passaporte", B: "Bilhete de identidade", O: "Outro" };

export function paginaReserva(rc: ReservaCompleta, linkHospede: string, pendentes: Pendente[], agora: Date) {
  const { reserva: r, hospedes, faturacao: f } = rc;
  const hoje = hojeLisboa(agora);
  const tmt = calcularTmt(r.checkin, r.checkout, hospedes);
  const estrangeiros = hospedes.filter(eEstrangeiro);
  const mensagem =
    `Olá ${r.nome_titular}! Para o check-in, por favor preencha este formulário. O código das chaves aparece depois de preenchido.\n` +
    `Hi ${r.nome_titular}! For check-in, please fill in this form. The key code will appear once completed.\n${linkHospede}`;

  return pagina(r.nome_titular, html`
    <h1>${r.nome_titular}</h1>
    <p>${dataPt(r.checkin)} → ${dataPt(r.checkout)} · ${r.n_hospedes} hóspede(s)
      ${r.ref_booking ? html` · Booking ${r.ref_booking}` : ""}${r.cancelada ? html` · <strong>CANCELADA</strong>` : ""}</p>

    ${pendentes.length
      ? html`<ul class="pendentes">${pendentes.map((p) => html`<li class="${classePrazo(p.prazo, hoje)}">${p.descricao}
          ${p.prazo ? html`<span class="prazo">até ${dataPt(p.prazo)}</span>` : ""}</li>`)}</ul>`
      : ""}

    <section class="cartao">
      <h2>Link de check-in</h2>
      <input readonly value="${linkHospede}" onclick="this.select()">
      <div class="botoes">
        <a class="botao" href="https://wa.me/?text=${encodeURIComponent(mensagem)}">WhatsApp</a>
        <button type="button" data-texto="${mensagem}"
          onclick="navigator.share ? navigator.share({ text: this.dataset.texto }) : navigator.clipboard.writeText(this.dataset.texto)">Partilhar</button>
      </div>
    </section>

    <section class="cartao">
      <h2>Hóspedes (${hospedes.length}/${r.n_hospedes})</h2>
      ${hospedes.length
        ? html`<table><tr><th>Nome</th><th>Nasc.</th><th>Nac.</th><th>Documento</th><th>Resid.</th><th></th></tr>
          ${hospedes.map((h) => html`<tr><td>${h.nome}${h.titular ? " ★" : ""}</td><td>${dataPt(h.data_nascimento)}</td>
            <td>${h.nacionalidade ?? "—"}</td>
            <td>${h.doc_tipo ? `${NOMES_DOC[h.doc_tipo] ?? h.doc_tipo} ${h.doc_numero} (${h.doc_pais})` : "—"}</td>
            <td>${h.pais_residencia ?? "—"}</td><td>${hospedeCompleto(h) ? "✅" : "⏳"}</td></tr>`)}</table>`
        : html`<p>Ainda ninguém preencheu.</p>`}
    </section>

    <section class="cartao">
      <h2>SIBA</h2>
      ${estrangeiros.length
        ? html`<p>${estrangeiros.length} hóspede(s) estrangeiro(s) a comunicar em
            <a href="https://siba.ssi.gov.pt" target="_blank" rel="noopener">siba.ssi.gov.pt</a>
            (entrada ${dataPt(r.checkin)}, saída ${dataPt(r.checkout)}).</p>
          ${r.siba_submetido_em
            ? html`<p>✅ Comunicado em ${dataPt(r.siba_submetido_em)}</p>`
            : html`<form method="post" action="/admin/reservas/${r.id}/siba"><button>Marcar como comunicado</button></form>`}`
        : html`<p>Sem hóspedes estrangeiros registados.</p>`}
    </section>

    <section class="cartao">
      <h2>Fatura-recibo</h2>
      ${f
        ? html`<dl><dt>Cliente</dt><dd>${f.nome}</dd><dt>NIF / ID</dt><dd>${f.nif} (${f.pais})</dd>
            ${f.morada ? html`<dt>Morada</dt><dd>${f.morada}, ${f.codigo_postal ?? ""} ${f.cidade ?? ""}</dd>` : ""}
            ${f.email ? html`<dt>Email</dt><dd>${f.email}</dd>` : ""}
            <dt>Alojamento (IVA 6% incluído)</dt><dd>${euros(r.valor_total_cents)}</dd>
            <dt>Taxa municipal turística (não sujeita a IVA)</dt><dd>${euros(tmt.valorCents)}</dd></dl>`
        : html`<p>À espera dos dados de faturação do hóspede.</p>`}
      ${r.fatura_emitida_em
        ? html`<p>✅ Fatura ${r.fatura_numero} emitida em ${dataPt(r.fatura_emitida_em)}</p>`
        : html`<form method="post" action="/admin/reservas/${r.id}/fatura" class="linha">
            <input name="fatura_numero" placeholder="N.º da fatura" required><button>Marcar como emitida</button></form>`}
    </section>

    <section class="cartao">
      <h2>Taxa turística</h2>
      <p>Devida: <strong>${euros(tmt.valorCents)}</strong> (${tmt.hospedesTributaveis} hóspede(s) × ${tmt.noites} noite(s) × 2 €)<br>
        Dormidas: ${tmt.dormidasTotais} totais · ${tmt.dormidasTributaveis} tributáveis ·
        ${tmt.dormidasAcimaLimite} não sujeitas (além de 5 noites) · ${tmt.dormidasMenores} isentas (menores)
        ${hospedes.length < r.n_hospedes ? html`<br><small>Provisório: faltam hóspedes.</small>` : ""}</p>
      <p>Cobrada pelo Booking: ${r.tmt_cobrada_cents == null ? "—" : euros(r.tmt_cobrada_cents)}</p>
    </section>

    <section class="cartao">
      <h2>Valores</h2>
      <form method="post" action="/admin/reservas/${r.id}/valores">
        <label>Valor total pago pelo hóspede (€, sem taxa turística)
          <input name="valor_total" inputmode="decimal" value="${centsParaInput(r.valor_total_cents)}"></label>
        <label>Comissão Booking (€) <input name="comissao" inputmode="decimal" value="${centsParaInput(r.comissao_cents)}"></label>
        <label>Taxa turística cobrada pelo Booking (€)
          <input name="tmt_cobrada" inputmode="decimal" value="${r.tmt_cobrada_cents == null ? "" : centsParaInput(r.tmt_cobrada_cents)}"></label>
        <button>Guardar</button>
      </form>
      ${r.cancelada
        ? ""
        : html`<form method="post" action="/admin/reservas/${r.id}/cancelar" onsubmit="return confirm('Cancelar esta reserva?')">
            <button class="perigo">Cancelar reserva</button></form>`}
    </section>
  `, { admin: true });
}

export interface ResumoMesTmt {
  mes: string;
  hospedes: number;
  dormidasTotais: number;
  dormidas: number;
  dormidasAcimaLimite: number;
  dormidasMenores: number;
  valorCents: number;
  semDados: number;
  declaracao: DeclaracaoTmt | undefined;
}

export function paginaTmt(resumos: ResumoMesTmt[]) {
  return pagina("Taxa turística", html`<h1>Taxa municipal turística</h1>
    <p class="nota">Declarar no <a href="https://www.cm-almada.pt/inscricao-de-estabelecimentos" target="_blank" rel="noopener">Balcão Virtual da CM Almada</a>
      todos os meses, mesmo sem dormidas. Estadias contadas no mês do check-in.</p>
    ${resumos.map(({ mes, hospedes, dormidasTotais, dormidas, dormidasAcimaLimite, dormidasMenores, valorCents, semDados, declaracao: d }) => {
      const prazos = prazosTmt(mes);
      return html`<section class="cartao">
        <h2>${mes}</h2>
        <dl><dt>Hóspedes tributáveis</dt><dd>${hospedes}</dd>
          <dt>Dormidas totais</dt><dd>${dormidasTotais}</dd>
          <dt>Dormidas tributáveis</dt><dd>${dormidas}</dd>
          <dt>Não sujeitas (além de 5 noites)</dt><dd>${dormidasAcimaLimite}</dd>
          <dt>Isentas (menores de 13)</dt><dd>${dormidasMenores}</dd>
          <dt>Valor</dt><dd><strong>${euros(valorCents)}</strong></dd></dl>
        ${semDados ? html`<p class="erro">⚠️ ${semDados} reserva(s) sem todos os hóspedes registados: valores incompletos.</p>` : ""}
        <div class="botoes">
          ${d?.declarado_em
            ? html`<span>✅ Declarado ${dataPt(d.declarado_em)}</span>`
            : html`<form method="post" action="/admin/tmt/${mes}/declarado"><button>Declarado (até ${dataPt(prazos.declarar)})</button></form>`}
          ${d?.pago_em
            ? html`<span>✅ Pago ${dataPt(d.pago_em)}</span>`
            : html`<form method="post" action="/admin/tmt/${mes}/pago"><button>Pago (até ${dataPt(prazos.pagar)})</button></form>`}
        </div>
      </section>`;
    })}`, { admin: true });
}

function centsParaInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
