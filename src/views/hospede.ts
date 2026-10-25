import { html } from "hono/html";
import type { ReservaCompleta } from "../db";
import { type EstadoCodigo, hospedeCompleto, inicioCodigo, titularCompleto } from "../lib/regras";
import type { Alojamento, Config, Hospede, Passo } from "../lib/tipos";
import { dataPt, pagina } from "./layout";

// Página do hóspede: bilingue (PT/EN), porque a maioria dos hóspedes é estrangeira.

const TIPOS_DOC = [
  ["P", "Passaporte / Passport"],
  ["B", "Bilhete de identidade / ID card"],
  ["O", "Outro / Other"],
];

function camposHospede(prefixo: string, h: Partial<Hospede> = {}, idDocObrigatorio = false) {
  return html`
    <label>Nome completo / Full name
      <input name="${prefixo}nome" required value="${h.nome ?? ""}" autocomplete="name"></label>
    <label>Data de nascimento / Date of birth
      <input type="date" name="${prefixo}data_nascimento" required value="${h.data_nascimento ?? ""}"></label>
    <label>Nacionalidade / Nationality
      <input name="${prefixo}nacionalidade" ${idDocObrigatorio ? "required" : ""} maxlength="2" placeholder="PT, ES, DE, GB…"
        value="${h.nacionalidade ?? ""}" class="pais"></label>
    <fieldset class="doc">
      <legend>Documento de identificação / ID document <small>(não necessário para portugueses / not required for Portuguese citizens)</small></legend>
      <label>Tipo / Type
        <select name="${prefixo}doc_tipo">
          <option value=""></option>
          ${TIPOS_DOC.map(([v, t]) => html`<option value="${v}" ${h.doc_tipo === v ? "selected" : ""}>${t}</option>`)}
        </select></label>
      <label>Número / Number <input name="${prefixo}doc_numero" value="${h.doc_numero ?? ""}"></label>
      <label>País emissor / Issuing country
        <input name="${prefixo}doc_pais" maxlength="2" class="pais" value="${h.doc_pais ?? ""}"></label>
      <label>País de residência / Country of residence
        <input name="${prefixo}pais_residencia" maxlength="2" class="pais" value="${h.pais_residencia ?? ""}"></label>
    </fieldset>`;
}

const AVISO_PRIVACIDADE = html`<p class="nota">
  Os dados são usados apenas para cumprir obrigações legais em Portugal (faturação, comunicação de estrangeiros
  ao SIBA e taxa municipal turística) e apagados após o prazo legal.<br>
  <em>Your data is only used to meet Portuguese legal obligations (invoicing, mandatory foreign guest
  registration with SIBA and municipal tourist tax) and deleted after the legal retention period.</em></p>`;

export function paginaHospede(
  rc: ReservaCompleta,
  alojamento: Alojamento,
  estado: EstadoCodigo,
  passos: Passo[],
  cfg: Config,
  erro?: string,
) {
  const { reserva: r, hospedes, faturacao } = rc;
  const titulo = html`<h1>Check-in online</h1>
    <p><strong>${alojamento.nome}</strong>${alojamento.morada ? html`<br>${alojamento.morada}` : ""}</p>
    <p>${r.nome_titular} · ${dataPt(r.checkin)} → ${dataPt(r.checkout)} · ${r.n_hospedes} hóspede(s) / guest(s)</p>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}`;

  if (estado === "expirado") {
    return pagina("Check-in", html`${titulo}<p>Esta reserva terminou. Obrigado! / This booking has ended. Thank you!</p>`);
  }

  if (!titularCompleto(r, hospedes, faturacao)) {
    const outros = Math.max(0, r.n_hospedes - 1 - hospedes.filter((h) => !h.titular).length);
    const titular = hospedes.find((h) => h.titular);
    return pagina("Check-in", html`${titulo}
      <p>Preencha o formulário para receber o código de acesso.<br>
      <em>Please fill in this form to receive the access code.</em></p>
      <form method="post" action="/c/${r.token}/titular">
        <h2>1. Os seus dados / Your details</h2>
        ${camposHospede("t_", titular, true)}
        <h2>2. Fatura / Invoice</h2>
        <label>Nome na fatura / Name on invoice <input name="f_nome" required value="${faturacao?.nome ?? ""}"></label>
        <label>NIF / Tax ID (ou n.º de documento / or ID number)
          <input name="f_nif" required value="${faturacao?.nif ?? ""}"></label>
        <label>País / Country <input name="f_pais" required maxlength="2" class="pais" value="${faturacao?.pais ?? ""}"></label>
        <label>Morada / Address <input name="f_morada" value="${faturacao?.morada ?? ""}"></label>
        <label>Código postal / Postcode <input name="f_codigo_postal" value="${faturacao?.codigo_postal ?? ""}"></label>
        <label>Cidade / City <input name="f_cidade" value="${faturacao?.cidade ?? ""}"></label>
        <label>Email (para enviar a fatura / to send the invoice)
          <input type="email" name="f_email" value="${faturacao?.email ?? ""}"></label>
        ${outros > 0
          ? html`<h2>3. Restantes hóspedes / Other guests</h2>
            <p class="nota">Nome e data de nascimento agora; os documentos podem ser preenchidos até
            ${cfg.horasPrazoHospedes}h após o check-in.<br><em>Name and date of birth now; ID documents can be added up
            to ${cfg.horasPrazoHospedes}h after check-in.</em></p>
            ${Array.from({ length: outros }, (_, i) => html`<fieldset><legend>Hóspede / Guest ${i + 2}</legend>
              <label>Nome completo / Full name <input name="o_nome_${i}" required></label>
              <label>Data de nascimento / Date of birth <input type="date" name="o_data_nascimento_${i}" required></label>
            </fieldset>`)}`
          : ""}
        ${AVISO_PRIVACIDADE}
        <button type="submit">Enviar / Submit</button>
      </form>`);
  }

  const blocoCodigo =
    estado === "disponivel"
      ? alojamento.codigo_cofre
        ? html`<div class="codigo"><p>Código do cofre das chaves / Key box code</p><strong>${alojamento.codigo_cofre}</strong></div>`
        : html`<div class="codigo"><p>Contacte o anfitrião para obter o código. / Please contact your host for the code.</p></div>`
      : html`<div class="codigo"><p>O código fica disponível a partir de / The code will be available from</p>
          <strong class="pequeno">${inicioCodigo(r, cfg).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" })}</strong>
          <p>Volte a abrir este link. / Open this link again.</p></div>`;

  const blocoPassos =
    estado === "disponivel" && passos.length
      ? html`<h2>Como entrar / How to get in</h2>
        <ol class="passos">${passos.map((p) => html`<li class="cartao">
          ${p.tem_imagem ? html`<img src="/c/${r.token}/passo/${p.id}?v=${encodeURIComponent(p.atualizado_em)}" alt="" loading="lazy">` : ""}
          ${p.texto ? html`<p>${p.texto}</p>` : ""}</li>`)}</ol>`
      : "";

  const emFalta = hospedes.filter((h) => !hospedeCompleto(h));
  return pagina("Check-in", html`${titulo}${blocoCodigo}${blocoPassos}
    ${emFalta.length
      ? html`<h2>Dados em falta / Missing details</h2>
        <p>Por favor complete até ${cfg.horasPrazoHospedes}h após o check-in.<br>
        <em>Please complete within ${cfg.horasPrazoHospedes}h of check-in.</em></p>
        ${emFalta.map((h) => html`<form method="post" action="/c/${r.token}/hospede/${h.id}" class="cartao">
          <h3>${h.nome}</h3>${camposHospede("", h, true)}<button type="submit">Guardar / Save</button></form>`)}
        ${AVISO_PRIVACIDADE}`
      : html`<p>✅ Todos os dados estão completos. Boa estadia! / All details complete. Enjoy your stay!</p>`}`);
}
