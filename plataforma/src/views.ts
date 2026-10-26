import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { estadoLicenca, type Cliente, type Licenca } from "./licencas";
import type { Fatura } from "./faturas";
import { compararVersoes } from "../../comum/versoes";

type Conteudo = HtmlEscapedString | Promise<HtmlEscapedString>;

// Ícones de traço (24×24), os mesmos do painel.
const ICONES = {
  casa: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  telemovel: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  moeda: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4 4 0 1 0 0 7M7 11h6M7 13.5h6"/>',
  predios: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ine: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  visto: '<path d="M5 12l5 5 9-10"/>',
} as const;

export function icone(nome: keyof typeof ICONES, tamanho = 22) {
  return raw(`<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`);
}

// estreito: páginas de formulário (registo, entrar, instalar).
export function pagina(
  titulo: string,
  corpo: Conteudo,
  opcoes: { gestao?: boolean; descricao?: string; portal?: string | null; estreito?: boolean; experimentar?: boolean; contacto?: string | null; naEntrada?: boolean } = {},
) {
  return html`<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5f6f3" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#111513" media="(prefers-color-scheme: dark)">
  <title>${titulo}</title>
  ${opcoes.descricao ? html`<meta name="description" content="${opcoes.descricao}">` : ""}
  ${opcoes.gestao ? html`<meta name="robots" content="noindex">` : ""}
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/site.css?v=4">
</head>
<body>
  <header class="topo"><div class="topo-dentro">
    <a href="${opcoes.gestao ? "/gestao" : "/"}" class="marca"><span class="logo">${icone("casa", 17)}</span>bookgest${opcoes.gestao ? html` <small>· gestão</small>` : ""}</a>
    ${opcoes.gestao
      ? opcoes.naEntrada ? "" : html`<nav><a href="/gestao">Licenças</a><a href="/gestao/faturas">Faturas</a></nav>`
      : html`<nav><a class="opcional" href="/#funcionalidades">Funcionalidades</a><a class="opcional" href="/#precos">Preço</a>
          ${opcoes.portal ? html`<a class="opcional" href="${opcoes.portal}">Assinatura</a>` : ""}${opcoes.naEntrada ? "" : html`<a href="/entrar">Entrar</a>`}
          ${opcoes.experimentar ? html`<a class="botao" href="/registar">Experimentar</a>` : ""}</nav>`}
  </div></header>
  <main class="${opcoes.estreito ? "estreito" : ""}">${corpo}</main>
  ${opcoes.gestao
    ? ""
    : html`<footer class="rodape"><div><span>© bookgest</span><a href="/termos">Termos e dados</a>
        ${opcoes.contacto ? html`<a href="mailto:${opcoes.contacto}">${opcoes.contacto}</a>` : ""}</div></footer>`}
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
  registosAbertos: boolean;
  contacto: string | null;
  portal: string | null; // link de acesso ao portal do cliente do Stripe
}

const FUNCIONALIDADES: [Parameters<typeof icone>[0], string, string][] = [
  ["telemovel", "Check-in online", "O hóspede preenche os dados no telemóvel, em português ou inglês, antes de chegar. Envia o link por WhatsApp num toque."],
  ["chave", "Código das chaves no momento certo", "O código do cofre só aparece depois do formulário preenchido e perto da hora de entrada, com as suas fotos de como chegar."],
  ["calendario", "Reservas do Booking e do Airbnb", "Ligue o calendário de cada plataforma e as reservas entram sozinhas, num calendário com todos os alojamentos."],
  ["email", "Emails de reserva", "Reencaminhe os emails de confirmação e o bookgest completa o nome, os hóspedes e os valores de cada reserva."],
  ["escudo", "Envio automático ao SIBA", "Assim que o check-in fica completo, os boletins dos hóspedes estrangeiros seguem para o webservice oficial do SIBA. Chegadas futuras seguem no dia do check-in; se algo falhar, vê o motivo e reenvia."],
  ["recibo", "Fatura-recibo e INE", "Emite a fatura no seu programa de faturação ou prepara-a para o Portal das Finanças. Relatório mensal do INE (hóspedes e dormidas por país) pronto a transcrever."],
  ["moeda", "Taxa turística calculada", "Valor devido por estadia e resumo mensal para declarar à câmara, com as regras do seu concelho. Avisa se o Booking cobrou mal."],
  ["predios", "Vários alojamentos", "Cada alojamento com o seu código, horários, instruções e regras. Números do mês: ocupação e receita."],
  ["pessoa", "Equipa", "Dê acesso a quem faz as limpezas ou recebe os hóspedes, sem mostrar documentos, faturação ou valores."],
];

// Secção "Em detalhe": o que cada obrigação faz, com os pontos principais.
const DETALHES: [Parameters<typeof icone>[0], string, string, string[]][] = [
  ["escudo", "Comunicação ao SIBA",
    "Assim que o check-in fica completo, os boletins de alojamento dos hóspedes estrangeiros são enviados ao webservice oficial do SIBA. A resposta do SIBA fica registada na reserva e, se algo falhar, vê o motivo concreto e pode reenviar. Se o hóspede não preencher o check-in, o bookgest avisa antes do fim do prazo legal.",
    ["Envio sem escrever nada duas vezes", "Chegadas futuras ficam agendadas e seguem no dia do check-in", "Estado visível em cada reserva: enviado, agendado ou com o erro explicado"]],
  ["ine", "Relatório do INE (IPHH)",
    "O inquérito mensal do INE pede hóspedes e dormidas por país de residência, a utilização do alojamento e o volume de negócios. O bookgest tem esses dados do check-in e apresenta-os já somados, prontos a transcrever para o WebInq, com lembrete até ao dia 10 de cada mês.",
    ["Hóspedes e dormidas por país, com as estadias que atravessam meses divididas corretamente", "Utilizações e volume de negócios sem IVA e sem taxa turística, por mês", "Exportação em CSV"]],
  ["moeda", "Taxa turística",
    "A taxa é calculada por estadia segundo as regras do concelho do alojamento, com a isenção por idade, o limite de noites e os valores de época alta e baixa. Os 308 concelhos estão na lista, com os valores de referência dos que cobram taxa. Tem o resumo mensal por alojamento para declarar à câmara.",
    ["Preenchida automaticamente ao escolher o concelho", "Dormidas tributáveis, não sujeitas e isentas, como a câmara pede", "Lembretes dos prazos de declaração e de pagamento"]],
  ["recibo", "Fatura-recibo",
    "Com o InvoiceXpress, o Vendus ou o TOConline ligados, a fatura-recibo de cada reserva é emitida com um clique, com o IVA certo e a taxa turística à parte. Sem programa de faturação, o bookgest prepara todos os campos para copiar para o Portal das Finanças, gratuito.",
    ["Dados de faturação pedidos ao hóspede no check-in", "IVA de 6%, 5% (Madeira), 4% (Açores) ou isenção do art. 53.º", "Prazo da fatura à vista em cada reserva"]],
  ["calendario", "Reservas do Booking e do Airbnb",
    "Ligue o calendário (iCal) de cada plataforma e as reservas entram sozinhas, num calendário com todos os alojamentos. Reencaminhe os emails de confirmação e o bookgest completa o nome, os hóspedes e os valores.",
    ["Sem reservas duplicadas nem esquecidas", "Avisa quando uma reserva desaparece do calendário (cancelamento)", "Reservas diretas criadas em segundos"]],
  ["chave", "Check-in online e código das chaves",
    "O hóspede preenche os seus dados e os dos acompanhantes no telemóvel, em português ou inglês. O código do cofre e as instruções de chegada, com fotos, só aparecem depois do check-in completo e perto da hora de entrada.",
    ["Link enviado por WhatsApp num toque", "Lista de países e documentos sem erros de escrita", "Aviso dos dados de hóspedes em falta"]],
];

// Ecrã "Hoje" do painel, com dados de exemplo, desenhado em HTML para ficar nítido em qualquer ecrã.
const TELEMOVEL = html`<div class="telemovel" role="img" aria-label="O ecrã Hoje do bookgest num telemóvel: entradas, saídas, ocupação, tarefas e próximas chegadas">
  <div class="ecra" aria-hidden="true">
    <p class="data">domingo, 25 de outubro</p>
    <p class="titulo">Hoje</p>
    <div class="nums"><div><span>Entradas</span><b>2</b></div><div><span>Saídas</span><b>1</b></div><div><span>Ocupação</span><b>78%</b></div></div>
    <h4>A tratar</h4>
    <div class="lista">
      <div><span class="ic a">${icone("recibo", 13)}</span><p><b>Emitir fatura-recibo</b><span>John Smith</span></p><span class="et a">Atrasado</span></div>
      <div><span class="ic h">${icone("escudo", 13)}</span><p><b>Comunicar ao SIBA</b><span>Hans Müller · 2 hóspedes</span></p><span class="et h">Hoje</span></div>
      <div><span class="ic">${icone("moeda", 13)}</span><p><b>Declarar taxa turística</b><span>Setembro · Lisboa</span></p><span class="et">31/10</span></div>
    </div>
    <h4>Entradas e saídas</h4>
    <div class="lista">
      <div><span class="dia"><b>25</b><span>out</span></span><p><b>Hans Müller</b><span>Casa da Praia · 3 noites</span></p><span class="et b">Booking</span></div>
      <div><span class="dia"><b>27</b><span>out</span></span><p><b>Maria Silva</b><span>T1 Centro · 2 noites</span></p><span class="et r">Airbnb</span></div>
    </div>
    <div class="menu"><span>Hoje</span><span>Calendário</span><span>Reservas</span><span>Taxas</span><span>Mais</span></div>
  </div>
</div>`;

export function paginaInicio(d: DadosSite) {
  const comecar = d.registosAbertos
    ? html`<a class="botao grande" href="/registar">Experimentar 30 dias grátis</a>`
    : d.contacto
      ? html`<a class="botao grande" href="mailto:${d.contacto}?subject=bookgest">Pedir para experimentar</a>`
      : html`<a class="botao grande" href="#precos">Ver preço</a>`;
  return pagina("bookgest — gestão de Alojamento Local", html`
    <section class="heroi">
      <div>
        <span class="selo">${icone("casa", 15)}Para quem gere um ou poucos Alojamentos Locais</span>
        <h1>O seu Alojamento Local em ordem, sem papelada.</h1>
        <p class="lead">Check-in online, código das chaves, reservas do Booking e do Airbnb e todos os prazos legais —
          SIBA, fatura e taxa turística — num só sítio, no telemóvel.</p>
        <div class="botoes">${comecar}<a class="botao grande secundario" href="#funcionalidades">Ver como funciona</a></div>
        ${d.registosAbertos ? html`<p class="nota">Sem cartão. Pronto a usar num minuto.</p>` : ""}
        <p class="plataformas">Funciona com <b>Booking.com</b> · <b>Airbnb</b> · reservas diretas</p>
      </div>
      ${TELEMOVEL}
    </section>

    <section class="seccao" id="funcionalidades">
      <h2>Tudo o que um Alojamento Local pede</h2>
      <p class="lead">Do momento em que a reserva entra até à declaração da taxa turística.</p>
      <div class="grelha">
        ${FUNCIONALIDADES.map(([i, t, x]) => html`<div class="cartao funcao"><span class="simbolo">${icone(i)}</span><h3>${t}</h3><p>${x}</p></div>`)}
      </div>
    </section>

    <section class="seccao" id="em-detalhe">
      <h2>Em detalhe</h2>
      <p class="lead">As obrigações de um Alojamento Local, tratadas a partir dos dados que o hóspede já preencheu.</p>
      ${DETALHES.map(([i, t, texto, pontos]) => html`<article class="detalhe">
        <div><span class="simbolo">${icone(i)}</span><h3>${t}</h3><p>${texto}</p></div>
        <ul>${pontos.map((p) => html`<li>${icone("visto", 18)}<span>${p}</span></li>`)}</ul>
      </article>`)}
    </section>

    <section class="seccao">
      <h2>Como funciona</h2>
      <p class="lead">Sem instalar nada da loja de aplicações: abre no browser e fica no ecrã principal como uma app.</p>
      <ol class="passos">
        <li><h3>Crie o seu bookgest</h3><p>Escolha o endereço (ex.: casa-da-praia.bookgest.pt) e configure o alojamento, o código do cofre e as regras do concelho.</p></li>
        <li><h3>Ligue as reservas</h3><p>Cole o link do calendário do Booking e do Airbnb e reencaminhe os emails de reserva. As reservas aparecem sozinhas.</p></li>
        <li><h3>Envie o link ao hóspede</h3><p>O hóspede faz o check-in no telemóvel e recebe o código das chaves. O bookgest avisa-o do que falta tratar.</p></li>
      </ol>
    </section>

    <section class="seccao">
      <h2>Os dados dos seus hóspedes, protegidos</h2>
      <p class="lead">Escolha onde ficam os dados.</p>
      <div class="privacidade">
        <div class="cartao"><span class="passo">Simples</span><h3 style="margin-top: 10px">Alojado pelo bookgest</h3>
          <p class="nota">Registe-se e comece já. Cada cliente tem a sua própria base de dados, separada das outras;
            tratamos os dados apenas por sua conta e não os consultamos.</p></div>
        <div class="cartao"><span class="passo">Privado</span><h3 style="margin-top: 10px">Na sua conta Cloudflare</h3>
          <p class="nota">Prefere que ninguém além de si tenha acesso? Instalamos o bookgest numa conta Cloudflare
            em seu nome (gratuita): os dados ficam lá e nós não temos acesso a eles.</p></div>
      </div>
    </section>

    <section class="seccao" id="precos">
      <div class="cartao precos">
        <h2 style="margin: 0">Preço simples</h2>
        ${d.precoCents != null
          ? html`<p class="valor">${euros(d.precoCents)}</p><p class="nota" style="margin: 0">por alojamento, por mês · IVA incluído · sem fidelização</p>`
          : html`<p class="valor">Em breve</p>`}
        <ul>
          ${["Todas as funcionalidades, sem extras", "Atualizações automáticas", "30 dias para experimentar", "Os seus dados sempre acessíveis, mesmo que deixe de pagar"]
            .map((t) => html`<li>${icone("visto", 18)}${t}</li>`)}
        </ul>
        ${d.vendasAbertas && d.precoCents != null
          ? html`<form method="post" action="/comprar" class="linha">
              <label>Alojamentos <input type="number" name="alojamentos" min="1" max="50" value="1" required></label>
              <button type="submit">Subscrever</button>
            </form>
            <p class="nota">Pagamento seguro pelo Stripe. Pode alterar o número de alojamentos ou cancelar a qualquer momento.</p>`
          : html`<p>Estamos a abrir aos primeiros gestores.
              ${d.contacto ? html`<a href="mailto:${d.contacto}?subject=bookgest">Peça para experimentar</a>.` : ""}</p>`}
        ${d.registosAbertos ? html`<p><a href="/registar">Ou experimente 30 dias grátis, sem cartão</a></p>` : ""}
      </div>
    </section>

    <section class="seccao faq">
      <h2>Perguntas frequentes</h2>
      <details><summary>Preciso de conhecimentos técnicos?</summary>
        <p>Não. No modo Simples basta registar-se. O modo Privado tem um instalador passo a passo (cerca de 10 minutos).</p></details>
      <details><summary>Funciona com o Booking e o Airbnb?</summary>
        <p>Sim. As reservas entram sozinhas pelo calendário (iCal) de cada plataforma, e os emails de reserva reencaminhados
          completam o nome, os hóspedes e os valores. Também pode criar reservas à mão em segundos.</p></details>
      <details><summary>O bookgest comunica ao SIBA e emite as faturas por mim?</summary>
        <p>Ao SIBA, sim: com o alojamento registado no SIBA em modo webservice, os boletins seguem automaticamente.
          A fatura-recibo é emitida no seu programa de faturação (InvoiceXpress, Vendus ou TOConline) com um clique,
          ou fica preparada campo a campo para o Portal das Finanças (gratuito).</p></details>
      <details><summary>Quanto custa a conta Cloudflare do modo Privado?</summary>
        <p>Nada: o plano gratuito chega para um pequeno gestor de Alojamento Local.</p></details>
      <details><summary>E se deixar de pagar?</summary>
        <p>Continua a poder consultar todos os seus dados — a lei obriga-o a guardá-los e nós nunca os bloqueamos.</p></details>
    </section>
  `, {
    portal: d.portal,
    experimentar: d.registosAbertos,
    contacto: d.contacto,
    descricao: "Check-in online, código das chaves, reservas do Booking e do Airbnb e prazos legais (SIBA, fatura, taxa turística) para pequenos gestores de Alojamento Local.",
  });
}

export function paginaObrigado(chave: string | null, contacto: string | null, portal: string | null, instalacao: string | null = null) {
  return pagina("Obrigado", html`<h1>Obrigado!</h1>
    ${chave
      ? html`<p>A sua assinatura está ativa. Esta é a sua chave de licença — guarde-a:</p>
        <p class="chave">${chave}</p>
        ${instalacao
          ? html`<p>Continue a usar o seu bookgest em <a href="${instalacao}">${instalacao}</a>.</p>`
          : html`<p><a class="botao grande" href="/criar?chave=${encodeURIComponent(chave)}">Criar o meu bookgest</a></p>
            <p class="nota">Alojado pelo bookgest, pronto num minuto. Ou
              <a href="/instalar?chave=${encodeURIComponent(chave)}">instalar numa conta Cloudflare sua</a>.</p>`}`
      : html`<p>Estamos a confirmar o pagamento. Atualize esta página dentro de alguns segundos.</p>`}
    ${portal ? html`<p class="nota">Para alterar o número de alojamentos, o método de pagamento ou cancelar: <a href="${portal}">A minha assinatura</a>.</p>` : ""}
    ${contacto ? html`<p class="nota">Dúvidas: <a href="mailto:${contacto}">${contacto}</a></p>` : ""}`, { portal, estreito: true, contacto });
}

export function paginaMensagem(titulo: string, texto: string) {
  return pagina(titulo, html`<h1>${titulo}</h1><p>${texto}</p><p><a href="/">Voltar</a></p>`, { estreito: true });
}

// ---------- Gestão (fornecedor) ----------

export function paginaEntrar(erro?: string) {
  return pagina("Entrar", html`<h1>Gestão</h1>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <form method="post" action="/gestao/entrar">
      <label>Palavra-passe <input type="password" name="password" required autofocus></label>
      <button type="submit">Entrar</button>
    </form>`, { gestao: true, estreito: true, naEntrada: true });
}

const NOMES_ESTADO = { ativa: "ativa", pagamento_em_atraso: "pagamento em atraso", inativa: "inativa", desconhecida: "desconhecida" };

export interface EstadoConfig {
  nome: string;
  ok: boolean;
  detalhe: string;
}

export function paginaLicencas(
  linhas: { licenca: Licenca; cliente: Cliente | null }[],
  config: EstadoConfig[],
  novaChave?: string,
  mensagem?: { ok: boolean; texto: string },
  ultimaVersao?: string | null,
) {
  return pagina("Licenças", html`<h1>Licenças</h1>
    <p class="nota">Versão atual da app: <strong>${ultimaVersao ?? "nenhuma publicada"}</strong></p>
    ${novaChave ? html`<p>✅ Licença de cortesia criada:</p><p class="chave">${novaChave}</p>` : ""}
    ${mensagem ? html`<p class="${mensagem.ok ? "" : "erro"}">${mensagem.ok ? "✅ " : "⚠️ "}${mensagem.texto}</p>` : ""}
    <details class="cartao" ${config.every((x) => x.ok) ? "" : "open"}>
      <summary>Configuração ${config.every((x) => x.ok) ? "✅" : "⚠️"}</summary>
      <dl class="config">${config.map((x) => html`<dt>${x.ok ? "✅" : "⚠️"} ${x.nome}</dt><dd class="${x.ok ? "" : "erro"}">${x.detalhe}</dd>`)}</dl>
    </details>
    <div class="tabela"><table class="cartoes">
      <tr><th>Chave</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Pagos</th><th>Ativos</th><th>Versão</th><th>Última comunicação</th><th></th></tr>
      ${linhas.map(({ licenca: l, cliente: c }) => {
        const estado = estadoLicenca(l);
        const excede = l.alojamentos_ativos != null && l.alojamentos_ativos > l.alojamentos_pagos;
        // A versão comunicada pela instalação chega com atraso; nas alojadas, a instalada pela plataforma é mais recente.
        const versao = [l.versao, l.modo === "alojado" ? l.versao_publicada : null]
          .filter((v): v is string => !!v).sort(compararVersoes).at(-1) ?? null;
        const desatualizada = l.modo === "alojado" && !!l.slug && !!l.cf_base && !!ultimaVersao
          && (!!l.erro_atualizacao || !versao || compararVersoes(ultimaVersao, versao) > 0);
        return html`<tr>
          <td data-r="Chave"><code>${l.chave}</code>${l.url_instalacao ? html`<br><small><a href="${l.url_instalacao}" target="_blank" rel="noopener">instalação</a></small>` : ""}</td>
          <td data-r="Cliente">${c?.nome ?? ""}${c?.email ? html`<br><small>${c.email}</small>` : ""}${l.notas ? html`<br><small>${l.notas}</small>` : ""}</td>
          <td data-r="Tipo">${l.tipo}${l.modo ? html`<br><small>${l.modo}</small>` : ""}${l.valida_ate ? html`<br><small>até ${dataPt(l.valida_ate)}</small>` : ""}
            ${l.erro_atualizacao ? html`<br><small class="erro">atualização: ${l.erro_atualizacao}</small>` : ""}</td>
          <td data-r="Estado" class="${estado === "ativa" ? "" : "erro"}">${NOMES_ESTADO[estado]}</td>
          <td data-r="Pagos">${l.tipo === "cortesia"
            ? html`<form method="post" action="/gestao/licencas/${l.id}/alojamentos" class="linha">
                <input type="number" name="alojamentos" min="1" max="1000" value="${l.alojamentos_pagos}" style="width: 4.5em; margin: 0" aria-label="Alojamentos incluídos">
                <button class="pequeno">Alterar</button></form>`
            : l.alojamentos_pagos}</td>
          <td data-r="Ativos" class="${excede ? "erro" : ""}">${l.alojamentos_ativos ?? "—"}</td>
          <td data-r="Versão">${versao ?? "—"}${desatualizada
            ? html`<form method="post" action="/gestao/licencas/${l.id}/atualizar"><button class="pequeno">Atualizar agora</button></form>`
            : ""}</td>
          <td data-r="Último contacto">${dataPt(l.ultima_comunicacao)}</td>
          <td>${l.tipo === "cortesia"
            ? html`${c?.email && !l.revogada
                ? html`<form method="post" action="/gestao/licencas/${l.id}/enviar"><button class="pequeno">Enviar por email</button></form>`
                : ""}
              <form method="post" action="/gestao/licencas/${l.id}/${l.revogada ? "reativar" : "revogar"}">
                <button class="${l.revogada ? "" : "perigo"} pequeno">${l.revogada ? "Reativar" : "Revogar"}</button></form>
`
            : ""}
            ${l.ultima_comunicacao || l.url_instalacao
              ? ""
              : html`<form method="post" action="/gestao/licencas/${l.id}/apagar"
                  onsubmit="return confirm(this.dataset.pergunta)" data-pergunta="${l.stripe_subscription_id
                    ? "Apagar esta licença? A assinatura no Stripe é cancelada (as faturas ficam)."
                    : "Apagar esta licença?"}">
                  <button class="perigo pequeno">Apagar</button></form>`}</td>
        </tr>`;
      })}
    </table></div>
    <section class="cartao">
      <h2>Nova licença de cortesia</h2>
      <p class="nota">Para a sua própria instalação e para os gestores do piloto. Não é cobrada.</p>
      <form method="post" action="/gestao/licencas">
        <label>Nome do gestor <input name="nome"></label>
        <label>Email do gestor (opcional) <input type="email" name="email"></label>
        <label class="opcao"><input type="checkbox" name="enviar" value="1" checked> Enviar-lhe a chave por email</label>
        <label>Alojamentos incluídos <input type="number" name="alojamentos" min="1" max="1000" value="1" required></label>
        <label>Notas (só para si) <input name="notas"></label>
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
    <div class="tabela"><table class="cartoes">
      <tr><th>Pago em</th><th>Cliente</th><th>Valor</th><th>Alojamentos</th><th>Estado</th><th></th></tr>
      ${linhas.map(({ fatura: f, cliente: c }) => html`<tr>
        <td data-r="Pago em">${dataPt(f.pago_em)}</td>
        <td data-r="Cliente">${c?.nome ?? c?.email ?? "—"}${c?.nif ? html`<br><small>NIF ${c.nif}</small>` : ""}</td>
        <td data-r="Valor">${euros(f.valor_cents)}</td>
        <td data-r="Alojamentos">${f.alojamentos}</td>
        <td data-r="Estado" class="${f.estado === "emitida" ? "" : "erro"}">${NOMES_FATURA[f.estado]}${f.numero ? html`<br><small>${f.numero}</small>` : ""}
          ${f.erro ? html`<br><small>${f.erro}</small>` : ""}</td>
        <td>${f.estado === "emitida"
          ? ""
          : html`${invoiceXpress ? html`<form method="post" action="/gestao/faturas/${f.id}/emitir"><button class="pequeno">Emitir</button></form>` : ""}
              <form method="post" action="/gestao/faturas/${f.id}/manual" class="linha">
                <input name="numero" placeholder="N.º emitida à mão" required><button class="pequeno">Registar</button></form>`}</td>
      </tr>`)}
    </table></div>`, { gestao: true });
}
