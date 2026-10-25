import { html } from "hono/html";
import type { ReservaCompleta } from "../db";
import { hojeLisboa } from "../lib/datas";
import { CONCELHOS, regrasTmt } from "../lib/concelhos";
import type { EstadoGuardado } from "../lib/licenca";
import { type Pendente, eEstrangeiro, euros, hospedeCompleto, prazosTmt } from "../lib/regras";
import { SENHA_MINIMA } from "../../../comum/senha";
import { calcularTmt, cobraTmt } from "../lib/tmt";
import type { Alojamento, DeclaracaoTmt, Passo } from "../lib/tipos";
import { type Calendario, NOMES_PLATAFORMA } from "../lib/importacao";
import type { EmailRecebido } from "../lib/emails";
import type { DadosEmailReserva } from "../../../comum/emails";
import { N_CODIGOS, type Papel, type Utilizador } from "../lib/utilizadores";
import { dataCurta, dataPt, icone, nomeMes, pagina } from "./layout";
import { chipOrigem, classePrazo } from "./painel";
import { diferencaDias } from "../lib/datas";
import { REGIMES_IVA } from "../lib/faturacao";
import { NOMES_PROGRAMA, type Programa } from "../lib/programas-faturacao";

export function paginaLogin(opcoes: { erro?: string; legado?: boolean; email?: string } = {}) {
  return pagina("Entrar", html`<div class="entrada">
    <div class="marca"><span class="logo">${icone("hoje", 16)}</span>bookgest</div>
    <section class="cartao">
    <h1>Entrar</h1>
    ${opcoes.legado
      ? html`<p class="aviso">A entrada passa a ser com email. Indique o seu email e a palavra-passe de sempre:
          o email fica associado à sua conta de gestor.</p>`
      : ""}
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <form method="post" action="/login">
      <label>Email <input type="email" name="email" required autofocus autocomplete="username" value="${opcoes.email ?? ""}"></label>
      <label>Palavra-passe <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit" class="grande">Entrar</button>
    </form>
    ${opcoes.legado ? "" : html`<p class="nota"><a href="/recuperar">Esqueci-me da palavra-passe</a></p>`}
    </section></div>`);
}

export function paginaNovaReserva(
  alojamentos: Alojamento[],
  papel: Papel,
  s: { nome?: string; checkin?: string; checkout?: string; n?: string; ref?: string; origem?: string } = {},
) {
  return pagina("Nova reserva", html`<h1>Nova reserva</h1>
    <form method="post" action="/admin/reservas">
      ${alojamentos.length === 1
        ? html`<input type="hidden" name="alojamento_id" value="${alojamentos[0].id}">`
        : html`<label>Alojamento <select name="alojamento_id" required>
            <option value=""></option>
            ${alojamentos.map((a) => html`<option value="${a.id}">${a.nome}</option>`)}</select></label>`}
      ${campoOrigem(s.origem || "booking")}
      <label>Nome do titular <input name="nome_titular" required value="${s.nome ?? ""}"></label>
      <label>Referência da reserva <input name="ref_booking" value="${s.ref ?? ""}"></label>
      <label>Check-in <input type="date" name="checkin" required value="${s.checkin ?? ""}"></label>
      <label>Check-out <input type="date" name="checkout" required value="${s.checkout ?? ""}"></label>
      <label>N.º de hóspedes <input type="number" name="n_hospedes" min="1" value="${s.n || 2}" required></label>
      ${papel === "gestor"
        ? html`<label>Valor total pago pelo hóspede (€, sem taxa turística)
            <input name="valor_total" inputmode="decimal" placeholder="0,00"></label>
          <label>Comissão da plataforma (€) <input name="comissao" inputmode="decimal" placeholder="0,00"></label>`
        : ""}
      <button type="submit">Criar</button>
    </form>`, { admin: papel === "gestor" ? true : "equipa", seccao: "reservas", voltar: "/admin/reservas" });
}

// Origem guardada em reservas.origem ("manual" = reserva direta).
export const ORIGENS: [string, string][] = [["booking", "Booking"], ["airbnb", "Airbnb"], ["manual", "Direta"], ["outra", "Outra"]];

const campoOrigem = (atual: string) => html`<label>Plataforma
  <select name="origem">${ORIGENS.map(([v, t]) => html`<option value="${v}"${v === atual ? " selected" : ""}>${t}</option>`)}</select></label>`;

// Botão discreto para desfazer uma marcação feita por engano.
const anular = (acao: string, pergunta: string) => html`<form method="post" action="${acao}" onsubmit="return confirm(this.dataset.pergunta)" data-pergunta="${pergunta}">
  <button class="ligacao">Anular</button></form>`;

const NOMES_DOC: Record<string, string> = { P: "Passaporte", B: "Bilhete de identidade", O: "Outro" };

export function paginaReserva(
  rc: ReservaCompleta,
  alojamento: Alojamento,
  linkHospede: string,
  pendentes: Pendente[],
  agora: Date,
  papel: Papel,
  faturacao: { programa: Programa | null; teste?: boolean; erro?: string | null; aviso?: string | null; declaracaoTmt?: DeclaracaoTmt | null } = { programa: null },
) {
  const gestor = papel === "gestor";
  const { reserva: r, hospedes, faturacao: f } = rc;
  const hoje = hojeLisboa(agora);
  const regras = regrasTmt(alojamento);
  const tmt = calcularTmt(r.checkin, r.checkout, hospedes, regras);
  const estrangeiros = hospedes.filter(eEstrangeiro);
  const mensagem =
    `Olá ${r.nome_titular}! Para o check-in, por favor preencha este formulário. O código das chaves aparece depois de preenchido.\n` +
    `Hi ${r.nome_titular}! For check-in, please fill in this form. The key code will appear once completed.\n${linkHospede}`;

  const noites = diferencaDias(r.checkin, r.checkout);
  const estado = r.cancelada
    ? html`<span class="chip atrasado">Cancelada</span>`
    : r.checkin === hoje ? html`<span class="chip hoje">Chega hoje</span>`
    : r.checkout === hoje ? html`<span class="chip hoje">Sai hoje</span>`
    : r.checkin < hoje && r.checkout > hoje ? html`<span class="chip ok">Em casa</span>`
    : r.checkout < hoje ? html`<span class="chip">Terminada</span>`
    : html`<span class="chip">${diferencaDias(hoje, r.checkin) === 1 ? "Chega amanhã" : `Chega daqui a ${diferencaDias(hoje, r.checkin)} dias`}</span>`;

  // Percurso da reserva: cada passo feito, por fazer (com prazo) ou ainda não aplicável.
  const pendente = (tipo: Pendente["tipo"]) => pendentes.find((p) => p.tipo === tipo);
  const passo = (o: { titulo: string; sub: string; feito?: boolean; p?: Pendente; ancora: string; acao?: string }) => {
    const c = o.feito ? "feito" : o.p ? (classePrazo(o.p.prazo, hoje) === "atrasado" ? "atrasado" : "atencao") : "";
    return html`<li class="${c}"><span class="marca-passo">${o.feito ? icone("visto", 14) : ""}</span>
      <span class="texto"><strong>${o.titulo}</strong><span>${o.sub}${o.p?.prazo ? ` · até ${dataPt(o.p.prazo)}` : ""}</span></span>
      ${o.acao ? html`<a href="${o.ancora.startsWith("/") ? o.ancora : `#${o.ancora}`}">${o.acao}</a>` : ""}</li>`;
  };
  // Taxa turística: fica feita quando a declaração do mês do check-in está declarada e paga (em Taxas).
  const passoTmt = () => {
    const divergente = pendente("tmt_divergente");
    if (divergente) return passo({ titulo: "Taxa turística", sub: "Valor cobrado diferente do devido", p: divergente, ancora: "tmt", acao: "Ver" });
    const mes = r.checkin.slice(0, 7);
    const d = faturacao.declaracaoTmt;
    const prazos = prazosTmt(mes, regras);
    const base = `${euros(tmt.valorCents)} · ${nomeMes(r.checkin)}`;
    if (d?.declarado_em && d.pago_em) return passo({ titulo: "Taxa turística", sub: `${base} · declarada e paga`, feito: true, ancora: "tmt" });
    const falta = d?.declarado_em
      ? { sub: `${base} · declarada, falta pagar`, prazo: prazos.pagar }
      : { sub: `${base} · por declarar`, prazo: prazos.declarar };
    // Declara-se no mês seguinte ao do check-in: até lá o passo fica neutro.
    const ativo = hoje.slice(0, 7) > mes;
    return passo({
      titulo: "Taxa turística",
      sub: falta.sub,
      p: ativo ? { tipo: "tmt_declarar", descricao: "", prazo: falta.prazo } : undefined,
      ancora: gestor ? "/admin/tmt" : "tmt",
      acao: ativo ? "Taxas" : undefined,
    });
  };
  const completos = hospedes.filter(hospedeCompleto).length;
  const hospedesFeitos = completos >= r.n_hospedes && hospedes.length >= r.n_hospedes;
  const progresso = r.cancelada ? [] : [
    ...(r.incompleta ? [passo({ titulo: "Dados da reserva", sub: "Completar nome e n.º de hóspedes", p: pendente("completar"), ancora: "dados", acao: "Completar" })] : []),
    passo({
      titulo: "Dados dos hóspedes",
      sub: hospedes.length ? `${completos} de ${r.n_hospedes} completos` : "Link de check-in por preencher",
      feito: hospedesFeitos,
      p: pendente("formulario") ?? pendente("dados_hospedes"),
      ancora: hospedes.length ? "hospedes" : "link",
      acao: hospedesFeitos || r.incompleta ? undefined : hospedes.length ? "Ver" : "Enviar link",
    }),
    ...(gestor
      ? [
          passo({
            titulo: "Comunicação ao SIBA",
            sub: estrangeiros.length
              ? r.siba_submetido_em ? `Comunicado em ${dataPt(r.siba_submetido_em)}` : `${estrangeiros.length} hóspede(s) estrangeiro(s)`
              : hospedesFeitos ? "Sem hóspedes estrangeiros" : "Depende dos hóspedes",
            feito: !!r.siba_submetido_em || (hospedesFeitos && !estrangeiros.length),
            p: pendente("siba"),
            ancora: "siba",
            acao: estrangeiros.length && !r.siba_submetido_em ? "Comunicar" : undefined,
          }),
          passo({
            titulo: "Fatura-recibo",
            sub: r.fatura_emitida_em ? `N.º ${r.fatura_numero} · ${dataPt(r.fatura_emitida_em)}` : f ? "Dados de faturação recebidos" : "À espera dos dados de faturação",
            feito: !!r.fatura_emitida_em,
            p: pendente("fatura"),
            ancora: "fatura",
            acao: r.fatura_emitida_em ? undefined : "Registar",
          }),
          ...(cobraTmt(regras) ? [passoTmt()] : []),
        ]
      : []),
  ];

  return pagina(r.nome_titular, html`
    <p class="sobre nota" style="margin: 0">${gestor ? html`<a href="/admin/alojamentos/${alojamento.id}">${alojamento.nome}</a>` : alojamento.nome}${r.ref_booking ? ` · ${r.ref_booking}` : ""}</p>
    <h1>${r.incompleta ? "Reserva por completar" : r.nome_titular}</h1>
    <div class="botoes">${chipOrigem(r)}${estado}</div>

    <section class="cartao factos">
      <div><span>Check-in</span><strong>${dataCurta(r.checkin)}</strong><small>a partir das ${alojamento.hora_checkin}</small></div>
      <div><span>Check-out</span><strong>${dataCurta(r.checkout)}</strong></div>
      <div><span>Estadia</span><strong>${noites} ${noites === 1 ? "noite" : "noites"}</strong><small>${r.n_hospedes} hóspede(s)</small></div>
      ${gestor && alojamento.codigo_cofre
        ? html`<div><span>Código das chaves</span><strong style="letter-spacing: .12em">${alojamento.codigo_cofre}</strong></div>`
        : ""}
    </section>

    ${progresso.length ? html`<section class="cartao"><h2>Progresso</h2><ul class="progresso">${progresso}</ul></section>` : ""}

    ${r.desaparecida_em && !r.cancelada
      ? html`<section class="cartao aviso">
          <p>Esta reserva deixou de aparecer no calendário ${NOMES_PLATAFORMA[r.origem as keyof typeof NOMES_PLATAFORMA] ?? ""}.
            Normalmente quer dizer que foi cancelada.</p>
          ${gestor
            ? html`<div class="botoes">
                <form method="post" action="/admin/reservas/${r.id}/cancelar"><button class="perigo">Cancelar a reserva</button></form>
                <form method="post" action="/admin/reservas/${r.id}/manter"><button>Manter</button></form></div>`
            : ""}
        </section>`
      : ""}

    ${r.incompleta || r.uid_externo
      ? html`<section class="cartao ${r.incompleta ? "aviso" : ""}" id="dados">
          <h2>Dados da reserva</h2>
          ${r.incompleta
            ? html`<p>Importada do calendário ${NOMES_PLATAFORMA[r.origem as keyof typeof NOMES_PLATAFORMA] ?? ""}: o calendário só traz as datas.
                Complete o nome e o n.º de hóspedes antes de enviar o link de check-in.</p>`
            : html`<p class="nota">Ligada ao calendário ${NOMES_PLATAFORMA[r.origem as keyof typeof NOMES_PLATAFORMA] ?? ""}: as datas atualizam-se sozinhas.</p>`}
          <form method="post" action="/admin/reservas/${r.id}/dados">
            <label>Nome do titular <input name="nome_titular" required value="${r.incompleta ? "" : r.nome_titular}" placeholder="Nome como aparece na plataforma"></label>
            <label>N.º de hóspedes <input type="number" name="n_hospedes" min="1" max="50" required value="${r.incompleta ? "" : r.n_hospedes}"></label>
            <label>Referência da reserva <input name="ref_booking" value="${r.ref_booking ?? ""}"></label>
            <button type="submit">Guardar</button>
          </form>
          ${gestor && r.uid_externo
            ? html`<form method="post" action="/admin/reservas/${r.id}/ignorar"
                onsubmit="return confirm('Estas datas não são uma reserva (por exemplo, fechadas à mão)? Deixam de aparecer e não voltam a ser importadas.')">
                <button class="perigo">Não é uma reserva</button></form>`
            : ""}
        </section>`
      : ""}

    ${r.cancelada || r.incompleta
      ? ""
      : html`<section class="cartao" id="link">
      <h2>Link de check-in</h2>
      <p class="nota">O hóspede preenche os dados e recebe o código das chaves.</p>
      <div class="botoes">
        <a class="botao" href="https://wa.me/?text=${encodeURIComponent(mensagem)}">${icone("whatsapp", 18)}Enviar por WhatsApp</a>
        <button type="button" class="secundario" data-texto="${mensagem}"
          onclick="navigator.share ? navigator.share({ text: this.dataset.texto }) : navigator.clipboard.writeText(this.dataset.texto).then(() => this.textContent = 'Copiado')">${icone("copiar", 18)}Partilhar</button>
      </div>
      <input readonly value="${linkHospede}" onclick="this.select()" aria-label="Link de check-in" style="margin-top: 12px">
    </section>`}

    <section class="cartao" id="hospedes">
      <h2>Hóspedes (${hospedes.length}/${r.n_hospedes})</h2>
      ${hospedes.length && !gestor
        ? html`<ul class="lista">${hospedes.map((h) => html`<li>${h.nome}${h.titular ? " ★" : ""} ${hospedeCompleto(h) ? "✅" : "⏳"}</li>`)}</ul>`
        : hospedes.length
        ? html`<table><tr><th>Nome</th><th>Nasc.</th><th>Nac.</th><th>Documento</th><th>Resid.</th><th></th></tr>
          ${hospedes.map((h) => html`<tr><td>${h.nome}${h.titular ? " ★" : ""}</td><td>${dataPt(h.data_nascimento)}</td>
            <td>${h.nacionalidade ?? "—"}</td>
            <td>${h.doc_tipo ? `${NOMES_DOC[h.doc_tipo] ?? h.doc_tipo} ${h.doc_numero} (${h.doc_pais})` : "—"}</td>
            <td>${h.pais_residencia ?? "—"}</td><td>${hospedeCompleto(h) ? "✅" : "⏳"}</td></tr>`)}</table>`
        : html`<p>Ainda ninguém preencheu.</p>`}
    </section>

    ${gestor ? html`
    <section class="cartao" id="siba">
      <h2>SIBA</h2>
      ${estrangeiros.length
        ? html`<p>${estrangeiros.length} hóspede(s) estrangeiro(s) a comunicar em
            <a href="https://siba.ssi.gov.pt" target="_blank" rel="noopener">siba.ssi.gov.pt</a>
            (entrada ${dataPt(r.checkin)}, saída ${dataPt(r.checkout)}).</p>
          ${r.siba_submetido_em
            ? html`<div class="botoes"><span>✅ Comunicado em ${dataPt(r.siba_submetido_em)}</span>
                ${anular(`/admin/reservas/${r.id}/siba/anular`, "Anular a marcação de comunicado ao SIBA? (Só no bookgest: nada é enviado ao SIBA.)")}</div>`
            : html`<form method="post" action="/admin/reservas/${r.id}/siba"><button>Marcar como comunicado</button></form>`}`
        : html`<p>Sem hóspedes estrangeiros registados.</p>`}
    </section>

    <section class="cartao" id="fatura">
      <h2>Fatura-recibo</h2>
      ${f
        ? html`<dl><dt>Cliente</dt><dd>${f.nome}</dd><dt>NIF / ID</dt><dd>${f.nif} (${f.pais})</dd>
            ${f.morada ? html`<dt>Morada</dt><dd>${f.morada}, ${f.codigo_postal ?? ""} ${f.cidade ?? ""}</dd>` : ""}
            ${f.email ? html`<dt>Email</dt><dd>${f.email}</dd>` : ""}
            <dt>Alojamento (${alojamento.regime_iva === "isento" ? "isento de IVA" : `IVA ${alojamento.regime_iva}% incluído`})</dt><dd>${euros(r.valor_total_cents)}</dd>
            ${cobraTmt(regras) ? html`<dt>Taxa municipal turística (não sujeita a IVA)</dt><dd>${euros(tmt.valorCents)}</dd>` : ""}</dl>`
        : html`<p>À espera dos dados de faturação do hóspede.</p>`}
      ${faturacao.erro ? html`<p class="aviso">A fatura não foi emitida: ${faturacao.erro}</p>` : ""}
      ${faturacao.aviso ? html`<p class="aviso">${faturacao.aviso}</p>` : ""}
      ${r.fatura_emitida_em
        ? html`<div class="botoes"><span>✅ Fatura ${r.fatura_numero} emitida em ${dataPt(r.fatura_emitida_em)}${r.fatura_programa ? ` no ${NOMES_PROGRAMA[r.fatura_programa as Programa] ?? r.fatura_programa}` : ""}</span>
            ${anular(`/admin/reservas/${r.id}/fatura/anular`, r.fatura_programa
              ? `Desligar esta fatura da reserva? A fatura continua emitida no ${NOMES_PROGRAMA[r.fatura_programa as Programa] ?? r.fatura_programa}: se estiver errada, anule-a lá (nota de crédito).`
              : "Anular a marcação de fatura emitida? (Só no bookgest.)")}</div>
          ${r.fatura_pdf ? html`<p><a href="${r.fatura_pdf}" target="_blank" rel="noopener">Ver a fatura (PDF)</a></p>` : ""}`
        : html`${r.fatura_externa_id && r.fatura_programa === "invoicexpress"
            ? html`<p class="nota">Fatura criada em rascunho no InvoiceXpress. Finalize-a lá e registe o número abaixo, ou emita daqui para a finalizar.</p>`
            : ""}
          ${f && faturacao.programa && r.valor_total_cents
            ? html`<form method="post" action="/admin/reservas/${r.id}/fatura/emitir"
                onsubmit="this.querySelector('button').disabled = true; this.querySelector('button').textContent = 'A emitir…'">
                <button>${faturacao.teste ? "Emitir fatura de teste" : "Emitir fatura"} no ${NOMES_PROGRAMA[faturacao.programa]}</button></form>`
            : ""}
          ${f && faturacao.programa && !r.valor_total_cents ? html`<p class="nota">Indique o valor pago em Valores para poder emitir a fatura.</p>` : ""}
          ${f ? html`<p><a class="${faturacao.programa ? "" : "botao"}" href="/admin/reservas/${r.id}/fatura/portal">Preparar no Portal das Finanças</a></p>` : ""}
          ${f && !faturacao.programa ? html`<p class="nota">Tem programa de faturação? <a href="/admin/definicoes/faturacao">Ligue-o</a> para emitir com um clique.</p>` : ""}
          <form method="post" action="/admin/reservas/${r.id}/fatura" class="linha">
            <input name="fatura_numero" placeholder="N.º da fatura" required><button class="secundario">Marcar como emitida</button></form>`}
    </section>

    ${cobraTmt(regras)
      ? html`<section class="cartao" id="tmt">
      <h2>Taxa turística</h2>
      <p>Devida: <strong>${euros(tmt.valorCents)}</strong> (${tmt.hospedesTributaveis} hóspede(s) × ${tmt.noites} noite(s) × ${euros(regras.valorPorNoiteCents)})<br>
        Dormidas: ${tmt.dormidasTotais} totais · ${tmt.dormidasTributaveis} tributáveis ·
        ${regras.maxNoites ? html`${tmt.dormidasAcimaLimite} não sujeitas (além de ${regras.maxNoites} noites) · ` : ""}${tmt.dormidasMenores} isentas (menores)
        ${hospedes.length < r.n_hospedes ? html`<br><small>Provisório: faltam hóspedes.</small>` : ""}</p>
      <p>Cobrada pela plataforma: ${r.tmt_cobrada_cents == null ? "—" : euros(r.tmt_cobrada_cents)}</p>
    </section>`
      : ""}

    <section class="cartao" id="valores">
      <h2>Valores</h2>
      <form method="post" action="/admin/reservas/${r.id}/valores">
        <label>Valor total pago pelo hóspede (€, sem taxa turística)
          <input name="valor_total" inputmode="decimal" value="${centsParaInput(r.valor_total_cents)}"></label>
        ${r.uid_externo ? "" : campoOrigem(r.origem)}
        <label>Comissão da plataforma (€) <input name="comissao" inputmode="decimal" value="${centsParaInput(r.comissao_cents)}"></label>
        <label>Taxa turística cobrada pela plataforma (€)
          <input name="tmt_cobrada" inputmode="decimal" value="${r.tmt_cobrada_cents == null ? "" : centsParaInput(r.tmt_cobrada_cents)}"></label>
        <button>Guardar</button>
      </form>
      ${r.cancelada
        ? ""
        : html`<form method="post" action="/admin/reservas/${r.id}/cancelar" onsubmit="return confirm('Cancelar esta reserva?')">
            <button class="perigo">Cancelar reserva</button></form>`}
    </section>
    ` : ""}
  `, { admin: gestor ? true : "equipa", seccao: "reservas", voltar: "/admin/reservas" });
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
              ? html`<span>✅ Declarado ${dataPt(d.declarado_em)}</span>${anular(`/admin/tmt/${a.id}/${mes}/declarado/anular`, "Anular a marcação de declarado? (Só no bookgest: nada é enviado à câmara.)")}`
              : html`<form method="post" action="/admin/tmt/${a.id}/${mes}/declarado"><button>Declarado (até ${dataPt(prazos.declarar)})</button></form>`}
            ${d?.pago_em
              ? html`<span>✅ Pago ${dataPt(d.pago_em)}</span>${anular(`/admin/tmt/${a.id}/${mes}/pago/anular`, "Anular a marcação de pago? (Só no bookgest.)")}`
              : html`<form method="post" action="/admin/tmt/${a.id}/${mes}/pago"><button>Pago (até ${dataPt(prazos.pagar)})</button></form>`}
          </div>
        </section>`;
      })}`;
    })}`, { admin: true, seccao: "tmt" });
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
    ${SCRIPT_REDIMENSIONAR}`, { admin: true, seccao: "alojamentos", voltar: `/admin/alojamentos/${a.id}` });
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

export function paginaConfigurar(erro?: string, codigo?: string, bloqueado = false) {
  return pagina("Bem-vindo", html`<h1>Bem-vindo ao bookgest</h1>
    ${bloqueado ? "" : html`<p>Crie a sua conta de gestor. A seguir, crie o seu primeiro alojamento.</p>`}
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    ${bloqueado ? "" : html`<form method="post" action="/configurar">
      ${codigo ? html`<input type="hidden" name="t" value="${codigo}">` : ""}
      <label>Nome <input name="nome" autocomplete="name"></label>
      <label>Email <input type="email" name="email" required autocomplete="username"></label>
      ${camposNovaSenha()}
      <button type="submit">Continuar</button>
    </form>`}`);
}

export function paginaCodigos(codigos: string[], opcoes: { primeiraVez: boolean }) {
  return pagina("Códigos de recuperação", html`<h1>Códigos de recuperação</h1>
    <p>Se se esquecer da palavra-passe, pode entrar com um destes códigos. Cada código só serve uma vez.</p>
    <p class="aviso"><strong>Guarde-os agora</strong> (por exemplo num gestor de palavras-passe ou impressos):
      não voltam a ser mostrados${opcoes.primeiraVez ? "" : " e os códigos anteriores deixaram de funcionar"}.</p>
    <ol class="codigos">${codigos.map((c) => html`<li><code>${c}</code></li>`)}</ol>
    <div class="botoes">
      <button type="button" data-texto="${codigos.join("\n")}" onclick="navigator.clipboard.writeText(this.dataset.texto).then(() => this.textContent = 'Copiados ✓')">Copiar</button>
      <a class="botao" href="${opcoes.primeiraVez ? "/admin" : "/admin/conta"}">Já os guardei</a>
    </div>`, { admin: opcoes.primeiraVez ? undefined : true, seccao: "conta", voltar: opcoes.primeiraVez ? undefined : "/admin/conta" });
}

export function paginaRecuperar(opcoes: { enviado?: boolean; erroEmail?: string; erroCodigo?: string } = {}) {
  return pagina("Recuperar acesso", html`<h1>Recuperar acesso</h1>
    <section class="cartao">
      <h2>Receber um link por email</h2>
      ${opcoes.enviado
        ? html`<p>✅ Se o email pertencer a um utilizador, enviámos um link (válido durante 1 hora).</p>
            <p class="aviso">Abra o link <strong>neste browser e neste dispositivo</strong>: por segurança, não funciona noutro.
              Se o email abrir o link dentro da app de email, use "Abrir no browser".</p>`
        : html`${opcoes.erroEmail ? html`<p class="erro">${opcoes.erroEmail}</p>` : ""}
            <form method="post" action="/recuperar/email">
              <label>Email <input type="email" name="email" required autocomplete="username"></label>
              <button type="submit">Enviar link</button>
            </form>`}
    </section>
    <details class="cartao" ${opcoes.erroCodigo ? "open" : ""}>
      <summary>Gestores: usar um código de recuperação</summary>
      ${opcoes.erroCodigo ? html`<p class="erro">${opcoes.erroCodigo}</p>` : ""}
      <form method="post" action="/recuperar">
        <label>Email <input type="email" name="email" required autocomplete="username"></label>
        <label>Código de recuperação <input name="codigo" required autocapitalize="characters" autocomplete="off" placeholder="XXXXX-XXXXX"></label>
        ${camposNovaSenha()}
        <button type="submit">Definir palavra-passe</button>
      </form>
    </details>
    <p class="nota">Equipa sem acesso ao email: peça a um gestor que lhe defina uma nova palavra-passe.</p>
    <p class="nota"><a href="/login">Voltar</a></p>`);
}

export function paginaNovaSenhaEmail(token: string, problema?: "invalido" | "outro_navegador", erro?: string) {
  if (problema) {
    return pagina("Recuperar acesso", html`<h1>Link sem efeito</h1>
      <p>${problema === "outro_navegador"
        ? "Este link tem de ser aberto no mesmo browser e dispositivo onde pediu a recuperação (e só o link mais recente funciona)."
        : "O link expirou ou já foi usado."}</p>
      <p><a class="botao" href="/recuperar">Pedir novo link</a></p>`);
  }
  return pagina("Nova palavra-passe", html`<h1>Nova palavra-passe</h1>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <form method="post" action="/recuperar/${token}">
      ${camposNovaSenha()}
      <button type="submit">Guardar e entrar</button>
    </form>`);
}

export function paginaSemAcesso() {
  return pagina("Sem acesso", html`<h1>Sem acesso</h1>
    <p>Esta página é só para gestores. <a href="/admin">Voltar ao painel</a></p>`, { admin: "equipa" });
}

const NOMES_PAPEL: Record<Papel, string> = { gestor: "Gestor", equipa: "Equipa" };

export function paginaConta(u: Utilizador, codigos: number | null, opcoes: { erro?: string; ok?: string }) {
  return pagina("Conta", html`<h1>A minha conta</h1>
    ${opcoes.ok ? html`<p>✅ ${opcoes.ok}</p>` : ""}
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <section class="cartao">
      <h2>Dados</h2>
      <p class="nota">${NOMES_PAPEL[u.papel]}</p>
      <form method="post" action="/admin/conta/dados">
        <label>Nome <input name="nome" value="${u.nome ?? ""}" autocomplete="name"></label>
        <label>Email <input type="email" name="email" required value="${u.email}" autocomplete="username"></label>
        <button type="submit">Guardar</button>
      </form>
    </section>
    <section class="cartao">
      <h2>Palavra-passe</h2>
      <form method="post" action="/admin/conta/senha">
        <label>Palavra-passe atual <input type="password" name="atual" required autocomplete="current-password"></label>
        ${camposNovaSenha()}
        <button type="submit">Alterar</button>
      </form>
    </section>
    ${codigos != null
      ? html`<section class="cartao">
          <h2>Códigos de recuperação</h2>
          <p class="${codigos <= 2 ? "erro" : ""}">${codigos} de ${N_CODIGOS} por usar.</p>
          <form method="post" action="/admin/conta/codigos" onsubmit="return confirm('Os códigos atuais deixam de funcionar. Continuar?')">
            <label>Palavra-passe atual <input type="password" name="atual" required autocomplete="current-password"></label>
            <button type="submit">Gerar novos códigos</button>
          </form>
        </section>`
      : ""}
    <form method="post" action="/logout"><button class="secundario">Terminar sessão</button></form>`, { admin: u.papel === "gestor" ? true : "equipa", seccao: "conta" });
}

export function paginaUtilizadores(lista: Utilizador[], meuId: number, opcoes: { erro?: string; ok?: string }) {
  const linha = (u: Utilizador) => html`<section class="cartao">
    <h2>${u.nome || u.email}${u.id === meuId ? " (eu)" : ""}</h2>
    <p>${u.email} · ${NOMES_PAPEL[u.papel]}${u.ativo ? "" : html` · <strong class="erro">desativado</strong>`}<br>
      <small>Último acesso: ${u.ultimo_acesso ? dataPt(u.ultimo_acesso) : "nunca"}</small></p>
    ${u.id === meuId
      ? html`<p class="nota">A sua conta altera-se em <a href="/admin/conta">Conta</a>.</p>`
      : html`
        <form method="post" action="/admin/utilizadores/${u.id}/papel" class="linha">
          <select name="papel">${(["equipa", "gestor"] as const).map((p) => html`<option value="${p}" ${u.papel === p ? "selected" : ""}>${NOMES_PAPEL[p]}</option>`)}</select>
          <button>Mudar papel</button></form>
        <form method="post" action="/admin/utilizadores/${u.id}/senha" class="linha">
          <input type="text" name="senha" required minlength="${SENHA_MINIMA}" placeholder="Nova palavra-passe" autocomplete="off">
          <button>Definir</button></form>
        <form method="post" action="/admin/utilizadores/${u.id}/${u.ativo ? "desativar" : "reativar"}">
          <button class="${u.ativo ? "perigo" : ""}">${u.ativo ? "Desativar" : "Reativar"}</button></form>`}
  </section>`;
  return pagina("Utilizadores", html`<h1>Utilizadores</h1>
    <p class="nota"><strong>Gestor</strong>: acesso total. <strong>Equipa</strong>: vê e cria reservas e envia o link de check-in,
      sem documentos dos hóspedes, dados de faturação, valores, taxa turística nem configuração.</p>
    ${opcoes.ok ? html`<p>✅ ${opcoes.ok}</p>` : ""}
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    ${lista.map(linha)}
    <section class="cartao">
      <h2>Novo utilizador</h2>
      <form method="post" action="/admin/utilizadores">
        <label>Nome <input name="nome"></label>
        <label>Email <input type="email" name="email" required></label>
        <label>Papel <select name="papel"><option value="equipa">Equipa</option><option value="gestor">Gestor</option></select></label>
        <label>Palavra-passe inicial <input type="text" name="senha" required minlength="${SENHA_MINIMA}" autocomplete="off"></label>
        <p class="nota">Dê-lhe esta palavra-passe; depois pode mudá-la em "Conta".</p>
        <button type="submit">Criar</button>
      </form>
    </section>`, { admin: true, seccao: "utilizadores" });
}

const NOMES_ESTADO_LICENCA = { ativa: "ativa", pagamento_em_atraso: "pagamento em atraso", inativa: "inativa", desconhecida: "não reconhecida" };

export function paginaReservasBloqueadas(papel: Papel) {
  return pagina("Reservas suspensas", html`<h1>Reservas novas suspensas</h1>
    <p>A licença do bookgest está inativa (ou há mais alojamentos ativos do que os incluídos) há mais de 14 dias.
      As reservas existentes, os links de check-in já enviados e todos os dados continuam disponíveis.</p>
    ${papel === "gestor" ? html`<p><a class="botao" href="/admin/definicoes">Ver a licença</a></p>` : html`<p>Fale com o gestor.</p>`}`,
  { admin: papel === "gestor" ? true : "equipa", seccao: "reservas" });
}

export function paginaDefinicoes(opcoes: {
  erro?: string;
  licenca: { chave: string | null; estado: EstadoGuardado | null; erro: string | null; aviso: string | null; linkAssinar: string | null };
  versao: { atual: string; automatica: boolean; ultima: { em: string; versao: string; erro?: string } | null };
}) {
  const v = opcoes.versao;
  const { chave, estado, erro, aviso } = opcoes.licenca;
  return pagina("Definições", html`<h1>Definições</h1>
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <section class="cartao">
      <h2>Licença</h2>
      ${estado
        ? html`<p>Estado: <strong>${NOMES_ESTADO_LICENCA[estado.estado]}</strong> · ${estado.alojamentosPagos} alojamento(s) incluído(s)<br>
            <small>Verificada em ${dataPt(estado.verificadoEm)}</small></p>`
        : chave ? html`<p class="nota">Ainda não foi possível verificar a licença.</p>` : ""}
      ${chave && erro ? html`<p class="nota">Última tentativa falhou: ${erro}</p>` : ""}
      ${aviso ? html`<p class="erro">${aviso}</p>` : ""}
      ${opcoes.licenca.linkAssinar && estado && (estado.fimTeste || estado.estado === "inativa")
        ? html`<p><a class="botao" href="${opcoes.licenca.linkAssinar}" target="_blank" rel="noopener">Subscrever</a></p>`
        : opcoes.licenca.linkAssinar && estado
        ? html`<p><a class="botao secundario" href="${opcoes.licenca.linkAssinar}" target="_blank" rel="noopener">Alterar o n.º de alojamentos</a></p>`
        : ""}
      <form method="post" action="/admin/definicoes/licenca">
        <label>Chave de licença <input name="chave" required value="${chave ?? ""}" placeholder="BG-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters"></label>
        <button type="submit">Guardar e verificar</button>
      </form>
      <p class="nota">A sua instalação só envia ao bookgest a chave, a versão e o número de alojamentos ativos.</p>
    </section>
    <section class="cartao">
      <h2>Versão</h2>
      <p>bookgest ${v.atual} · ${v.automatica ? "atualizações automáticas (todos os dias)" : "atualizada pelo fornecedor"}</p>
      ${v.ultima
        ? html`<p class="${v.ultima.erro ? "erro" : "nota"}">${v.ultima.erro
            ? `A atualização para a ${v.ultima.versao} falhou em ${dataPt(v.ultima.em)}: ${v.ultima.erro}`
            : `Atualizada para a ${v.ultima.versao} em ${dataPt(v.ultima.em)}.`}</p>`
        : ""}
      ${v.automatica ? html`<form method="post" action="/admin/definicoes/atualizar"><button>Procurar atualizações agora</button></form>` : ""}
    </section>`, { admin: true, seccao: "definicoes" });
}

// ---------- Alojamentos ----------

// limite: alojamentos ativos incluídos na licença (null = sem licença verificada).
export function paginaAlojamentos(alojamentos: Alojamento[], opcoes: { limite?: number | null; erro?: string } = {}) {
  const linha = (a: Alojamento) => html`<li><a href="/admin/alojamentos/${a.id}">
      <strong>${a.nome}</strong>${a.ativo ? "" : " (arquivado)"}
      <span class="prazo">${[a.concelho, a.registo_al ? `AL ${a.registo_al}` : ""].filter(Boolean).join(" · ") || "—"}</span></a></li>`;
  const ativos = alojamentos.filter((a) => a.ativo).length;
  const cheio = opcoes.limite != null && ativos >= opcoes.limite;
  return pagina("Alojamentos", html`<h1>Alojamentos</h1>
    ${opcoes.erro ? html`<p class="aviso">${opcoes.erro}</p>` : ""}
    <ul class="lista">${alojamentos.map(linha)}</ul>
    ${opcoes.limite != null ? html`<p class="nota">A sua licença inclui ${opcoes.limite} alojamento(s) ativo(s): está a usar ${ativos}.</p>` : ""}
    ${cheio
      ? html`<p class="nota">Para acrescentar outro alojamento, aumente o número de alojamentos da assinatura em
          <a href="/admin/definicoes">Definições → Licença</a>, ou arquive um alojamento.</p>`
      : html`<a class="botao" href="/admin/alojamentos/novo">+ Novo alojamento</a>`}`, { admin: true, seccao: "alojamentos" });
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
  opcoes: { primeiro?: boolean; erro?: string; guardado?: boolean; codigoSugerido?: string; calendarios?: Calendario[]; reservas?: number } = {},
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
      <section class="cartao">
        <h2>Faturação</h2>
        <label>Regime de IVA
          <select name="regime_iva">${REGIMES_IVA.map((x) => html`<option value="${x.valor}"${(a?.regime_iva ?? "6") === x.valor ? " selected" : ""}>${x.nome}</option>`)}</select></label>
        <p class="nota">Como está registado nas Finanças. Usado para preparar a fatura-recibo de cada reserva.</p>
      </section>
      <button type="submit">${a ? "Guardar" : "Criar alojamento"}</button>
    </form>
    ${a
      ? html`<form method="post" action="/admin/alojamentos/${a.id}/${a.ativo ? "arquivar" : "reativar"}"
          ${a.ativo ? html`onsubmit="return confirm('Arquivar este alojamento? Deixa de aparecer nas novas reservas; os dados são conservados.')"` : ""}>
          <button class="${a.ativo ? "perigo" : ""}">${a.ativo ? "Arquivar alojamento" : "Reativar alojamento"}</button></form>
        ${opcoes.reservas === 0
          ? html`<form method="post" action="/admin/alojamentos/${a.id}/apagar"
              onsubmit="return confirm('Apagar este alojamento de vez? Não tem reservas; as instruções de chegada e os calendários ligados também são apagados.')">
              <button class="perigo">Apagar alojamento</button></form>
            <p class="nota">Pode apagar porque não tem reservas. Um alojamento com reservas só pode ser arquivado.</p>`
          : ""}`
      : ""}
    ${a ? seccaoCalendarios(a, opcoes.calendarios ?? []) : ""}
    ${SCRIPT_CONCELHO}`, { admin: true, seccao: "alojamentos", voltar: "/admin/alojamentos" });
}

// ---------- Calendários (importação de reservas) ----------

function seccaoCalendarios(a: Alojamento, calendarios: Calendario[]) {
  return html`<section class="cartao" id="calendarios">
    <h2>Importar reservas (Booking, Airbnb)</h2>
    <p class="nota">As reservas entram sozinhas, de hora a hora, a partir do calendário de cada plataforma. O calendário só traz as
      datas: o nome e o n.º de hóspedes completam-se depois na reserva.</p>
    ${calendarios.length
      ? html`<ul class="lista">${calendarios.map((cal) => html`<li>
          <strong>${NOMES_PLATAFORMA[cal.plataforma]}</strong>
          <span class="prazo">${cal.erro
            ? html`<span class="erro">Erro: ${cal.erro}</span>`
            : cal.ultima_sincronizacao ? `Sincronizado em ${dataPt(cal.ultima_sincronizacao)}` : "Ainda não sincronizado"}</span>
          <form method="post" action="/admin/alojamentos/${a.id}/calendarios/${cal.id}/apagar" onsubmit="return confirm('Deixar de importar deste calendário? As reservas já importadas mantêm-se.')">
            <button class="perigo">Remover</button></form></li>`)}</ul>
        <form method="post" action="/admin/alojamentos/${a.id}/calendarios/sincronizar"><button>Sincronizar agora</button></form>`
      : ""}
    <form method="post" action="/admin/alojamentos/${a.id}/calendarios">
      <label>Plataforma <select name="plataforma" required>
        <option value="booking">Booking</option><option value="airbnb">Airbnb</option><option value="outra">Outra</option></select></label>
      <label>Link do calendário (iCal) <input name="url" required inputmode="url" placeholder="https://…"></label>
      <button type="submit">Adicionar</button>
    </form>
    <details><summary>Onde encontro o link?</summary>
      <p><strong>Booking:</strong> Extranet → Tarifas e disponibilidade → Sincronizar calendários → Exportar calendário → copiar o link.</p>
      <p><strong>Airbnb:</strong> Anúncios → o seu anúncio → Disponibilidade → Ligar calendários → Exportar calendário → copiar o link.</p>
    </details>
  </section>`;
}

// ---------- Emails de reserva ----------

const NOMES_ESTADO_EMAIL: Record<string, string> = { associado: "✅ associado", por_associar: "⚠️ por associar", confirmacao: "📩 confirmação", arquivado: "arquivado" };

export function paginaEmails(o: { endereco: string | null; privado: boolean; emails: EmailRecebido[]; erro: string | null; verificado?: boolean }) {
  const linha = (e: EmailRecebido) => {
    const d = JSON.parse(e.dados) as DadosEmailReserva;
    const criar = `/admin/reservas/nova?${new URLSearchParams({ nome: d.nome ?? "", checkin: d.checkin ?? "", checkout: d.checkout ?? "", n: String(d.hospedes ?? ""), ref: d.codigo ?? "", origem: d.plataforma === "desconhecida" ? "" : d.plataforma })}`;
    return html`<section class="cartao">
      <p><strong>${d.assunto || "(sem assunto)"}</strong><br>
        <small>${dataPt(e.recebido_em)} · ${d.plataforma === "desconhecida" ? "" : `${d.plataforma === "airbnb" ? "Airbnb" : "Booking"} · `}${NOMES_ESTADO_EMAIL[e.estado] ?? e.estado}</small></p>
      ${e.estado === "confirmacao"
        ? html`<p>O Gmail pede para confirmar o reencaminhamento para o bookgest.
            ${d.confirmacao?.codigo ? html`Código: <strong>${d.confirmacao.codigo}</strong>.` : ""}
            ${d.confirmacao?.link ? html`<a href="${d.confirmacao.link}" target="_blank" rel="noopener">Confirmar no Gmail</a>` : ""}</p>`
        : html`<p class="nota">${[d.nome, d.checkin && d.checkout ? `${dataPt(d.checkin)} → ${dataPt(d.checkout)}` : "", d.hospedes ? `${d.hospedes} hóspede(s)` : "",
            d.codigo ?? "", d.totalCents ? euros(d.totalCents) : ""].filter(Boolean).join(" · ") || (d.texto ? d.texto.slice(0, 300) : "Sem dados reconhecidos")}</p>`}
      <div class="botoes">
        ${e.reserva_id ? html`<a class="botao" href="/admin/reservas/${e.reserva_id}">Ver reserva</a>` : ""}
        ${e.estado === "por_associar" && d.tipo !== "cancelada" ? html`<a class="botao" href="${criar}">Criar reserva</a>` : ""}
        ${e.estado === "por_associar" || e.estado === "confirmacao"
          ? html`<form method="post" action="/admin/emails/${e.id}/arquivar"><button>${e.estado === "confirmacao" ? "Já confirmei" : "Arquivar"}</button></form>`
          : ""}
      </div>
    </section>`;
  };
  return pagina("Emails de reserva", html`<h1>Emails de reserva</h1>
    ${o.endereco
      ? html`<section class="cartao">
          <p>Reencaminhe para este endereço os emails de reserva do Booking e do Airbnb. O bookgest completa as reservas
            (nome, hóspedes, valores) ou cria-as.</p>
          <p class="chave"><code>${o.endereco}</code></p>
          <button type="button" data-texto="${o.endereco}" onclick="navigator.clipboard.writeText(this.dataset.texto).then(() => this.textContent = 'Copiado ✓')">Copiar</button>
          <details><summary>Como configurar</summary>
            <p><strong>Booking:</strong> Extranet → Propriedade → Detalhes de contacto → acrescentar este endereço aos contactos que recebem as reservas.</p>
            <p><strong>Airbnb</strong> (envia só para o email da conta): no Gmail → Definições → Filtros → criar filtro com
              <em>De: automated@airbnb.com</em> → Reencaminhar para este endereço. O Gmail pede confirmação: o código aparece
              aqui em baixo uns minutos depois. No Outlook: Regras → Reencaminhar.</p>
          </details>
          ${o.privado
            ? html`<p class="nota">ℹ️ A sua instalação está numa conta Cloudflare sua: ao reencaminhar, os emails de reserva passam
                pelos servidores do bookgest, que extraem só os dados da reserva e não guardam o email.</p>`
            : ""}
        </section>`
      : html`<p class="nota">O endereço de reencaminhamento ainda não está disponível (precisa da licença ativa e verificada).</p>`}
    ${o.erro ? html`<p class="erro">Última verificação falhou: ${o.erro}</p>` : ""}
    ${o.verificado ? html`<p>✅ Verificado.</p>` : ""}
    <form method="post" action="/admin/emails/verificar"><button>Verificar emails agora</button></form>
    <h2>Recebidos</h2>
    ${o.emails.length ? o.emails.map(linha) : html`<p>Ainda não chegou nenhum email.</p>`}`, { admin: true, seccao: "emails" });
}
