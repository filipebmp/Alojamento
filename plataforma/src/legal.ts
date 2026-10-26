// Textos legais do bookgest (rascunho, em revisão jurídica). Os dados da entidade ficam aqui, num só sítio:
// enquanto forem null, as páginas mostram "[a preencher: …]".

import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { pagina } from "./views";

export const ENTIDADE = {
  nome: null as string | null, // nome completo (ENI) ou denominação da sociedade
  nif: null as string | null,
  morada: null as string | null,
  registo: null as string | null, // ex.: "Matriculada na CRC de … sob o n.º …" (só sociedades)
  capital: null as string | null, // capital social (só sociedades)
  // Entidade de resolução alternativa de litígios (Lei 144/2015).
  ral: null as string | null,
};

export const VERSAO_LEGAL = "Rascunho de 26/10/2026";

// Dias que os dados extraídos dos emails de reserva ficam na plataforma até a instalação os ir buscar.
export const DIAS_RETENCAO_EMAILS = 7;

const preencher = (oQue: string) => html`<mark>[a preencher: ${oQue}]</mark>`;
const valor = (v: string | null, falta: string) => (v ? v : preencher(falta));

function cabecalho(titulo: string) {
  return html`<h1>${titulo}</h1>
    <p class="aviso"><strong>Versão provisória, em revisão jurídica.</strong> Este texto é um rascunho e pode mudar antes da versão final.
      ${VERSAO_LEGAL}.</p>`;
}

function entidade(contacto: string | null) {
  return html`<p><strong>${valor(ENTIDADE.nome, "nome ou denominação")}</strong>, NIF ${valor(ENTIDADE.nif, "NIF")},
    com morada em ${valor(ENTIDADE.morada, "morada")}${ENTIDADE.registo ? html`, ${ENTIDADE.registo}` : ""}${ENTIDADE.capital ? html`, capital social de ${ENTIDADE.capital}` : ""}.
    Contacto: ${contacto ? html`<a href="mailto:${contacto}">${contacto}</a>` : preencher("email")}.</p>`;
}

const indice = (atual: string) => html`<nav class="legal-nav">
  ${[["/termos", "Termos"], ["/privacidade", "Privacidade"], ["/tratamento-de-dados", "Tratamento de dados (RGPD)"], ["/subcontratantes", "Subcontratantes"]]
    .map(([href, nome]) => html`<a href="${href}" ${href === atual ? html`aria-current="page"` : ""}>${nome}</a>`)}
</nav>`;

function legal(titulo: string, caminho: string, corpo: HtmlEscapedString | Promise<HtmlEscapedString>, contacto: string | null) {
  return pagina(titulo, html`${indice(caminho)}${cabecalho(titulo)}${corpo}`, { estreito: true, contacto });
}

// ---------- Termos de utilização ----------

export function paginaTermos(contacto: string | null) {
  return legal("Termos de utilização", "/termos", html`
    <h2>1. Quem presta o serviço</h2>
    ${entidade(contacto)}

    <h2>2. O serviço</h2>
    <p>O bookgest é um programa online de gestão de Alojamento Local (check-in online dos hóspedes, código das chaves, reservas,
      prazos de SIBA, faturação e taxa turística), disponibilizado por subscrição (software como serviço).</p>
    <p>Há dois modos: <strong>Simples</strong> (alojado pelo bookgest, em <em>nome</em>.bookgest.pt) e <strong>Privado</strong>
      (instalado na conta Cloudflare do próprio cliente, à qual o bookgest não tem acesso).</p>
    <p>O bookgest destina-se a quem explora Alojamento Local no âmbito da sua atividade profissional.</p>

    <h2>3. Conta, período experimental e subscrição</h2>
    <ul>
      <li>O registo dá 30 dias de utilização gratuita, sem cartão. No fim, o cliente decide se subscreve.</li>
      <li>A subscrição custa o preço por alojamento e por mês indicado no site no momento da compra, com IVA incluído, cobrado
        mensalmente e de forma antecipada pelo Stripe. Não há fidelização.</li>
      <li>O cliente pode alterar o número de alojamentos ou cancelar a qualquer momento, no portal do cliente. O cancelamento produz
        efeitos no fim do período já pago; não há reembolso de períodos parciais, salvo quando a lei o exija.</li>
      <li>Alterações de preço são comunicadas por email com pelo menos 30 dias de antecedência; o cliente pode cancelar antes de produzirem efeito.</li>
      <li>A fatura de cada pagamento é emitida em nome dos dados de faturação indicados pelo cliente.</li>
    </ul>

    <h2>4. Responsabilidades do cliente</h2>
    <ul>
      <li>Manter a palavra-passe segura e os dados da conta corretos.</li>
      <li>Usar o bookgest de acordo com a lei, nomeadamente o RGPD, perante os seus hóspedes (ver <a href="/tratamento-de-dados">Tratamento de dados</a>).</li>
      <li>Confirmar a informação legal que o bookgest apresenta como apoio (taxas turísticas, regras dos concelhos, prazos, valores de IVA)
        e os dados enviados ao SIBA, ao INE, às câmaras e aos programas de faturação. O bookgest ajuda a cumprir estas obrigações,
        mas o cumprimento é do cliente.</li>
      <li>Não usar o serviço para fins ilícitos nem tentar aceder a dados de outros clientes.</li>
    </ul>

    <h2>5. Disponibilidade e alterações</h2>
    <p>O bookgest procura manter o serviço disponível de forma contínua, mas pode haver interrupções para manutenção ou por falhas de
      terceiros (alojamento, plataformas de reservas, SIBA, Stripe). O serviço é atualizado regularmente; alterações que reduzam
      funcionalidades essenciais são comunicadas com antecedência.</p>

    <h2>6. Os dados são do cliente</h2>
    <p>O cliente mantém sempre o acesso aos seus dados, mesmo que a licença deixe de estar ativa (as reservas e declarações têm de ser
      conservadas por lei). Ao terminar o serviço, pode pedir a exportação e, depois, o apagamento, nos termos do
      <a href="/tratamento-de-dados">acordo de tratamento de dados</a>.</p>

    <h2>7. Responsabilidade</h2>
    <p>${preencher("cláusula de limitação de responsabilidade, a definir com a advogada (ex.: limite ao valor pago nos últimos 12 meses, exceto dolo ou culpa grave)")}</p>

    <h2>8. Suspensão e fim</h2>
    <p>Sem pagamento, a criação de novas reservas é bloqueada ao fim de 14 dias de aviso; o acesso aos dados existentes nunca é bloqueado.
      O bookgest pode terminar o contrato em caso de incumprimento grave, com aviso prévio por email.</p>

    <h2>9. Reclamações e litígios</h2>
    <p>Pode reclamar através do email de contacto ou do <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener">Livro de Reclamações Eletrónico</a>.
      Entidade de resolução alternativa de litígios: ${valor(ENTIDADE.ral, "entidade RAL (ex.: CNIACC – www.cniacc.pt)")}.
      Mais informação no <a href="https://www.consumidor.gov.pt" target="_blank" rel="noopener">Portal do Consumidor</a>.</p>
    <p>Aplica-se a lei portuguesa. ${preencher("foro competente")}</p>
  `, contacto);
}

// ---------- Política de privacidade (dados de que o bookgest é responsável) ----------

export function paginaPrivacidade(contacto: string | null) {
  return legal("Política de privacidade", "/privacidade", html`
    <p>Esta política explica como o bookgest trata os dados dos <strong>seus clientes</strong> (gestores de Alojamento Local) e dos
      visitantes do site. Os dados dos <strong>hóspedes</strong> dos clientes são tratados por conta destes: ver
      <a href="/tratamento-de-dados">Tratamento de dados</a>.</p>

    <h2>Responsável pelo tratamento</h2>
    ${entidade(contacto)}

    <h2>Que dados, para quê e com que fundamento</h2>
    <div class="tabela-legal"><table>
      <tr><th>Dados</th><th>Finalidade</th><th>Fundamento (RGPD)</th><th>Conservação</th></tr>
      <tr><td>Nome, email, endereço escolhido</td><td>Registo, criação da instalação, entrada e avisos do serviço</td><td>Execução do contrato (art. 6.º, 1, b)</td><td>Enquanto houver conta; registos não confirmados: ${preencher("prazo")}</td></tr>
      <tr><td>Dados de faturação (nome, NIF, morada) e pagamentos</td><td>Cobrar a subscrição e emitir faturas</td><td>Contrato e obrigação legal (art. 6.º, 1, b e c)</td><td>10 anos (obrigações fiscais)</td></tr>
      <tr><td>Chave de licença, versão e n.º de alojamentos ativos da instalação</td><td>Verificar a licença</td><td>Execução do contrato</td><td>Enquanto houver conta</td></tr>
      <tr><td>Emails trocados com o apoio</td><td>Responder a pedidos</td><td>Interesse legítimo (art. 6.º, 1, f)</td><td>${preencher("prazo")}</td></tr>
      <tr><td>Registo técnico dos pedidos (endereço IP, data)</td><td>Segurança e prevenção de abusos</td><td>Interesse legítimo</td><td>Os prazos do fornecedor de alojamento (Cloudflare)</td></tr>
    </table></div>

    <h2>Cookies</h2>
    <p>O site usa apenas cookies estritamente necessários: a sessão da área de gestão e a memória do último endereço usado para entrar.
      Não há cookies de publicidade nem de análise, por isso não é pedido consentimento.</p>

    <h2>Quem recebe os dados</h2>
    <p>Os fornecedores listados em <a href="/subcontratantes">Subcontratantes</a> (alojamento, email, pagamentos e faturação),
      a Autoridade Tributária (faturas) e as autoridades quando a lei o exigir. Não vendemos nem cedemos dados para publicidade.</p>

    <h2>Transferências para fora do Espaço Económico Europeu</h2>
    <p>Alguns fornecedores são dos EUA (Cloudflare, Resend). As transferências são feitas ao abrigo do EU-US Data Privacy Framework e/ou
      das cláusulas contratuais-tipo da Comissão Europeia.</p>

    <h2>Os seus direitos</h2>
    <p>Pode pedir o acesso, a retificação, o apagamento, a limitação, a portabilidade e opor-se ao tratamento, através do email de contacto.
      Respondemos no prazo de um mês. Pode também apresentar reclamação à
      <a href="https://www.cnpd.pt" target="_blank" rel="noopener">Comissão Nacional de Proteção de Dados (CNPD)</a>.</p>
  `, contacto);
}

// ---------- Acordo de tratamento de dados (art. 28.º do RGPD) ----------

export function paginaTratamentoDados(contacto: string | null) {
  return legal("Acordo de tratamento de dados", "/tratamento-de-dados", html`
    <p>Este acordo faz parte dos <a href="/termos">Termos de utilização</a> e é aceite no registo. Aplica-se ao modo <strong>Simples</strong>
      (alojado pelo bookgest). No modo <strong>Privado</strong>, os dados ficam na conta Cloudflare do cliente e o bookgest não lhes tem acesso.</p>

    <h2>1. Papéis</h2>
    <p>O <strong>cliente</strong> (gestor do Alojamento Local) é o <strong>responsável pelo tratamento</strong> dos dados dos seus hóspedes.
      O <strong>bookgest</strong> (${valor(ENTIDADE.nome, "nome ou denominação")}) é <strong>subcontratante</strong> e trata esses dados apenas
      por conta e segundo as instruções do cliente, que são as definidas por estes termos e pelo uso que o cliente faz do programa.</p>

    <h2>2. Objeto, natureza e finalidade</h2>
    <p>Guardar e tratar os dados das reservas e dos hóspedes para o cliente fazer o check-in online, entregar o código das chaves,
      comunicar os hóspedes estrangeiros ao SIBA (AIMA), emitir faturas, calcular e declarar a taxa turística e responder ao INE,
      durante a vigência do contrato.</p>

    <h2>3. Dados e titulares</h2>
    <ul>
      <li><strong>Hóspedes:</strong> nome, data de nascimento, nacionalidade, país de residência, tipo, número e país do documento de identificação,
        datas da estadia; do titular da reserva, também contacto e dados de faturação (nome, NIF, morada, email).</li>
      <li><strong>Reservas recebidas por email:</strong> nome do hóspede, datas, n.º de hóspedes e valores extraídos dos emails reencaminhados
        pelo cliente (o email em si não é guardado; os dados extraídos são apagados da plataforma até ${DIAS_RETENCAO_EMAILS} dias depois).</li>
      <li><strong>Utilizadores do cliente</strong> (equipa): nome e email.</li>
      <li>Não são tratadas categorias especiais de dados (art. 9.º).</li>
    </ul>

    <h2>4. Obrigações do bookgest</h2>
    <ul>
      <li>Tratar os dados só segundo as instruções do cliente, incluindo quanto a transferências, e avisá-lo se uma instrução lhe parecer ilegal.</li>
      <li>Garantir a confidencialidade: o acesso é limitado a quem precisa dele para prestar o serviço e está obrigado a sigilo.</li>
      <li>Aplicar as medidas de segurança do anexo (art. 32.º).</li>
      <li>Recorrer a outros subcontratantes apenas os da <a href="/subcontratantes">lista</a>, com contratos que impõem as mesmas obrigações;
        avisar o cliente de alterações com pelo menos 30 dias de antecedência, podendo o cliente opor-se e cancelar.</li>
      <li>Ajudar o cliente a responder aos pedidos dos titulares (acesso, retificação, apagamento…), nomeadamente através das funções do programa.</li>
      <li>Notificar o cliente de uma violação de dados pessoais sem demora injustificada, e no máximo em ${preencher("prazo, ex.: 48 horas")} depois de dela ter conhecimento,
        com a informação necessária para o cliente cumprir o art. 33.º.</li>
      <li>Ajudar o cliente nas avaliações de impacto e consultas à CNPD, quando aplicável.</li>
      <li>No fim do contrato, a pedido do cliente, entregar os dados num formato exportável e apagá-los, salvo se a lei exigir a conservação.
        Sem pedido, os dados são apagados ${preencher("prazo após o fim do contrato")}.</li>
      <li>Disponibilizar a informação necessária para demonstrar o cumprimento deste acordo e permitir auditorias razoáveis, com aviso prévio.</li>
    </ul>

    <h2>5. Obrigações do cliente</h2>
    <ul>
      <li>Ter fundamento legal para tratar os dados dos hóspedes (obrigações legais de comunicação ao SIBA, faturação e taxa turística).</li>
      <li>Informar os hóspedes sobre o tratamento (art. 13.º). O formulário de check-in mostra um aviso, que o cliente deve completar com a sua identificação.</li>
      <li>Definir e cumprir os prazos de conservação e apagar os dados que já não precise de guardar.</li>
    </ul>

    <h2>Anexo — Medidas de segurança</h2>
    <ul>
      <li>Uma base de dados separada para cada cliente.</li>
      <li>Comunicações sempre cifradas (HTTPS/TLS); dados cifrados em repouso pelo fornecedor de alojamento.</li>
      <li>Acesso ao painel com palavra-passe guardada com <em>hash</em> e sessões com prazo; papéis de gestor e equipa.</li>
      <li>Links de check-in individuais e impossíveis de adivinhar; o código das chaves só aparece com o check-in completo e perto da entrada.</li>
      <li>Atualizações publicadas de forma automática e assinadas digitalmente.</li>
      <li>Cópias de segurança: ${preencher("política de cópias de segurança (ex.: D1 Time Travel, 30 dias)")}.</li>
      <li>Os dados de pagamento são tratados só pelo Stripe; o bookgest nunca vê os dados do cartão.</li>
    </ul>
  `, contacto);
}

// ---------- Subcontratantes ----------

const SUBCONTRATANTES: [string, string, string, string][] = [
  ["Cloudflare, Inc.", "EUA; as bases de dados das instalações criadas desde 26/10/2026 ficam restritas à UE (as anteriores, ao abrigo do DPF e das cláusulas contratuais-tipo)", "Alojamento do site, das instalações e das bases de dados; encaminhamento dos emails de reserva", "Dados dos clientes e dos hóspedes"],
  ["Resend (Plus Five Five, Inc.)", "EUA (DPF / cláusulas contratuais-tipo)", "Envio de emails do serviço (registo, entrada, avisos diários)", "Nome e email dos clientes; os avisos têm só tipos e quantidades, sem dados de hóspedes"],
  ["Stripe Payments Europe, Ltd.", "Irlanda", "Pagamentos da subscrição (responsável independente pelos dados de pagamento)", "Dados de faturação e pagamento dos clientes"],
  ["InvoiceXpress (quando ativo)", "Portugal", "Emissão das faturas da subscrição", "Dados de faturação dos clientes"],
];

export function paginaSubcontratantes(contacto: string | null) {
  return legal("Subcontratantes", "/subcontratantes", html`
    <p>Fornecedores que tratam dados pessoais para o bookgest prestar o serviço.</p>
    <div class="tabela-legal"><table>
      <tr><th>Fornecedor</th><th>Localização</th><th>Para quê</th><th>Dados</th></tr>
      ${SUBCONTRATANTES.map(([n, l, p, d]) => html`<tr><td>${n}</td><td>${l}</td><td>${p}</td><td>${d}</td></tr>`)}
    </table></div>
    <p class="nota">Não são subcontratantes do bookgest os serviços que o próprio cliente decide usar e ligar ao programa (SIBA/AIMA,
      Booking, Airbnb e outras plataformas, InvoiceXpress, Vendus ou TOConline na faturação aos hóspedes): esses dados seguem por
      instrução do cliente, ao abrigo da relação dele com esses serviços.</p>
  `, contacto);
}
