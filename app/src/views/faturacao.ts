// Definições → Faturação: ligação ao programa de faturação certificado do gestor.

import { html } from "hono/html";
import { type ConfigFaturacao, NOMES_PROGRAMA, type Programa } from "../lib/programas-faturacao";
import { icone, pagina } from "./layout";

const marcado = (v: boolean) => (v ? " checked" : "");

// form: o que foi submetido, para não se perder quando há um erro (os campos secretos nunca são repostos).
export function paginaFaturacao(cfg: ConfigFaturacao | null, opcoes: { erro?: string; ok?: string; form?: Record<string, string> } = {}) {
  const form = opcoes.form;
  const p = form ? form.programa ?? "" : cfg?.programa ?? "";
  const campo = (nome: string, guardado: string | null | undefined) => (form ? form[nome] ?? "" : guardado ?? "");
  const ix = cfg?.programa === "invoicexpress" ? cfg : null;
  const vendus = cfg?.programa === "vendus" ? cfg : null;
  const toc = cfg?.programa === "toconline" ? cfg : null;
  const guardada = (tem: boolean) => (tem ? "(guardada — deixe vazio para manter)" : "");
  const opcao = (v: Programa | "", t: string) => html`<option value="${v}"${p === v ? " selected" : ""}>${t}</option>`;

  return pagina("Faturação", html`
    <a class="voltar" href="/admin/definicoes">${icone("voltar", 18)}Definições</a>
    <h1>Faturação</h1>
    <p class="nota">Ligue o seu programa de faturação certificado para emitir a fatura-recibo de cada reserva com um clique.
      Sem programa ligado, o bookgest prepara os campos para copiar para o Portal das Finanças (gratuito).</p>
    ${opcoes.erro ? html`<p class="aviso">${opcoes.erro}</p>` : ""}
    ${opcoes.ok ? html`<p class="cartao">✅ ${opcoes.ok}</p>` : ""}

    <form method="post" action="/admin/definicoes/faturacao">
      <section class="cartao">
        <label>Programa de faturação
          <select name="programa" data-programa>
            ${opcao("", "Nenhum (Portal das Finanças)")}
            ${opcao("invoicexpress", "InvoiceXpress")}
            ${opcao("vendus", "Vendus")}
            ${opcao("toconline", "TOConline")}
          </select></label>
      </section>

      <section class="cartao" data-para="invoicexpress">
        <h2>InvoiceXpress</h2>
        <label>Nome da conta <input name="ix_conta" value="${campo("ix_conta", ix?.conta)}" placeholder="a-minha-empresa" autocapitalize="none" spellcheck="false"></label>
        <p class="nota">O que aparece antes de <strong>.app.invoicexpress.com</strong> no endereço da sua conta.</p>
        <label>Chave da API <input type="password" name="ix_api_key" autocomplete="off" placeholder="${guardada(!!ix)}"></label>
        <p class="nota">No InvoiceXpress: Definições → Conta → Integrações → API.</p>
        <label class="opcao"><input type="checkbox" name="ix_rascunho" value="1"${marcado(ix ? ix.rascunho : true)}>
          Criar em rascunho (confirmo e finalizo no InvoiceXpress)</label>
      </section>

      <section class="cartao" data-para="vendus">
        <h2>Vendus</h2>
        <label>Chave da API <input type="password" name="vendus_api_key" autocomplete="off" placeholder="${guardada(!!vendus)}"></label>
        <p class="nota">No Vendus: Conta → Integrações → API.</p>
        <label class="opcao"><input type="checkbox" name="vendus_teste" value="1"${marcado(vendus ? vendus.teste : true)}>
          Modo de teste (documentos sem valor fiscal, para experimentar)</label>
      </section>

      <section class="cartao" data-para="toconline">
        <h2>TOConline</h2>
        <p class="nota">No TOConline: Empresa → Configurações → <strong>Dados API</strong>. Copie os quatro valores.</p>
        <label>Client ID <input name="toc_client_id" value="${campo("toc_client_id", toc?.clientId)}" autocomplete="off" spellcheck="false"></label>
        <label>Client secret <input type="password" name="toc_client_secret" autocomplete="off" placeholder="${guardada(!!toc)}"></label>
        <label>Endereço OAuth (OAUTH_URL) <input name="toc_url_oauth" value="${campo("toc_url_oauth", toc?.urlOauth)}" inputmode="url" placeholder="https://"></label>
        <label>Endereço da API (API_URL) <input name="toc_url_api" value="${campo("toc_url_api", toc?.urlApi)}" inputmode="url" placeholder="https://"></label>
        <label>Série das faturas-recibo (opcional) <input name="toc_serie" value="${campo("toc_serie", toc?.serie)}" placeholder="Vazio = a série predefinida"></label>
        <p class="nota">Atenção: no TOConline a fatura fica logo finalizada ao ser emitida.</p>
      </section>

      <section class="cartao" data-para="invoicexpress vendus">
        <label class="opcao"><input type="checkbox" name="enviar_email" value="1"${marcado(ix?.enviarEmail ?? vendus?.enviarEmail ?? true)}>
          Enviar a fatura por email ao hóspede (quando indicou o email)</label>
      </section>

      <button type="submit">Guardar</button>
    </form>

    ${cfg
      ? html`<section class="cartao">
          <h2>Ligação</h2>
          <p>Ligado ao <strong>${NOMES_PROGRAMA[cfg.programa]}</strong>.</p>
          <div class="botoes">
            <form method="post" action="/admin/definicoes/faturacao/testar"><button class="secundario">Testar a ligação</button></form>
          </div>
          <p class="nota">Na primeira fatura, confirme no seu programa que o cliente, o IVA e a taxa turística ficaram como espera.</p>
        </section>`
      : ""}

    <script>
    (() => {
      const s = document.querySelector("[data-programa]");
      const mostrar = () => document.querySelectorAll("[data-para]").forEach((x) => { x.hidden = !x.dataset.para.split(" ").includes(s.value); });
      s.addEventListener("change", mostrar);
      mostrar();
    })();
    </script>
  `, { admin: true, seccao: "definicoes" });
}
