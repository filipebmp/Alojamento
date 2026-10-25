// Ajudante para emitir a fatura-recibo no Portal das Finanças: os campos pela ordem do formulário, cada um com "Copiar".

import { html } from "hono/html";
import type { FaturaPortal } from "../lib/faturacao";
import type { Reserva } from "../lib/tipos";
import { icone, pagina } from "./layout";

// Valores como o Portal os aceita: vírgula decimal, sem símbolo nem separador de milhares.
const valor = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const euros = (cents: number) => `${valor(cents)} €`;

function campo(nome: string, texto: string, nota?: string) {
  return html`<div class="campo-copiar">
    <span class="texto"><span>${nome}</span><strong>${texto}</strong>${nota ? html`<small>${nota}</small>` : ""}</span>
    <button type="button" class="secundario" data-copiar="${texto}" aria-label="Copiar ${nome}">${icone("copiar", 16)}Copiar</button>
  </div>`;
}

const fixo = (nome: string, texto: string, nota?: string) => html`<div class="campo-copiar">
  <span class="texto"><span>${nome}</span><strong>${texto}</strong>${nota ? html`<small>${nota}</small>` : ""}</span></div>`;

const SCRIPT_COPIAR = html`<script>
document.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.copiar); } catch { return; }
  document.querySelectorAll(".copiado").forEach((x) => x.classList.remove("copiado"));
  b.classList.add("copiado");
  b.lastChild.textContent = "Copiado";
  setTimeout(() => { b.classList.remove("copiado"); b.lastChild.textContent = "Copiar"; }, 2500);
}));
</script>`;

export function paginaFaturaPortal(r: Reserva, f: FaturaPortal | null, falta: string | null) {
  const voltar = `/admin/reservas/${r.id}#fatura`;
  if (!f || falta) {
    return pagina("Fatura-recibo", html`<h1>Fatura-recibo</h1>
      <p class="aviso">${falta ?? "Faltam dados para preparar a fatura."}</p>`, { admin: true, seccao: "reservas", voltar });
  }
  return pagina("Fatura-recibo", html`
    <h1>Emitir no Portal das Finanças</h1>
    <p class="nota">Os campos estão pela ordem do formulário. Copie cada um e cole no Portal; no fim, registe aqui o número da fatura.</p>

    <section class="cartao">
      <h2>1. Abrir o formulário</h2>
      <p>Entre no <a href="https://www.portaldasfinancas.gov.pt" target="_blank" rel="noopener">Portal das Finanças</a>,
        pesquise <strong>Faturas e Recibos</strong> e escolha <strong>Emitir → Fatura ou Fatura-Recibo</strong>.</p>
      ${fixo("Tipo de documento", "Fatura-Recibo")}
    </section>

    <section class="cartao">
      <h2>2. Adquirente (o hóspede)</h2>
      ${fixo("País", `${f.adquirente.nomePais} (${f.adquirente.pais})`, "Escolher na lista")}
      ${campo("NIF ou equivalente", f.adquirente.nif, f.adquirente.pais === "PT" ? undefined : "N.º fiscal estrangeiro, passaporte ou documento de identificação")}
      ${campo("Nome", f.adquirente.nome)}
      ${f.adquirente.morada ? campo("Morada", f.adquirente.morada) : ""}
      ${fixo("Motivo de emissão", "Pagamento dos bens ou dos serviços")}
    </section>

    <section class="cartao">
      <h2>3. Linha do alojamento</h2>
      ${fixo("Tipo", "Serviço")}
      ${fixo("Tipo de referência", "Outro")}
      ${campo("Referência", f.referencia)}
      ${campo("Descrição", f.descricao)}
      ${fixo("Quantidade · Unidade", "1 · Unidade")}
      ${campo("Preço unitário (sem IVA)", valor(f.precoSemIvaCents))}
      ${f.motivoIsencao
        ? html`${fixo("Taxa de IVA", "0% (isento)")}${campo("Motivo de isenção", f.motivoIsencao)}`
        : fixo("Taxa de IVA", `${f.taxaIva}%`, `IVA: ${euros(f.ivaCents)} · total da linha: ${euros(f.alojamentoCents)}`)}
      ${f.diferencaCents
        ? html`<p class="nota">Com estas regras de arredondamento o total fica a ${Math.abs(f.diferencaCents)} cêntimo do valor pago
            (${euros(f.alojamentoCents - f.diferencaCents)}): é normal.</p>`
        : ""}
    </section>

    ${f.taxaTuristicaCents
      ? html`<section class="cartao">
          <h2>4. Linha da taxa turística</h2>
          <p class="nota">Em <strong>Adicionar Produto, Serviço ou Outros</strong>:</p>
          ${fixo("Tipo", "Impostos, Taxas e Encargos Parafiscais")}
          ${fixo("Tipo de referência", "Outro")}
          ${campo("Referência", "Taxa Turística")}
          ${campo("Descrição", "Taxa municipal turística, não sujeita a IVA")}
          ${campo("Valor", valor(f.taxaTuristicaCents))}
        </section>`
      : ""}

    <section class="cartao">
      <h2>${f.taxaTuristicaCents ? "5" : "4"}. Confirmar e registar</h2>
      ${fixo("Total da fatura", euros(f.totalCents), "Confira com o total que o Portal mostra antes de emitir")}
      <p class="nota">Se o Portal pedir o regime de retenção na fonte de IRS: <strong>sem retenção</strong> (o hóspede é um particular).
        Em caso de dúvida sobre o seu enquadramento, confirme com o seu contabilista.</p>
      ${r.fatura_emitida_em
        ? html`<p>✅ Fatura ${r.fatura_numero} registada.</p>`
        : html`<form method="post" action="/admin/reservas/${r.id}/fatura" class="linha">
            <input name="fatura_numero" placeholder="N.º da fatura emitida" required aria-label="N.º da fatura">
            <button>Registar</button></form>`}
    </section>
    ${SCRIPT_COPIAR}
  `, { admin: true, seccao: "reservas", voltar });
}
