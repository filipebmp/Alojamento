// Lê os emails de reserva do Booking e do Airbnb (português e inglês) e extrai só os dados da reserva.
// O email em si não é guardado: só estes dados seguem para a instalação do gestor.
// Os formatos das plataformas mudam: tudo é "melhor esforço" e os campos que não se encontram ficam vazios.

import type { DadosEmailReserva, PlataformaEmail as Plataforma, TipoEmail } from "../../comum/emails";

export type { DadosEmailReserva };

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, january: 1, fev: 2, fevereiro: 2, feb: 2, february: 2, mar: 3, marco: 3, março: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4, mai: 5, maio: 5, may: 5, jun: 6, junho: 6, june: 6, jul: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8, set: 9, setembro: 9, sep: 9, sept: 9, september: 9, out: 10, outubro: 10,
  oct: 10, october: 10, nov: 11, novembro: 11, november: 11, dez: 12, dezembro: 12, dec: 12, december: 12,
};

const iso = (a: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

// Ano em falta ("15 nov"): a próxima ocorrência a partir de hoje (as reservas são futuras).
function comAno(m: number, d: number, agora: Date): string | null {
  const a = agora.getUTCFullYear();
  const esteAno = iso(a, m, d);
  if (!esteAno) return null;
  return esteAno >= agora.toISOString().slice(0, 10) ? esteAno : iso(a + 1, m, d);
}

const P_MES = "([A-Za-zçÇ]{3,9})\\.?";

interface DataEncontrada {
  data: string;
  pos: number;
}

// Todas as datas do texto, pela ordem em que aparecem.
export function encontrarDatas(texto: string, agora = new Date()): DataEncontrada[] {
  const res: DataEncontrada[] = [];
  const add = (data: string | null, pos: number) => data && res.push({ data, pos });
  const mes = (s: string) => MESES[s.toLowerCase()];
  let m: RegExpExecArray | null;
  // 15 de novembro de 2026 · 15 nov 2026 · 15 nov. · 15 de nov.
  const r1 = new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+${P_MES}(?:\\s+(?:de\\s+)?(\\d{4}))?`, "g");
  while ((m = r1.exec(texto))) if (mes(m[2])) add(m[3] ? iso(+m[3], mes(m[2]), +m[1]) : comAno(mes(m[2]), +m[1], agora), m.index);
  // Nov 15, 2026 · November 15 · Sat, Nov 15
  const r2 = new RegExp(`\\b${P_MES}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`, "g");
  while ((m = r2.exec(texto))) if (mes(m[1])) add(m[3] ? iso(+m[3], mes(m[1]), +m[2]) : comAno(mes(m[1]), +m[2], agora), m.index);
  // 15/11/2026 · 2026-11-15
  const r3 = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  while ((m = r3.exec(texto))) add(iso(+m[3], +m[2], +m[1]), m.index);
  const r4 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = r4.exec(texto))) add(iso(+m[1], +m[2], +m[3]), m.index);
  return res.sort((a, b) => a.pos - b.pos);
}

// Primeira data depois de um dos rótulos (ex.: "Check-in", "Chegada").
function dataDepoisDe(texto: string, datas: DataEncontrada[], rotulos: RegExp): string | undefined {
  const m = rotulos.exec(texto);
  if (!m) return undefined;
  return datas.find((d) => d.pos >= m.index && d.pos - m.index < 120)?.data;
}

// "€ 1.234,56", "€1,234.56", "1 234,56 €", "EUR 123.45" → cêntimos.
export function valorCents(s: string): number | undefined {
  const m = s.match(/(?:€|EUR)\s*([\d\s.,]+\d)|([\d\s.,]*\d)\s*(?:€|EUR)/i);
  const bruto = (m?.[1] ?? m?.[2])?.replace(/\s/g, "");
  if (!bruto) return undefined;
  const ultimo = Math.max(bruto.lastIndexOf(","), bruto.lastIndexOf("."));
  const decimal = ultimo >= 0 && bruto.length - ultimo - 1 === 2;
  const inteiro = (decimal ? bruto.slice(0, ultimo) : bruto).replace(/[.,]/g, "");
  const cents = Number(inteiro) * 100 + (decimal ? Number(bruto.slice(ultimo + 1)) : 0);
  return Number.isFinite(cents) && cents > 0 ? cents : undefined;
}

function valorDepoisDe(texto: string, rotulos: RegExp): number | undefined {
  const m = rotulos.exec(texto);
  return m ? valorCents(texto.slice(m.index + m[0].length, m.index + m[0].length + 60)) : undefined;
}

function linhaDepoisDe(texto: string, rotulos: RegExp): string | undefined {
  const m = texto.match(rotulos);
  const v = m?.[1]?.trim().replace(/\s{2,}/g, " ");
  return v && v.length <= 80 ? v : undefined;
}

export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&euro;/g, "€").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export function lerEmailReserva(e: { de: string; assunto: string; texto: string }, agora = new Date()): DadosEmailReserva {
  const assunto = e.assunto.trim();
  const tudo = `${assunto}\n${e.texto}`;
  const de = e.de.toLowerCase();

  // Confirmação do reencaminhamento automático do Gmail.
  if (de.includes("forwarding-noreply@google.com") || /gmail forwarding confirmation|confirmação do encaminhamento/i.test(assunto)) {
    return {
      plataforma: "desconhecida",
      tipo: "confirmacao_reencaminhamento",
      assunto,
      confirmacao: {
        codigo: e.texto.match(/\b(\d{9})\b/)?.[1],
        link: e.texto.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"<>)]+/)?.[0],
      },
    };
  }

  const plataforma: Plataforma = /airbnb/i.test(de) || /airbnb\.com/i.test(tudo) ? "airbnb" : /booking\.com/i.test(de) || /booking\.com/i.test(tudo) ? "booking" : "desconhecida";
  const tipo: TipoEmail = /cancel/i.test(assunto)
    ? "cancelada"
    : /alter|modif|chang/i.test(assunto)
      ? "alterada"
      : /nova reserva|new (booking|reservation)|reserva confirmada|reservation confirmed|booking confirmed|confirmed booking/i.test(assunto)
        ? "nova"
        : "desconhecido";

  const datas = encontrarDatas(tudo, agora);
  let checkin = dataDepoisDe(tudo, datas, /check-?in|chegada|entrada|arriv/i);
  let checkout = dataDepoisDe(tudo, datas, /check-?out|sa[íi]da|partida|depart/i);
  if (!checkin || !checkout || checkout <= checkin) {
    // Sem rótulos: as duas primeiras datas distintas e crescentes.
    const unicas = [...new Set(datas.map((d) => d.data))];
    const i = unicas.findIndex((d, k) => k + 1 < unicas.length && unicas[k + 1] > d);
    if (i >= 0) [checkin, checkout] = [checkin ?? unicas[i], unicas[i + 1]];
  }
  if (checkin && checkout && checkout <= checkin) checkout = undefined;

  const codigo = plataforma === "airbnb"
    ? tudo.match(/\bHM[A-Z0-9]{8}\b/)?.[0]
    : tudo.match(/(?:n\.?º|n[úu]mero|number|confirma[çc][ãa]o|booking)\s*(?:da reserva|de reserva|of booking)?\s*:?\s*#?\s*(\d{9,11})\b/i)?.[1]
      ?? assunto.match(/\((\d{9,11})\b/)?.[1];

  const nome =
    linhaDepoisDe(assunto, /(?:confirmed|confirmada|reserva de|booking for)\s*[-–—:]?\s*(.+?)\s+(?:arrives|chega|est[áa] a chegar)\b/i) ??
    linhaDepoisDe(e.texto, /(?:nome do h[óo]spede|guest name|h[óo]spede principal|booker name|nome do cliente)\s*:?\s*([^\n]+)/i);

  const adultos = Number(tudo.match(/(\d+)\s*(?:adultos?|adults?)/i)?.[1] ?? 0);
  const criancas = Number(tudo.match(/(\d+)\s*(?:crian[çc]as?|children|child|kids?)/i)?.[1] ?? 0);
  const total = Number(tudo.match(/(\d+)\s*(?:h[óo]spedes|guests)/i)?.[1] ?? 0);
  const hospedes = adultos + criancas || total || undefined;

  const totalCents = valorDepoisDe(tudo, /(?:pre[çc]o total|valor total|total price|total \(eur\)|guest paid|o h[óo]spede pagou|total)\s*:?/i);
  const comissaoCents = valorDepoisDe(tudo, /(?:comiss[ãa]o|commission|taxa de servi[çc]o do anfitri[ãa]o|host service fee)\s*:?/i);
  const propriedade = linhaDepoisDe(e.texto, /(?:propriedade|property|alojamento|an[úu]ncio|listing)\s*:\s*([^\n]+)/i);

  const dados: DadosEmailReserva = { plataforma, tipo, assunto, codigo, nome, checkin, checkout, hospedes, totalCents, comissaoCents, propriedade };
  // Sem datas nem código, o gestor precisa de ver o essencial para decidir (texto curto, sem anexos).
  if (!codigo && !(checkin && checkout)) dados.texto = e.texto.replace(/\s+/g, " ").slice(0, 1500);
  return dados;
}
