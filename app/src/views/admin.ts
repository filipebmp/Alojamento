import { html } from "hono/html";
import type { ReservaCompleta } from "../db";
import { hojeLisboa } from "../lib/datas";
import { CONCELHOS, regrasTmt } from "../lib/concelhos";
import type { EstadoGuardado } from "../lib/licenca";
import { type Pendente, eEstrangeiro, euros, hospedeCompleto, prazosTmt } from "../lib/regras";
import { SENHA_MINIMA } from "../../../comum/senha";
import { calcularTmt, cobraTmt } from "../lib/tmt";
import type { Alojamento, DeclaracaoTmt, Passo } from "../lib/tipos";
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

export function paginaPainel(
  pendentes: Pendente[],
  reservas: ReservaCompleta[],
  alojamentos: Map<number, Alojamento>,
  agora: Date,
  avisoLicenca: string | null,
) {
  const hoje = hojeLisboa(agora);
  const proximas = reservas.filter((rc) => !rc.reserva.cancelada && rc.reserva.checkout >= hoje).reverse();
  const passadas = reservas.filter((rc) => rc.reserva.cancelada || rc.reserva.checkout < hoje).slice(0, 20);
  // Com mais de um alojamento, cada linha indica a que alojamento pertence.
  const etiqueta = (id: number | undefined) =>
    alojamentos.size > 1 && id != null ? html`<span class="etiqueta">${alojamentos.get(id)?.nome ?? ""}</span>` : "";
  const linhaReserva = ({ reserva: r }: ReservaCompleta) => html`<li><a href="/admin/reservas/${r.id}">
      ${etiqueta(r.alojamento_id)}<strong>${r.nome_titular}</strong> ${dataPt(r.checkin)} → ${dataPt(r.checkout)}${r.cancelada ? " (cancelada)" : ""}</a></li>`;

  return pagina("Painel", html`
    ${avisoLicenca ? html`<p class="aviso"><a href="/admin/definicoes">${avisoLicenca}</a></p>` : ""}
    <h1>Pendentes</h1>
    ${pendentes.length
      ? html`<ul class="pendentes">${pendentes.map((p) => html`<li class="${classePrazo(p.prazo, hoje)}">
          <a href="${p.reservaId ? `/admin/reservas/${p.reservaId}` : "/admin/tmt"}">${etiqueta(p.alojamentoId)}${p.descricao}</a>
          ${p.prazo ? html`<span class="prazo">até ${dataPt(p.prazo)}</span>` : ""}</li>`)}</ul>`
      : html`<p>✅ Nada pendente.</p>`}
    <h2>Próximas reservas</h2>
    ${proximas.length ? html`<ul class="lista">${proximas.map(linhaReserva)}</ul>` : html`<p>Sem reservas.</p>`}
    ${passadas.length ? html`<h2>Anteriores</h2><ul class="lista">${passadas.map(linhaReserva)}</ul>` : ""}
  `, { admin: true });
}

export function paginaNovaReserva(alojamentos: Alojamento[]) {
  return pagina("Nova reserva", html`<h1>Nova reserva</h1>
    <form method="post" action="/admin/reservas">
      ${alojamentos.length === 1
        ? html`<input type="hidden" name="alojamento_id" value="${alojamentos[0].id}">`
        : html`<label>Alojamento <select name="alojamento_id" required>
            <option value=""></option>
            ${alojamentos.map((a) => html`<option value="${a.id}">${a.nome}</option>`)}</select></label>`}
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

export function paginaReserva(rc: ReservaCompleta, alojamento: Alojamento, linkHospede: string, pendentes: Pendente[], agora: Date) {
  const { reserva: r, hospedes, faturacao: f } = rc;
  const hoje = hojeLisboa(agora);
  const regras = regrasTmt(alojamento);
  const tmt = calcularTmt(r.checkin, r.checkout, hospedes, regras);
  const estrangeiros = hospedes.filter(eEstrangeiro);
  const mensagem =
    `Olá ${r.nome_titular}! Para o check-in, por favor preencha este formulário. O código das chaves aparece depois de preenchido.\n` +
    `Hi ${r.nome_titular}! For check-in, please fill in this form. The key code will appear once completed.\n${linkHospede}`;

  return pagina(r.nome_titular, html`
    <h1>${r.nome_titular}</h1>
    <p><a href="/admin/alojamentos/${alojamento.id}">${alojamento.nome}</a> · ${dataPt(r.checkin)} → ${dataPt(r.checkout)} · ${r.n_hospedes} hóspede(s)
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
            ${cobraTmt(regras) ? html`<dt>Taxa municipal turística (não sujeita a IVA)</dt><dd>${euros(tmt.valorCents)}</dd>` : ""}</dl>`
        : html`<p>À espera dos dados de faturação do hóspede.</p>`}
      ${r.fatura_emitida_em
        ? html`<p>✅ Fatura ${r.fatura_numero} emitida em ${dataPt(r.fatura_emitida_em)}</p>`
        : html`<form method="post" action="/admin/reservas/${r.id}/fatura" class="linha">
            <input name="fatura_numero" placeholder="N.º da fatura" required><button>Marcar como emitida</button></form>`}
    </section>

    ${cobraTmt(regras)
      ? html`<section class="cartao">
      <h2>Taxa turística</h2>
      <p>Devida: <strong>${euros(tmt.valorCents)}</strong> (${tmt.hospedesTributaveis} hóspede(s) × ${tmt.noites} noite(s) × ${euros(regras.valorPorNoiteCents)})<br>
        Dormidas: ${tmt.dormidasTotais} totais · ${tmt.dormidasTributaveis} tributáveis ·
        ${regras.maxNoites ? html`${tmt.dormidasAcimaLimite} não sujeitas (além de ${regras.maxNoites} noites) · ` : ""}${tmt.dormidasMenores} isentas (menores)
        ${hospedes.length < r.n_hospedes ? html`<br><small>Provisório: faltam hóspedes.</small>` : ""}</p>
      <p>Cobrada pelo Booking: ${r.tmt_cobrada_cents == null ? "—" : euros(r.tmt_cobrada_cents)}</p>
    </section>`
      : ""}

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

export interface TmtAlojamento {
  alojamento: Alojamento;
  resumos: ResumoMesTmt[];
}

export function paginaTmt(porAlojamento: TmtAlojamento[], mostrarNome: boolean) {
  return pagina("Taxa turística", html`<h1>Taxa municipal turística</h1>
    <p class="nota">Declarar à câmara todos os meses, mesmo sem dormidas. Estadias contadas no mês do check-in.</p>
    ${porAlojamento.length ? "" : html`<p>Nenhum alojamento está num concelho com taxa turística.
      Pode configurá-la em <a href="/admin/alojamentos">Alojamentos</a>.</p>`}
    ${porAlojamento.map(({ alojamento: a, resumos }) => {
      const regras = regrasTmt(a);
      return html`
      ${mostrarNome ? html`<h2>${a.nome}</h2>` : ""}
      <p class="nota">CM ${a.concelho}: ${euros(regras.valorPorNoiteCents)} por hóspede e noite${regras.maxNoites ? `, máx. ${regras.maxNoites} noites` : ""}.
        ${a.tmt_portal ? html`<a href="${a.tmt_portal}" target="_blank" rel="noopener">Portal da câmara</a>` : ""}</p>
      ${resumos.map(({ mes, hospedes, dormidasTotais, dormidas, dormidasAcimaLimite, dormidasMenores, valorCents, semDados, declaracao: d }) => {
        const prazos = prazosTmt(mes, regras);
        return html`<section class="cartao">
          <h2>${mes}</h2>
          <dl><dt>Hóspedes tributáveis</dt><dd>${hospedes}</dd>
            <dt>Dormidas totais</dt><dd>${dormidasTotais}</dd>
            <dt>Dormidas tributáveis</dt><dd>${dormidas}</dd>
            ${regras.maxNoites ? html`<dt>Não sujeitas (além de ${regras.maxNoites} noites)</dt><dd>${dormidasAcimaLimite}</dd>` : ""}
            <dt>Isentas (menores de ${regras.idadeMinima})</dt><dd>${dormidasMenores}</dd>
            <dt>Valor</dt><dd><strong>${euros(valorCents)}</strong></dd></dl>
          ${semDados ? html`<p class="erro">⚠️ ${semDados} reserva(s) sem todos os hóspedes registados: valores incompletos.</p>` : ""}
          <div class="botoes">
            ${d?.declarado_em
              ? html`<span>✅ Declarado ${dataPt(d.declarado_em)}</span>`
              : html`<form method="post" action="/admin/tmt/${a.id}/${mes}/declarado"><button>Declarado (até ${dataPt(prazos.declarar)})</button></form>`}
            ${d?.pago_em
              ? html`<span>✅ Pago ${dataPt(d.pago_em)}</span>`
              : html`<form method="post" action="/admin/tmt/${a.id}/${mes}/pago"><button>Pago (até ${dataPt(prazos.pagar)})</button></form>`}
          </div>
        </section>`;
      })}`;
    })}`, { admin: true });
}

// Reduz as fotos no telemóvel antes do envio (máx. 1600 px, JPEG) para caberem na base de dados.
const SCRIPT_REDIMENSIONAR = html`<script>
document.querySelectorAll("input[data-redimensionar]").forEach((input) => {
  input.addEventListener("change", async () => {
    const ficheiro = input.files[0];
    if (!ficheiro) return;
    const botao = input.form.querySelector("button[type=submit]");
    botao.disabled = true;
    try {
      const img = await createImageBitmap(ficheiro);
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "foto.jpg", { type: "image/jpeg" }));
      input.files = dt.files;
    } catch (e) {
      console.error(e);
    } finally {
      botao.disabled = false;
    }
  });
});
</script>`;

export function paginaInstrucoes(a: Alojamento, passos: Passo[], erro?: string) {
  const ultimo = passos.length - 1;
  const base = `/admin/alojamentos/${a.id}/instrucoes`;
  return pagina("Instruções de chegada", html`<h1>Instruções de chegada</h1>
    <p><a href="/admin/alojamentos/${a.id}">${a.nome}</a></p>
    <p class="nota">Aparecem ao hóspede por baixo do código do cofre, só quando o código fica disponível.
      Sugestão: escreve cada texto em português e inglês.</p>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    ${passos.map((p, i) => html`<section class="cartao passo-admin">
      <h2>Passo ${i + 1}</h2>
      ${p.tem_imagem ? html`<img src="${base}/${p.id}/imagem?v=${encodeURIComponent(p.atualizado_em)}" alt="">` : ""}
      <form method="post" action="${base}/${p.id}" enctype="multipart/form-data">
        <label>Texto <textarea name="texto" rows="3">${p.texto}</textarea></label>
        <label>Substituir foto <input type="file" name="imagem" accept="image/*" data-redimensionar></label>
        <button type="submit">Guardar</button>
      </form>
      <div class="botoes">
        ${i > 0 ? html`<form method="post" action="${base}/${p.id}/mover?dir=-1"><button>↑ Subir</button></form>` : ""}
        ${i < ultimo ? html`<form method="post" action="${base}/${p.id}/mover?dir=1"><button>↓ Descer</button></form>` : ""}
        <form method="post" action="${base}/${p.id}/apagar" onsubmit="return confirm('Apagar este passo?')">
          <button class="perigo">Apagar</button></form>
      </div>
    </section>`)}
    <section class="cartao">
      <h2>Novo passo</h2>
      <form method="post" action="${base}" enctype="multipart/form-data">
        <label>Foto <input type="file" name="imagem" accept="image/*" data-redimensionar></label>
        <label>Texto <textarea name="texto" rows="3" placeholder="Ex.: O cofre está à direita da porta. / The key box is to the right of the door."></textarea></label>
        <button type="submit">Adicionar</button>
      </form>
    </section>
    ${SCRIPT_REDIMENSIONAR}`, { admin: true });
}

function centsParaInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

// ---------- Primeiro arranque e definições ----------

function camposNovaSenha() {
  return html`
    <label>Nova palavra-passe <input type="password" name="senha" required minlength="${SENHA_MINIMA}" autocomplete="new-password"></label>
    <label>Repetir <input type="password" name="confirmar" required minlength="${SENHA_MINIMA}" autocomplete="new-password"></label>`;
}

export function paginaConfigurar(erro?: string) {
  return pagina("Bem-vindo", html`<h1>Bem-vindo ao bookgest</h1>
    <p>Escolha a palavra-passe de acesso ao painel. A seguir, crie o seu primeiro alojamento.</p>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <form method="post" action="/configurar">
      ${camposNovaSenha()}
      <button type="submit">Continuar</button>
    </form>`);
}

const NOMES_ESTADO_LICENCA = { ativa: "ativa", pagamento_em_atraso: "pagamento em atraso", inativa: "inativa", desconhecida: "não reconhecida" };

export function paginaDefinicoes(opcoes: {
  erro?: string;
  guardado?: boolean;
  licenca: { chave: string | null; estado: EstadoGuardado | null; erro: string | null; aviso: string | null };
}) {
  const { chave, estado, erro, aviso } = opcoes.licenca;
  return pagina("Definições", html`<h1>Definições</h1>
    ${opcoes.guardado ? html`<p>✅ Palavra-passe alterada. As sessões noutros dispositivos foram terminadas.</p>` : ""}
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <section class="cartao">
      <h2>Licença</h2>
      ${estado
        ? html`<p>Estado: <strong>${NOMES_ESTADO_LICENCA[estado.estado]}</strong> · ${estado.alojamentosPagos} alojamento(s) incluído(s)<br>
            <small>Verificada em ${dataPt(estado.verificadoEm)}</small></p>`
        : chave ? html`<p class="nota">Ainda não foi possível verificar a licença.</p>` : ""}
      ${chave && erro ? html`<p class="nota">Última tentativa falhou: ${erro}</p>` : ""}
      ${aviso ? html`<p class="erro">${aviso}</p>` : ""}
      <form method="post" action="/admin/definicoes/licenca">
        <label>Chave de licença <input name="chave" required value="${chave ?? ""}" placeholder="BG-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters"></label>
        <button type="submit">Guardar e verificar</button>
      </form>
      <p class="nota">A sua instalação só envia ao bookgest a chave, a versão e o número de alojamentos ativos.</p>
    </section>
    <section class="cartao">
      <h2>Palavra-passe</h2>
      <form method="post" action="/admin/definicoes/senha">
        <label>Palavra-passe atual <input type="password" name="atual" required autocomplete="current-password"></label>
        ${camposNovaSenha()}
        <button type="submit">Alterar</button>
      </form>
    </section>
    <form method="post" action="/logout"><button>Terminar sessão</button></form>`, { admin: true });
}

// ---------- Alojamentos ----------

export function paginaAlojamentos(alojamentos: Alojamento[]) {
  const linha = (a: Alojamento) => html`<li><a href="/admin/alojamentos/${a.id}">
      <strong>${a.nome}</strong>${a.ativo ? "" : " (arquivado)"}
      <span class="prazo">${[a.concelho, a.registo_al ? `AL ${a.registo_al}` : ""].filter(Boolean).join(" · ") || "—"}</span></a></li>`;
  return pagina("Alojamentos", html`<h1>Alojamentos</h1>
    <ul class="lista">${alojamentos.map(linha)}</ul>
    <a class="botao" href="/admin/alojamentos/novo">+ Novo alojamento</a>`, { admin: true });
}

// Preenche os campos da taxa turística a partir do concelho escolhido.
const SCRIPT_CONCELHO = html`<script>
document.querySelector("select[data-concelhos]")?.addEventListener("change", (e) => {
  const lista = JSON.parse(e.target.dataset.concelhos);
  const c = lista.find((x) => x.nome === e.target.value);
  const f = e.target.form;
  if (e.target.value === "") return;
  if (e.target.value === "-") {
    f.concelho.value = ""; f.tmt_valor.value = ""; f.tmt_max_noites.value = ""; f.tmt_idade_minima.value = ""; f.tmt_portal.value = "";
    return;
  }
  f.concelho.value = c.nome;
  f.tmt_valor.value = (c.tmt.valorPorNoiteCents / 100).toFixed(2).replace(".", ",");
  f.tmt_max_noites.value = c.tmt.maxNoites || "";
  f.tmt_idade_minima.value = c.tmt.idadeMinima;
  f.tmt_dia_declaracao.value = c.tmt.diaDeclaracao;
  f.tmt_dia_pagamento.value = c.tmt.diaPagamento;
  f.tmt_portal.value = c.portal || "";
});
</script>`;

export function paginaAlojamento(
  a: Alojamento | null,
  opcoes: { primeiro?: boolean; erro?: string; guardado?: boolean; codigoSugerido?: string } = {},
) {
  const v = (x: string | number | null | undefined) => x ?? "";
  const titulo = a ? a.nome : opcoes.primeiro ? "O seu primeiro alojamento" : "Novo alojamento";
  return pagina(titulo, html`<h1>${titulo}</h1>
    ${opcoes.guardado ? html`<p>✅ Guardado.</p>` : ""}
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    ${a ? html`<p><a class="botao" href="/admin/alojamentos/${a.id}/instrucoes">Instruções de chegada</a></p>` : ""}
    <form method="post" action="${a ? `/admin/alojamentos/${a.id}` : "/admin/alojamentos"}">
      <section class="cartao">
        <h2>Identificação</h2>
        <label>Nome <input name="nome" required value="${v(a?.nome)}" placeholder="Ex.: Casa da Praia"></label>
        <label>Morada <input name="morada" value="${v(a?.morada)}"></label>
        <label>N.º de registo AL <input name="registo_al" value="${v(a?.registo_al)}"></label>
      </section>
      <section class="cartao">
        <h2>Chegada dos hóspedes</h2>
        <label>Código do cofre das chaves <input name="codigo_cofre" required value="${v(a?.codigo_cofre ?? opcoes.codigoSugerido)}"></label>
        <label>Hora de check-in <input type="time" name="hora_checkin" required value="${a?.hora_checkin ?? "15:00"}"></label>
        <label>Mostrar o código a partir de quantas horas antes do check-in
          <input type="number" name="horas_antes_codigo" min="0" max="168" required value="${a?.horas_antes_codigo ?? 24}"></label>
        <label>Horas após o check-in para os restantes hóspedes preencherem os dados
          <input type="number" name="horas_prazo_hospedes" min="0" max="336" required value="${a?.horas_prazo_hospedes ?? 48}"></label>
      </section>
      <section class="cartao">
        <h2>Taxa municipal turística</h2>
        <label>Preencher com as regras de
          <select data-concelhos="${JSON.stringify(CONCELHOS)}">
            <option value="">—</option>
            ${CONCELHOS.map((c) => html`<option value="${c.nome}">${c.nome}</option>`)}
            <option value="-">Concelho sem taxa turística</option>
          </select></label>
        <p class="nota">Confirme sempre os valores no regulamento da sua câmara. Valor vazio ou 0 = sem taxa.</p>
        <label>Concelho <input name="concelho" value="${v(a?.concelho)}"></label>
        <label>Valor por hóspede e noite (€)
          <input name="tmt_valor" inputmode="decimal" value="${a?.tmt_valor_cents ? centsParaInput(a.tmt_valor_cents) : ""}"></label>
        <label>Máximo de noites cobradas por estadia (vazio = sem limite)
          <input type="number" name="tmt_max_noites" min="0" max="365" value="${a?.tmt_max_noites || ""}"></label>
        <label>Idade a partir da qual se paga
          <input type="number" name="tmt_idade_minima" min="0" max="25" value="${a?.tmt_valor_cents ? a.tmt_idade_minima : ""}"></label>
        <label>Declarar até ao dia (do mês seguinte)
          <input type="number" name="tmt_dia_declaracao" min="1" max="31" required value="${a?.tmt_dia_declaracao ?? 15}"></label>
        <label>Pagar até ao dia (do mês seguinte)
          <input type="number" name="tmt_dia_pagamento" min="1" max="31" required value="${a?.tmt_dia_pagamento ?? 30}"></label>
        <label>Portal da câmara (endereço) <input name="tmt_portal" inputmode="url" value="${v(a?.tmt_portal)}" placeholder="https://"></label>
      </section>
      <button type="submit">${a ? "Guardar" : "Criar alojamento"}</button>
    </form>
    ${a
      ? html`<form method="post" action="/admin/alojamentos/${a.id}/${a.ativo ? "arquivar" : "reativar"}"
          ${a.ativo ? html`onsubmit="return confirm('Arquivar este alojamento? Deixa de aparecer nas novas reservas; os dados são conservados.')"` : ""}>
          <button class="${a.ativo ? "perigo" : ""}">${a.ativo ? "Arquivar alojamento" : "Reativar alojamento"}</button></form>`
      : ""}
    ${SCRIPT_CONCELHO}`, { admin: true });
}
