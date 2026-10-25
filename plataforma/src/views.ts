import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { estadoLicenca, type Cliente, type Licenca } from "./licencas";
import type { Fatura } from "./faturas";

type Conteudo = HtmlEscapedString | Promise<HtmlEscapedString>;

function pagina(titulo: string, corpo: Conteudo, opcoes: { gestao?: boolean; descricao?: string; portal?: string | null } = {}) {
  return html`<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0f5c4d">
  <title>${titulo}</title>
  ${opcoes.descricao ? html`<meta name="description" content="${opcoes.descricao}">` : ""}
  ${opcoes.gestao ? html`<meta name="robots" content="noindex">` : ""}
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/site.css">
</head>
<body>
  <header><a href="${opcoes.gestao ? "/gestao" : "/"}" class="marca">🏠 bookgest${opcoes.gestao ? " · gestão" : ""}</a>
    ${opcoes.gestao
      ? html`<nav><a href="/gestao">Licenças</a><a href="/gestao/faturas">Faturas</a></nav>`
      : html`<nav><a href="/#precos">Preços</a>${opcoes.portal ? html`<a href="${opcoes.portal}">A minha assinatura</a>` : ""}</nav>`}</header>
  <main>${corpo}</main>
</body>
</html>`;
}

const euros = (cents: number) => (cents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

const dataPt = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

// ---------- Site público ----------

export interface DadosSite {
  precoCents: number | null; // por alojamento e mês, IVA incluído
  vendasAbertas: boolean;
  contacto: string | null;
  portal: string | null; // link de acesso ao portal do cliente do Stripe
}

const FUNCIONALIDADES = [
  ["Check-in online", "O hóspede preenche os dados no telemóvel, em português ou inglês, antes de chegar."],
  ["Código do cofre no momento certo", "O código das chaves só aparece depois do formulário preenchido e perto da hora de entrada, com as suas fotos de como chegar."],
  ["Prazos sempre à vista", "Comunicação ao SIBA, fatura-recibo e taxa turística: um painel ordenado pelo que vence primeiro."],
  ["Taxa turística calculada", "Calcula o valor devido por estadia e o resumo mensal para declarar à câmara, e avisa se o Booking cobrou mal."],
  ["Vários alojamentos", "Cada alojamento com o seu código, horários, instruções e regras do concelho."],
  ["No bolso", "Funciona no telemóvel como uma app, sem instalar nada da loja."],
];

export function paginaInicio(d: DadosSite) {
  return pagina("bookgest — gestão de Alojamento Local", html`
    <section class="destaque">
      <h1>O seu Alojamento Local em ordem, sem papelada.</h1>
      <p>Check-in online, entrega do código das chaves e todos os prazos legais num só sítio —
        feito para quem gere um ou poucos alojamentos.</p>
      <a class="botao grande" href="#precos">Ver preço</a>
    </section>

    <section class="grelha">
      ${FUNCIONALIDADES.map(([t, d]) => html`<div class="cartao"><h3>${t}</h3><p>${d}</p></div>`)}
    </section>

    <section class="cartao privacidade">
      <h2>🔒 Os dados dos seus hóspedes ficam consigo</h2>
      <p>O bookgest é instalado numa conta Cloudflare <strong>em seu nome</strong> (gratuita).
        Reservas, documentos e moradas dos hóspedes ficam aí guardados e nós <strong>não temos acesso</strong> a eles.</p>
      <p>Da sua instalação só recebemos a chave de licença, a versão e o número de alojamentos ativos.</p>
    </section>

    <section id="precos" class="cartao precos">
      <h2>Preço</h2>
      ${d.precoCents != null
        ? html`<p class="preco"><strong>${euros(d.precoCents)}</strong> por alojamento, por mês<br><small>IVA incluído · sem fidelização</small></p>`
        : html`<p class="preco">Preço em breve.</p>`}
      ${d.vendasAbertas && d.precoCents != null
        ? html`<form method="post" action="/comprar" class="linha">
            <label>Alojamentos <input type="number" name="alojamentos" min="1" max="50" value="1" required></label>
            <button type="submit">Começar</button>
          </form>
          <p class="nota">Pagamento seguro pelo Stripe. Pode alterar o número de alojamentos ou cancelar a qualquer momento.</p>`
        : html`<p>Estamos a abrir aos primeiros gestores.
            ${d.contacto ? html`<a href="mailto:${d.contacto}?subject=bookgest">Peça para experimentar</a>.` : ""}</p>`}
    </section>

    <section>
      <h2>Perguntas frequentes</h2>
      <details><summary>Preciso de conhecimentos técnicos?</summary>
        <p>Não. Ajudamos a criar a conta Cloudflare e a instalar o bookgest consigo.</p></details>
      <details><summary>Quanto custa a conta Cloudflare?</summary>
        <p>Nada: o plano gratuito chega para um pequeno gestor de Alojamento Local.</p></details>
      <details><summary>E se deixar de pagar?</summary>
        <p>Continua a poder consultar todos os seus dados — a lei obriga-o a guardá-los e nós nunca os bloqueamos.</p></details>
      <details><summary>Funciona com o Booking e o Airbnb?</summary>
        <p>Sim: regista cada reserva em segundos e envia o link de check-in ao hóspede por WhatsApp ou mensagem.</p></details>
    </section>
    ${d.contacto ? html`<footer>Contacto: <a href="mailto:${d.contacto}">${d.contacto}</a></footer>` : ""}
  `, { portal: d.portal, descricao: "Check-in online, código das chaves e prazos legais (SIBA, fatura, taxa turística) para pequenos gestores de Alojamento Local." });
}

export function paginaObrigado(chave: string | null, contacto: string | null, portal: string | null) {
  return pagina("Obrigado", html`<h1>Obrigado!</h1>
    ${chave
      ? html`<p>A sua assinatura está ativa. Esta é a sua chave de licença — guarde-a:</p>
        <p class="chave">${chave}</p>
        <p>Vamos contactá-lo por email para o ajudar a instalar o bookgest na sua conta Cloudflare.</p>`
      : html`<p>Estamos a confirmar o pagamento. Atualize esta página dentro de alguns segundos.</p>`}
    ${portal ? html`<p class="nota">Para alterar o número de alojamentos, o método de pagamento ou cancelar: <a href="${portal}">A minha assinatura</a>.</p>` : ""}
    ${contacto ? html`<p class="nota">Dúvidas: <a href="mailto:${contacto}">${contacto}</a></p>` : ""}`, { portal });
}

export function paginaMensagem(titulo: string, texto: string) {
  return pagina(titulo, html`<h1>${titulo}</h1><p>${texto}</p><p><a href="/">Voltar</a></p>`);
}

// ---------- Gestão (fornecedor) ----------

export function paginaEntrar(erro?: string) {
  return pagina("Entrar", html`<h1>Gestão</h1>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <form method="post" action="/gestao/entrar">
      <label>Palavra-passe <input type="password" name="password" required autofocus></label>
      <button type="submit">Entrar</button>
    </form>`, { gestao: true });
}

const NOMES_ESTADO = { ativa: "ativa", pagamento_em_atraso: "pagamento em atraso", inativa: "inativa", desconhecida: "desconhecida" };

export function paginaLicencas(linhas: { licenca: Licenca; cliente: Cliente | null }[], novaChave?: string) {
  return pagina("Licenças", html`<h1>Licenças</h1>
    ${novaChave ? html`<p>✅ Licença de cortesia criada:</p><p class="chave">${novaChave}</p>` : ""}
    <div class="tabela"><table>
      <tr><th>Chave</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Pagos</th><th>Ativos</th><th>Versão</th><th>Última comunicação</th><th></th></tr>
      ${linhas.map(({ licenca: l, cliente: c }) => {
        const estado = estadoLicenca(l);
        const excede = l.alojamentos_ativos != null && l.alojamentos_ativos > l.alojamentos_pagos;
        return html`<tr>
          <td><code>${l.chave}</code></td>
          <td>${c?.nome ?? ""}${c?.email ? html`<br><small>${c.email}</small>` : ""}${l.notas ? html`<br><small>${l.notas}</small>` : ""}</td>
          <td>${l.tipo}</td>
          <td class="${estado === "ativa" ? "" : "erro"}">${NOMES_ESTADO[estado]}</td>
          <td>${l.alojamentos_pagos}</td>
          <td class="${excede ? "erro" : ""}">${l.alojamentos_ativos ?? "—"}</td>
          <td>${l.versao ?? "—"}</td>
          <td>${dataPt(l.ultima_comunicacao)}</td>
          <td>${l.tipo === "cortesia"
            ? html`<form method="post" action="/gestao/licencas/${l.id}/${l.revogada ? "reativar" : "revogar"}">
                <button class="${l.revogada ? "" : "perigo"} pequeno">${l.revogada ? "Reativar" : "Revogar"}</button></form>
              ${l.ultima_comunicacao
                ? ""
                : html`<form method="post" action="/gestao/licencas/${l.id}/apagar" onsubmit="return confirm('Apagar esta licença?')">
                    <button class="perigo pequeno">Apagar</button></form>`}`
            : ""}</td>
        </tr>`;
      })}
    </table></div>
    <section class="cartao">
      <h2>Nova licença de cortesia</h2>
      <p class="nota">Para a sua própria instalação e para os gestores do piloto. Não é cobrada.</p>
      <form method="post" action="/gestao/licencas">
        <label>Alojamentos incluídos <input type="number" name="alojamentos" min="1" max="1000" value="1" required></label>
        <label>Notas (ex.: nome do gestor) <input name="notas"></label>
        <button type="submit">Criar</button>
      </form>
    </section>
    <form method="post" action="/gestao/sair"><button>Terminar sessão</button></form>`, { gestao: true });
}

const NOMES_FATURA = { por_emitir: "por emitir", emitida: "emitida", erro: "erro" };

export function paginaFaturas(linhas: { fatura: Fatura; cliente: Cliente | null }[], invoiceXpress: boolean) {
  return pagina("Faturas", html`<h1>Faturas</h1>
    <p class="nota">${invoiceXpress
      ? "As faturas-recibo são emitidas automaticamente no InvoiceXpress quando o Stripe confirma o pagamento."
      : "InvoiceXpress não configurado: emita cada fatura-recibo no seu programa certificado e registe aqui o número."}</p>
    <div class="tabela"><table>
      <tr><th>Pago em</th><th>Cliente</th><th>Valor</th><th>Alojamentos</th><th>Estado</th><th></th></tr>
      ${linhas.map(({ fatura: f, cliente: c }) => html`<tr>
        <td>${dataPt(f.pago_em)}</td>
        <td>${c?.nome ?? c?.email ?? "—"}${c?.nif ? html`<br><small>NIF ${c.nif}</small>` : ""}</td>
        <td>${euros(f.valor_cents)}</td>
        <td>${f.alojamentos}</td>
        <td class="${f.estado === "emitida" ? "" : "erro"}">${NOMES_FATURA[f.estado]}${f.numero ? html`<br><small>${f.numero}</small>` : ""}
          ${f.erro ? html`<br><small>${f.erro}</small>` : ""}</td>
        <td>${f.estado === "emitida"
          ? ""
          : html`${invoiceXpress ? html`<form method="post" action="/gestao/faturas/${f.id}/emitir"><button class="pequeno">Emitir</button></form>` : ""}
              <form method="post" action="/gestao/faturas/${f.id}/manual" class="linha">
                <input name="numero" placeholder="N.º emitida à mão" required><button class="pequeno">Registar</button></form>`}</td>
      </tr>`)}
    </table></div>`, { gestao: true });
}
