// Relatório mensal para o inquérito do INE (IPHH), pronto a transcrever para o WebInq.

import { html, raw } from "hono/html";
import { nomePais } from "../lib/faturacao";
import { DESCONHECIDO, MODALIDADES, type RelatorioIne } from "../lib/ine";
import type { Alojamento } from "../lib/tipos";
import { icone, nomeMes, pagina } from "./layout";

export interface RelatorioAlojamento {
  alojamento: Alojamento;
  relatorio: RelatorioIne;
  respondidoEm: string | null;
}

const nomeLinha = (pais: string) =>
  pais === "PT" ? "Residentes em Portugal" : pais === DESCONHECIDO ? "Sem dados (hóspedes por registar)" : nomePais(pais);

export function capacidadeIne(a: Alojamento): [string, string][] {
  const emQuartos = ["quartos", "hospedagem", "hostel"].includes(a.modalidade);
  return [
    ["Modalidade", MODALIDADES.find(([m]) => m === a.modalidade)?.[1] ?? a.modalidade],
    emQuartos ? ["Total de quartos disponíveis", String(a.quartos ?? "—")] : [`Apartamentos / moradias ${a.tipologia}`, "1"],
    ["Camas individuais", String(a.camas_individuais)],
    ["Camas de casal", String(a.camas_casal)],
  ];
}

const dataPt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function paginaIne(mes: string, meses: string[], lista: RelatorioAlojamento[]) {
  const anterior = meses[meses.indexOf(mes) + 1];
  const seguinte = meses[meses.indexOf(mes) - 1];
  const titulo = `${nomeMes(`${mes}-01`)} ${mes.slice(0, 4)}`;
  return pagina("INE", html`
    <div class="cabecalho">
      <div><p class="sobre">Inquérito mensal (IPHH) · responder no WebInq até dia 10</p><h1>INE · ${titulo}</h1></div>
      <div class="navegar">
        ${anterior ? html`<a href="/admin/ine?mes=${anterior}" aria-label="Mês anterior">${icone("voltar", 18)}</a>` : ""}
        ${seguinte ? html`<a href="/admin/ine?mes=${seguinte}" aria-label="Mês seguinte">${icone("seguinte", 18)}</a>` : ""}
      </div>
    </div>
    ${lista.length
      ? ""
      : html`<p class="aviso">Nenhum alojamento está marcado como respondendo ao INE. Ative em Alojamentos → Capacidade e INE.</p>`}
    ${lista.map(({ alojamento: a, relatorio: r, respondidoEm }) => html`<section class="cartao">
      <h2>${a.nome}</h2>
      ${r.hospedesSemDados
        ? html`<p class="aviso">${r.hospedesSemDados} hóspede(s) ainda sem país de residência (check-in por preencher). Complete antes de responder.</p>`
        : ""}
      ${r.semMovimento
        ? html`<p><strong>Sem movimento de hóspedes</strong> neste mês: no WebInq, assinale "não houve movimento de hóspedes" (a resposta continua obrigatória).</p>`
        : html`<h3>1. Permanência de hóspedes</h3>
          <table>
            <tr><th>País de residência</th><th>Entraram no mês</th><th>Dormiram no mês</th><th>Dormidas</th></tr>
            ${r.linhas.map((l) => html`<tr><td>${nomeLinha(l.pais)}${l.pais !== "PT" && l.pais !== DESCONHECIDO ? html` <small>${l.pais}</small>` : ""}</td>
              <td>${l.entraram || ""}</td><td>${l.dormiram}</td><td>${l.dormidas}</td></tr>`)}
            <tr><th>Total</th><th>${r.total.entraram}</th><th>${r.total.dormiram}</th><th>${r.total.dormidas}</th></tr>
          </table>
          <p class="nota">Deixe em branco os países sem hóspedes (o INE não aceita zeros).</p>
          <h3>2. Outros dados</h3>
          <dl>
            ${capacidadeIne(a).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}
            <dt>Utilizações no mês</dt><dd>${r.utilizacoes}</dd>
            <dt>Dias de abertura</dt><dd>${r.diasMes} <small>(se esteve fechado, ajuste)</small></dd>
            <dt>Volume de negócios total</dt><dd>${r.aposentoEuros} € <small>(sem IVA e sem taxa turística)</small></dd>
            <dt>do qual de aposento</dt><dd>${r.aposentoEuros} €</dd>
          </dl>`}
      <div class="botoes">
        <a class="botao secundario" href="/admin/ine.csv?mes=${mes}&alojamento=${a.id}">Descarregar CSV</a>
        <a class="botao secundario" href="https://webinq.ine.pt" target="_blank" rel="noopener">Abrir o WebInq</a>
      </div>
      ${respondidoEm
        ? html`<div class="botoes" style="margin-top: 8px"><span>✅ Respondido em ${dataPt(respondidoEm)}</span>
            <form method="post" action="/admin/ine/${a.id}/${mes}/anular" onsubmit="return confirm('Anular a marcação de respondido? (Só no bookgest.)')">
              <button class="ligacao">Anular</button></form></div>`
        : html`<form method="post" action="/admin/ine/${a.id}/${mes}/respondido"><button>Marcar como respondido</button></form>`}
    </section>`)}
    ${raw("")}
  `, { admin: true, seccao: "ine" });
}
