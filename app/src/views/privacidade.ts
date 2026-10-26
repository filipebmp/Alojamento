// Informação aos hóspedes sobre os seus dados (art. 13.º do RGPD), em português e inglês. Rascunho em revisão jurídica.
import { html } from "hono/html";
import type { Responsavel } from "../lib/privacidade";
import { pagina } from "./layout";

const quem = (r: Responsavel | null, en = false) =>
  r
    ? html`<strong>${r.nome}</strong>${r.nif ? html` (NIF ${r.nif})` : ""}, <a href="mailto:${r.email}">${r.email}</a>`
    : en ? html`the manager of the accommodation where you are staying` : html`o gestor do alojamento onde vai ficar`;

// Aviso curto no formulário de check-in, com ligação à informação completa.
export function avisoPrivacidade(r: Responsavel | null) {
  return html`<p class="nota">
    Os dados são tratados por ${quem(r)} apenas para cumprir obrigações legais em Portugal (comunicação de estrangeiros
    ao SIBA, faturação e taxa municipal turística). <a href="/privacidade" target="_blank">Saber mais</a>.<br>
    <em>Your data is processed by ${quem(r, true)} only to meet Portuguese legal obligations (foreign guest registration
    with SIBA, invoicing and municipal tourist tax). <a href="/privacidade#en" target="_blank">Learn more</a>.</em></p>`;
}

export function paginaPrivacidadeHospedes(r: Responsavel | null) {
  return pagina("Privacidade", html`
    <p class="aviso">Versão provisória, em revisão jurídica. / <em>Provisional version, under legal review.</em></p>
    <h1>Os seus dados</h1>
    <h2>Quem trata os dados</h2>
    <p>Responsável pelo tratamento: ${quem(r)}. O programa bookgest guarda os dados por conta do responsável, como subcontratante.</p>
    <h2>Que dados e para quê</h2>
    <ul>
      <li><strong>Identificação de cada hóspede</strong> (nome, data de nascimento, nacionalidade, país de residência, documento de identificação):
        comunicação obrigatória dos hóspedes estrangeiros ao SIBA da AIMA e cálculo da taxa municipal turística.</li>
      <li><strong>Dados de faturação do titular</strong> (nome, NIF, morada, email): emissão da fatura da estadia.</li>
    </ul>
    <p>Fundamento: cumprimento de obrigações legais (art. 6.º, n.º 1, alínea c) do RGPD). Sem estes dados não é possível concluir o check-in.</p>
    <h2>Quem recebe os dados</h2>
    <p>A AIMA (SIBA), a Autoridade Tributária (faturas), a câmara municipal (taxa turística, quando aplicável), o programa de faturação do
      responsável e os fornecedores técnicos do bookgest (alojamento na Cloudflare). Não há decisões automatizadas nem uso para publicidade.</p>
    <h2>Durante quanto tempo</h2>
    <p>Pelo prazo exigido por cada obrigação legal, sendo depois apagados.</p>
    <h2>Os seus direitos</h2>
    <p>Pode pedir ao responsável o acesso, a retificação, a limitação ou o apagamento dos seus dados (quando a lei não obrigue a conservá-los),
      e apresentar reclamação à <a href="https://www.cnpd.pt" target="_blank" rel="noopener">Comissão Nacional de Proteção de Dados (CNPD)</a>.</p>

    <h1 id="en" lang="en">Your data</h1>
    <div lang="en">
      <h2>Who processes your data</h2>
      <p>Controller: ${quem(r, true)}. The bookgest software stores the data on the controller's behalf, as a processor.</p>
      <h2>What data and why</h2>
      <ul>
        <li><strong>Identification of each guest</strong> (name, date of birth, nationality, country of residence, identity document):
          mandatory registration of foreign guests with SIBA (AIMA) and municipal tourist tax.</li>
        <li><strong>Billing details of the booking holder</strong> (name, tax number, address, email): issuing the invoice for the stay.</li>
      </ul>
      <p>Legal basis: compliance with legal obligations (Article 6(1)(c) GDPR). Check-in cannot be completed without this data.</p>
      <h2>Who receives the data</h2>
      <p>AIMA (SIBA), the Portuguese Tax Authority (invoices), the municipality (tourist tax, where applicable), the controller's invoicing
        software and bookgest's technical providers (hosting on Cloudflare). No automated decisions, no advertising.</p>
      <h2>How long</h2>
      <p>For the period required by each legal obligation, after which it is deleted.</p>
      <h2>Your rights</h2>
      <p>You may ask the controller for access, rectification, restriction or erasure of your data (where the law does not require it to be kept),
        and lodge a complaint with the Portuguese supervisory authority, <a href="https://www.cnpd.pt" target="_blank" rel="noopener">CNPD</a>.</p>
    </div>
  `);
}
