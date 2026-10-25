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
import { N_CODIGOS, type Papel, type Utilizador } from "../lib/utilizadores";
import { dataPt, pagina } from "./layout";

export function paginaLogin(opcoes: { erro?: string; legado?: boolean; email?: string } = {}) {
  return pagina("Entrar", html`<h1>Entrar</h1>
    ${opcoes.legado
      ? html`<p class="aviso">A entrada passa a ser com email. Indique o seu email e a palavra-passe de sempre:
          o email fica associado à sua conta de gestor.</p>`
      : ""}
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <form method="post" action="/login">
      <label>Email <input type="email" name="email" required autofocus autocomplete="username" value="${opcoes.email ?? ""}"></label>
      <label>Palavra-passe <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit">Entrar</button>
    </form>
    ${opcoes.legado ? "" : html`<p class="nota"><a href="/recuperar">Esqueci-me da palavra-passe</a></p>`}`);
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
  papel: Papel,
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
  `, { admin: papel === "gestor" ? true : "equipa" });
}

export function paginaNovaReserva(alojamentos: Alojamento[], papel: Papel) {
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
      ${papel === "gestor"
        ? html`<label>Valor total pago pelo hóspede (€, sem taxa turística)
            <input name="valor_total" inputmode="decimal" placeholder="0,00"></label>
          <label>Comissão Booking (€) <input name="comissao" inputmode="decimal" placeholder="0,00"></label>`
        : ""}
      <button type="submit">Criar</button>
    </form>`, { admin: papel === "gestor" ? true : "equipa" });
}

const NOMES_DOC: Record<string, string> = { P: "Passaporte", B: "Bilhete de identidade", O: "Outro" };

export function paginaReserva(
  rc: ReservaCompleta,
  alojamento: Alojamento,
  linkHospede: string,
  pendentes: Pendente[],
  agora: Date,
  papel: Papel,
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

  return pagina(r.nome_titular, html`
    <h1>${r.nome_titular}</h1>
    <p>${gestor ? html`<a href="/admin/alojamentos/${alojamento.id}">${alojamento.nome}</a>` : alojamento.nome} · ${dataPt(r.checkin)} → ${dataPt(r.checkout)} · ${r.n_hospedes} hóspede(s)
      ${r.ref_booking ? html` · ${r.origem === "airbnb" ? "Airbnb" : r.origem === "booking" || r.origem === "manual" ? "Booking" : "Ref."} ${r.ref_booking}` : ""}${r.cancelada ? html` · <strong>CANCELADA</strong>` : ""}</p>

    ${pendentes.length && gestor
      ? html`<ul class="pendentes">${pendentes.map((p) => html`<li class="${classePrazo(p.prazo, hoje)}">${p.descricao}
          ${p.prazo ? html`<span class="prazo">até ${dataPt(p.prazo)}</span>` : ""}</li>`)}</ul>`
      : ""}

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

    ${r.incompleta || r.origem !== "manual"
      ? html`<section class="cartao ${r.incompleta ? "aviso" : ""}">
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
    ` : ""}
  `, { admin: gestor ? true : "equipa" });
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
    </div>`, { admin: opcoes.primeiraVez ? undefined : true });
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
    <form method="post" action="/logout"><button>Terminar sessão</button></form>`, { admin: u.papel === "gestor" ? true : "equipa" });
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
    </section>`, { admin: true });
}

const NOMES_ESTADO_LICENCA = { ativa: "ativa", pagamento_em_atraso: "pagamento em atraso", inativa: "inativa", desconhecida: "não reconhecida" };

export function paginaReservasBloqueadas(papel: Papel) {
  return pagina("Reservas suspensas", html`<h1>Reservas novas suspensas</h1>
    <p>A licença do bookgest está inativa (ou há mais alojamentos ativos do que os incluídos) há mais de 14 dias.
      As reservas existentes, os links de check-in já enviados e todos os dados continuam disponíveis.</p>
    ${papel === "gestor" ? html`<p><a class="botao" href="/admin/definicoes">Ver a licença</a></p>` : html`<p>Fale com o gestor.</p>`}`,
  { admin: papel === "gestor" ? true : "equipa" });
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
    <ul class="lista">
      <li><a href="/admin/conta"><strong>A minha conta</strong><span class="prazo">Email, palavra-passe, códigos de recuperação</span></a></li>
      <li><a href="/admin/utilizadores"><strong>Utilizadores</strong><span class="prazo">Gestores e equipa com acesso ao painel</span></a></li>
    </ul>
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
    </section>`, { admin: true });
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
  opcoes: { primeiro?: boolean; erro?: string; guardado?: boolean; codigoSugerido?: string; calendarios?: Calendario[] } = {},
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
    ${a ? seccaoCalendarios(a, opcoes.calendarios ?? []) : ""}
    ${SCRIPT_CONCELHO}`, { admin: true });
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
