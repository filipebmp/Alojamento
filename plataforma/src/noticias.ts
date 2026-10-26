// Notícias do Alojamento Local para a gestão: pesquisas no Google Notícias (RSS), classificadas por tema
// e pelo que podem mudar no bookgest. Só para leitura interna do fornecedor.

import { CONCELHOS } from "../../app/src/lib/concelhos";

const RSS = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-PT&gl=PT&ceid=PT:pt-150`;

export const PESQUISAS = [
  '"alojamento local" when:3d',
  '"alojamento local" (lei OR decreto OR portaria OR regulamento OR "Diário da República") when:7d',
  '"taxa turística" when:3d',
  '(AIMA OR SIBA OR "boletim de alojamento") alojamento when:7d',
  '("registo de alojamento local" OR RNAL OR "zonas de contenção") when:7d',
  '("alojamento local" OR "arrendamento de curta duração") (IRS OR IVA OR Finanças OR imposto OR CEAL) when:7d',
  '(Airbnb OR Booking) Portugal (regras OR lei OR Bruxelas OR "União Europeia") when:7d',
];

export interface Tema {
  id: string;
  nome: string;
  // O que pode mudar no bookgest (null = só para estar a par).
  noBookgest: string | null;
  importante: boolean;
  regex: RegExp;
}

export const TEMAS: Tema[] = [
  { id: "legislacao", nome: "Legislação", noBookgest: "Rever regras e prazos da app", importante: true,
    regex: /\b(lei|leis|decreto|portaria|regulamento|diploma|di[aá]rio da rep[uú]blica|parlamento|assembleia|conselho de ministros|novas? regras?|proposta|aprovad[oa]s?|tribunal|constitucional|ac[oó]rd[aã]o)\b/i },
  { id: "registo", nome: "Registo e licenças", noBookgest: "Alojamentos (n.º de registo)", importante: true,
    regex: /\b(registos?|rnal|licen[cç]as?|suspens[aã]o|cancelamento|zonas? de conten[cç][aã]o|novos registos|condom[ií]nios?|c[aâ]mara municipal)\b/i },
  { id: "taxa", nome: "Taxa turística", noBookgest: "Taxa turística (tabela dos concelhos)", importante: true,
    regex: /taxa tur[ií]stica|taxa municipal tur[ií]stica|eco-?taxa|taxa de dormida/i },
  { id: "siba", nome: "SIBA / AIMA", noBookgest: "Envio ao SIBA", importante: true,
    regex: /\b(siba|aima|sef|boletins? de alojamento|comunica[cç][aã]o de h[oó]spedes)\b/i },
  { id: "fiscal", nome: "Fiscal", noBookgest: "Faturação", importante: true,
    regex: /\b(irs|iva|finan[cç]as|impostos?|fatura[cç][aã]o|faturas?|ceal|contribui[cç][aã]o extraordin[aá]ria|mais-valias|at\b)/i },
  { id: "plataformas", nome: "Plataformas", noBookgest: "Importação de reservas", importante: false,
    regex: /\b(airbnb|booking|vrbo|tripadvisor|rentalia|plataformas? digita(l|is))\b/i },
  { id: "mercado", nome: "Mercado", noBookgest: null, importante: false,
    regex: /\b(ine|dormidas|h[oó]spedes|ocupa[cç][aã]o|turistas?|receitas|pre[cç]os?)\b/i },
];

export interface Noticia {
  titulo: string;
  fonte: string;
  link: string;
  publicadaEm: string; // ISO
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function texto(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const campo = (item: string, nome: string) => item.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`))?.[1] ?? "";

export function lerRss(xml: string): Noticia[] {
  const itens: Noticia[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const fonte = texto(campo(item, "source"));
    let titulo = texto(campo(item, "title"));
    // O Google Notícias acrescenta " - Fonte" ao título.
    if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3));
    const link = texto(campo(item, "link"));
    const data = Date.parse(texto(campo(item, "pubDate")));
    if (!titulo || !/^https:\/\//.test(link) || Number.isNaN(data)) continue;
    itens.push({ titulo, fonte, link, publicadaEm: new Date(data).toISOString() });
  }
  return itens;
}

export function temasDe(titulo: string): Tema[] {
  return TEMAS.filter((t) => t.regex.test(titulo));
}

export const eImportante = (temas: string[]) => TEMAS.some((t) => t.importante && temas.includes(t.id));

// Título comparável, para não repetir a mesma notícia vinda de pesquisas diferentes.
export const chaveTitulo = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

const DIAS_GUARDADOS = 120;

// Vai buscar as pesquisas e guarda as notícias novas. Devolve quantas entraram.
export async function atualizarNoticias(db: D1Database, agora = new Date()): Promise<number> {
  const resultados = await Promise.allSettled(PESQUISAS.map(async (q) => {
    const res = await fetch(RSS(q), { headers: { "User-Agent": "Mozilla/5.0 (bookgest; leitor de noticias)" } });
    if (!res.ok) throw new Error(`Google Notícias respondeu ${res.status}`);
    return lerRss(await res.text());
  }));
  const vistas = new Set<string>();
  let novas = 0;
  for (const r of resultados) {
    if (r.status !== "fulfilled") {
      console.error("Notícias", r.reason);
      continue;
    }
    for (const n of r.value) {
      const chave = chaveTitulo(n.titulo);
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const temas = temasDe(n.titulo).map((t) => t.id);
      const res = await db.prepare(
        `INSERT INTO noticias (titulo, fonte, link, chave, temas, publicada_em, encontrada_em) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      ).bind(n.titulo, n.fonte, n.link, chave, temas.join(","), n.publicadaEm, agora.toISOString()).run();
      novas += res.meta.changes ?? 0;
    }
  }
  await db.prepare("DELETE FROM noticias WHERE publicada_em < ?").bind(new Date(agora.getTime() - DIAS_GUARDADOS * 86_400_000).toISOString()).run();
  await db.prepare("INSERT OR REPLACE INTO definicoes (chave, valor) VALUES ('noticias_em', ?)").bind(agora.toISOString()).run();
  return novas;
}

export interface NoticiaGuardada {
  id: number;
  titulo: string;
  fonte: string;
  link: string;
  temas: string;
  publicada_em: string;
  encontrada_em: string;
  vista: number;
}

// ---------- Comparação com a tabela de taxas turísticas do bookgest ----------

export interface ConcelhoNaNoticia {
  nome: string;
  valorCents: number | null; // null = sem taxa na tabela do bookgest
}

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Concelhos mencionados no título (o nome mais longo ganha: "Porto Santo" e não "Porto").
export function concelhosNaNoticia(titulo: string): ConcelhoNaNoticia[] {
  const t = ` ${semAcentos(titulo).replace(/[^a-z0-9]+/g, " ")} `;
  const encontrados = CONCELHOS
    .map((c) => ({ c, chave: semAcentos(c.nome.replace(/ \(.*\)$/, "")).replace(/[^a-z0-9]+/g, " ") }))
    .filter(({ chave }) => t.includes(` ${chave} `))
    .sort((a, b) => b.chave.length - a.chave.length);
  const usados: string[] = [];
  const resultado: ConcelhoNaNoticia[] = [];
  for (const { c, chave } of encontrados) {
    if (usados.some((u) => u.includes(chave))) continue;
    usados.push(chave);
    resultado.push({ nome: c.nome, valorCents: c.tmt?.valorPorNoiteCents ?? null });
  }
  return resultado;
}
