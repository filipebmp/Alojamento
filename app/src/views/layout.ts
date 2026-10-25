import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { VERSAO } from "../versao";

type Conteudo = HtmlEscapedString | Promise<HtmlEscapedString>;

export type Seccao = "hoje" | "calendario" | "reservas" | "tmt" | "alojamentos" | "emails" | "definicoes" | "conta" | "mais";

// Ícones de traço (24×24), herdam a cor do texto.
const ICONES = {
  hoje: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  reservas: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  tmt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  alojamentos: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  emails: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  definicoes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  conta: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mais: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  mais_reserva: '<path d="M12 5v14M5 12h14"/>',
  voltar: '<path d="M15 6l-6 6 6 6"/>',
  seguinte: '<path d="M9 6l6 6-6 6"/>',
  visto: '<path d="M5 12l5 5 9-10"/>',
  whatsapp: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12z"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  moeda: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4 4 0 1 0 0 7M7 11h6M7 13.5h6"/>',
  sair: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
} as const;

export type NomeIcone = keyof typeof ICONES;

export function icone(nome: NomeIcone, tamanho = 22) {
  return raw(`<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`);
}

interface ItemMenu {
  seccao: Seccao;
  nome: string;
  curto?: string;
  link: string;
}

const MENU_GESTOR: ItemMenu[] = [
  { seccao: "hoje", nome: "Hoje", link: "/admin" },
  { seccao: "calendario", nome: "Calendário", link: "/admin/calendario" },
  { seccao: "reservas", nome: "Reservas", link: "/admin/reservas" },
  { seccao: "tmt", nome: "Taxa turística", curto: "Taxas", link: "/admin/tmt" },
  { seccao: "alojamentos", nome: "Alojamentos", link: "/admin/alojamentos" },
  { seccao: "emails", nome: "Emails de reserva", link: "/admin/emails" },
  { seccao: "definicoes", nome: "Definições", link: "/admin/definicoes" },
  { seccao: "conta", nome: "A minha conta", link: "/admin/conta" },
];

const MENU_EQUIPA: ItemMenu[] = [
  { seccao: "hoje", nome: "Hoje", link: "/admin" },
  { seccao: "calendario", nome: "Calendário", link: "/admin/calendario" },
  { seccao: "reservas", nome: "Reservas", link: "/admin/reservas" },
  { seccao: "conta", nome: "A minha conta", curto: "Conta", link: "/admin/conta" },
];

// No telemóvel, o gestor vê 4 secções e "Mais" com as restantes.
const SEPARADORES_GESTOR: Seccao[] = ["hoje", "calendario", "reservas", "tmt"];

function menu(papel: true | "equipa", ativa: Seccao | undefined) {
  const itens = papel === "equipa" ? MENU_EQUIPA : MENU_GESTOR;
  const separadores = papel === "equipa" ? itens : itens.filter((i) => SEPARADORES_GESTOR.includes(i.seccao));
  const noMais = papel !== "equipa" && !!ativa && !SEPARADORES_GESTOR.includes(ativa);
  const atual = (s: Seccao) => (s === ativa ? raw(' aria-current="page"') : "");
  return html`
    <aside class="lateral">
      <a href="/admin" class="marca"><span class="logo">${icone("hoje", 16)}</span>bookgest</a>
      <nav aria-label="Menu">${itens.map((i) => html`<a href="${i.link}"${atual(i.seccao)}>${icone(i.seccao as NomeIcone, 20)}${i.nome}</a>`)}</nav>
      <form method="post" action="/logout"><button class="discreto">${icone("sair", 20)}Terminar sessão</button></form>
    </aside>
    <nav class="separadores" aria-label="Menu" style="--n: ${separadores.length + (papel === "equipa" ? 0 : 1)}">
      ${separadores.map((i) => html`<a href="${i.link}"${atual(i.seccao)}>${icone(i.seccao as NomeIcone)}${i.curto ?? i.nome}</a>`)}
      ${papel === "equipa" ? "" : html`<a href="/admin/mais"${noMais ? raw(' aria-current="page"') : ""}>${icone("mais")}Mais</a>`}
    </nav>`;
}

// admin: true = menu do gestor; "equipa" = menu reduzido da equipa. seccao: a entrada do menu assinalada.
// botaoNovo: botão flutuante "Nova reserva" (telemóvel).
export function pagina(titulo: string, corpo: Conteudo, opcoes: { admin?: boolean | "equipa"; seccao?: Seccao; botaoNovo?: boolean } = {}) {
  return html`<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f6f3" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#111513" media="(prefers-color-scheme: dark)">
  <title>${titulo}</title>
  ${opcoes.admin ? html`<link rel="manifest" href="/manifest.webmanifest">` : ""}
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/estilo.css?v=${VERSAO}">
</head>
<body class="${opcoes.admin ? "com-menu" : ""}">
  ${opcoes.admin ? menu(opcoes.admin, opcoes.seccao) : ""}
  <main>${corpo}</main>
  ${opcoes.admin && opcoes.botaoNovo
    ? html`<a class="flutuante" href="/admin/reservas/nova" aria-label="Nova reserva">${icone("mais_reserva", 24)}</a>`
    : ""}
  ${opcoes.admin ? html`<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")</script>` : ""}
</body>
</html>`;
}

export function dataPt(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const partes = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
};

// "domingo, 25 de outubro"
export function dataExtenso(iso: string): string {
  const p = partes(iso);
  return `${SEMANA[p.semana]}, ${p.d} de ${MESES[p.m - 1]}`;
}

// "dom, 25 out"
export function dataCurta(iso: string): string {
  const p = partes(iso);
  return `${SEMANA_CURTA[p.semana]}, ${p.d} ${MESES_CURTOS[p.m - 1]}`;
}

export const nomeMes = (iso: string) => MESES[partes(iso).m - 1];
export const mesCurto = (iso: string) => MESES_CURTOS[partes(iso).m - 1];
export const diaSemana = (iso: string) => SEMANA_CURTA[partes(iso).semana];
