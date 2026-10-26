// Envio dos boletins de alojamento de hóspedes estrangeiros ao SIBA (webservice oficial, SOAP).
// Especificação: siba.ssi.gov.pt → Ajuda → Modos de envio (XML conforme BAL.XSD, enviado em Base64).

import { nomePais } from "./faturacao";
import { eEstrangeiro, hospedeCompleto } from "./regras";
import type { Hospede } from "./tipos";

export const SIBA_PRODUCAO = "https://siba.ssi.gov.pt/baws/boletinsalojamento.asmx";
export const SIBA_TESTES = "https://siba.ssi.gov.pt/bawsdev/boletinsalojamento.asmx";

// Dados do estabelecimento registado no SIBA (um por alojamento).
export interface ConfigSiba {
  alojamento_id: number;
  ativo: number;
  teste: number; // 1 = ambiente de desenvolvimento do SIBA
  nif: string; // NIPC/NIF da unidade (9 algarismos)
  estabelecimento: string; // atribuído pelo SIBA ("00" no primeiro)
  chave: string; // chave de acesso enviada pelo SIBA
  abreviatura: string;
  localidade: string;
  codigo_postal: string; // 0000-000
  telefone: string;
  contacto_nome: string;
  contacto_email: string;
  numero_ficheiro: number;
}

// ISO 3166-1 alfa-2 → código de país do SIBA (ICAO 9303: igual ao ISO alfa-3, exceto Alemanha "D" e Kosovo "RKS").
const ALFA3: Record<string, string> = {
  AD: "AND", AE: "ARE", AF: "AFG", AG: "ATG", AI: "AIA", AL: "ALB", AM: "ARM", AO: "AGO", AQ: "ATA", AR: "ARG", AS: "ASM",
  AT: "AUT", AU: "AUS", AW: "ABW", AX: "ALA", AZ: "AZE", BA: "BIH", BB: "BRB", BD: "BGD", BE: "BEL", BF: "BFA", BG: "BGR",
  BH: "BHR", BI: "BDI", BJ: "BEN", BL: "BLM", BM: "BMU", BN: "BRN", BO: "BOL", BQ: "BES", BR: "BRA", BS: "BHS", BT: "BTN",
  BV: "BVT", BW: "BWA", BY: "BLR", BZ: "BLZ", CA: "CAN", CC: "CCK", CD: "COD", CF: "CAF", CG: "COG", CH: "CHE", CI: "CIV",
  CK: "COK", CL: "CHL", CM: "CMR", CN: "CHN", CO: "COL", CR: "CRI", CU: "CUB", CV: "CPV", CW: "CUW", CX: "CXR", CY: "CYP",
  CZ: "CZE", DE: "D", DJ: "DJI", DK: "DNK", DM: "DMA", DO: "DOM", DZ: "DZA", EC: "ECU", EE: "EST", EG: "EGY", EH: "ESH",
  ER: "ERI", ES: "ESP", ET: "ETH", FI: "FIN", FJ: "FJI", FK: "FLK", FM: "FSM", FO: "FRO", FR: "FRA", GA: "GAB", GB: "GBR",
  GD: "GRD", GE: "GEO", GF: "GUF", GG: "GGY", GH: "GHA", GI: "GIB", GL: "GRL", GM: "GMB", GN: "GIN", GP: "GLP", GQ: "GNQ",
  GR: "GRC", GS: "SGS", GT: "GTM", GU: "GUM", GW: "GNB", GY: "GUY", HK: "HKG", HM: "HMD", HN: "HND", HR: "HRV", HT: "HTI",
  HU: "HUN", ID: "IDN", IE: "IRL", IL: "ISR", IM: "IMN", IN: "IND", IO: "IOT", IQ: "IRQ", IR: "IRN", IS: "ISL", IT: "ITA",
  JE: "JEY", JM: "JAM", JO: "JOR", JP: "JPN", KE: "KEN", KG: "KGZ", KH: "KHM", KI: "KIR", KM: "COM", KN: "KNA", KP: "PRK",
  KR: "KOR", KW: "KWT", KY: "CYM", KZ: "KAZ", LA: "LAO", LB: "LBN", LC: "LCA", LI: "LIE", LK: "LKA", LR: "LBR", LS: "LSO",
  LT: "LTU", LU: "LUX", LV: "LVA", LY: "LBY", MA: "MAR", MC: "MCO", MD: "MDA", ME: "MNE", MF: "MAF", MG: "MDG", MH: "MHL",
  MK: "MKD", ML: "MLI", MM: "MMR", MN: "MNG", MO: "MAC", MP: "MNP", MQ: "MTQ", MR: "MRT", MS: "MSR", MT: "MLT", MU: "MUS",
  MV: "MDV", MW: "MWI", MX: "MEX", MY: "MYS", MZ: "MOZ", NA: "NAM", NC: "NCL", NE: "NER", NF: "NFK", NG: "NGA", NI: "NIC",
  NL: "NLD", NO: "NOR", NP: "NPL", NR: "NRU", NU: "NIU", NZ: "NZL", OM: "OMN", PA: "PAN", PE: "PER", PF: "PYF", PG: "PNG",
  PH: "PHL", PK: "PAK", PL: "POL", PM: "SPM", PN: "PCN", PR: "PRI", PS: "PSE", PT: "PRT", PW: "PLW", PY: "PRY", QA: "QAT",
  RE: "REU", RO: "ROU", RS: "SRB", RU: "RUS", RW: "RWA", SA: "SAU", SB: "SLB", SC: "SYC", SD: "SDN", SE: "SWE", SG: "SGP",
  SH: "SHN", SI: "SVN", SJ: "SJM", SK: "SVK", SL: "SLE", SM: "SMR", SN: "SEN", SO: "SOM", SR: "SUR", SS: "SSD", ST: "STP",
  SV: "SLV", SX: "SXM", SY: "SYR", SZ: "SWZ", TC: "TCA", TD: "TCD", TF: "ATF", TG: "TGO", TH: "THA", TJ: "TJK", TK: "TKL",
  TL: "TLS", TM: "TKM", TN: "TUN", TO: "TON", TR: "TUR", TT: "TTO", TV: "TUV", TW: "TWN", TZ: "TZA", UA: "UKR", UG: "UGA",
  UM: "UMI", US: "USA", UY: "URY", UZ: "UZB", VA: "VAT", VC: "VCT", VE: "VEN", VG: "VGB", VI: "VIR", VN: "VNM", VU: "VUT",
  WF: "WLF", WS: "WSM", XK: "RKS", YE: "YEM", YT: "MYT", ZA: "ZAF", ZM: "ZMB", ZW: "ZWE",
};

export const codigoPaisSiba = (iso2: string) => ALFA3[iso2.toUpperCase()] ?? iso2.toUpperCase();

// Nomes: o SIBA só aceita letras (incluindo as acentuadas do português), apóstrofo, hífen e espaço.
const PERMITIDAS = /[A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç' -]/;

// Letras que não se decompõem em letra + acento.
const TRANSLITERAR: Record<string, string> = {
  ß: "ss", Ł: "L", ł: "l", Ø: "O", ø: "o", Đ: "D", đ: "d", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", Þ: "TH", þ: "th", ı: "i",
};

export function limparNome(s: string, max = 40): string {
  const limpo = [...s.trim()]
    .map((ch) => (PERMITIDAS.test(ch) ? ch : TRANSLITERAR[ch] ?? ch.normalize("NFD").replace(/[̀-ͯ]/g, "")))
    .join("")
    .replace(/[^A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.slice(0, max).trim();
}

// Apelido = última palavra; Nome = as restantes (com uma só palavra, vai tudo para o apelido).
export function dividirNome(completo: string): { apelido: string; nome: string } {
  const partes = limparNome(completo, 200).split(" ").filter(Boolean);
  const apelido = partes.pop() ?? "";
  return { apelido: apelido.slice(0, 40), nome: partes.join(" ").slice(0, 40).trim() };
}

export const limparDocumento = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const el = (nome: string, valor: string) => `<${nome}>${esc(valor)}</${nome}>`;
const data = (iso: string) => `${iso.slice(0, 10)}T00:00:00`;

export interface BoletimSiba {
  hospede: Hospede;
  checkin: string;
  checkout: string;
  localResidencia: string; // cidade de residência (obrigatório no SIBA)
}

// Hóspedes que têm de ser comunicados: estrangeiros com os dados completos e ainda não enviados.
export function hospedesParaEnviar(hospedes: (Hospede & { siba_enviado_em?: string | null })[]) {
  return hospedes.filter((h) => eEstrangeiro(h) && hospedeCompleto(h) && !h.siba_enviado_em);
}

export function xmlBoletins(cfg: ConfigSiba, nomeAlojamento: string, morada: string, boletins: BoletimSiba[], numeroFicheiro: number, agora: Date): string {
  const [cp, zona] = cfg.codigo_postal.split("-");
  const unidade =
    "<Unidade_Hoteleira>" +
    el("Codigo_Unidade_Hoteleira", cfg.nif) +
    el("Estabelecimento", cfg.estabelecimento) +
    el("Nome", nomeAlojamento.slice(0, 40)) +
    el("Abreviatura", (cfg.abreviatura || nomeAlojamento).slice(0, 15)) +
    el("Morada", morada.slice(0, 40)) +
    el("Localidade", cfg.localidade.slice(0, 30)) +
    el("Codigo_Postal", cp ?? "") +
    el("Zona_Postal", zona ?? "") +
    el("Telefone", cfg.telefone.replace(/\D/g, "").slice(0, 10)) +
    el("Fax", "") +
    el("Nome_Contacto", cfg.contacto_nome.slice(0, 40)) +
    el("Email_Contacto", cfg.contacto_email.slice(0, 140)) +
    "</Unidade_Hoteleira>";
  const linhas = boletins.map(({ hospede: h, checkin, checkout, localResidencia }) => {
    const { apelido, nome } = dividirNome(h.nome);
    return "<Boletim_Alojamento>" +
      el("Apelido", apelido) +
      (nome ? el("Nome", nome) : "") +
      el("Nacionalidade", codigoPaisSiba(h.nacionalidade!)) +
      el("Data_Nascimento", data(h.data_nascimento)) +
      el("Documento_Identificacao", limparDocumento(h.doc_numero!)) +
      el("Pais_Emissor_Documento", codigoPaisSiba(h.doc_pais!)) +
      el("Tipo_Documento", h.doc_tipo === "P" || h.doc_tipo === "B" ? h.doc_tipo : "O") +
      el("Data_Entrada", data(checkin)) +
      el("Data_Saida", data(checkout)) +
      el("Pais_Residencia_Origem", codigoPaisSiba(h.pais_residencia!)) +
      el("Local_Residencia_Origem", limparNome(localResidencia, 30) || nomePais(h.pais_residencia!).slice(0, 30)) +
      "</Boletim_Alojamento>";
  });
  const envio = `<Envio>${el("Numero_Ficheiro", String(numeroFicheiro))}${el("Data_Movimento", agora.toISOString().slice(0, 19))}</Envio>`;
  return `<?xml version="1.0" encoding="utf-8"?><MovimentoBAL xmlns="http://sef.pt/BAws">${unidade}${linhas.join("")}${envio}</MovimentoBAL>`;
}

const base64Utf8 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export function pedidoSoap(cfg: ConfigSiba, xml: string): string {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    '<EntregaBoletinsAlojamento xmlns="http://sef.pt/">' +
    el("UnidadeHoteleira", cfg.nif) +
    el("Estabelecimento", String(Number(cfg.estabelecimento) || 0)) +
    el("ChaveAcesso", cfg.chave) +
    el("Boletins", base64Utf8(xml)) +
    "</EntregaBoletinsAlojamento></soap:Body></soap:Envelope>";
}

const desescapar = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// "0" = aceite; caso contrário o SIBA devolve <ErrosBA> com um ou mais <RetornoBA>.
export function lerRespostaSiba(soap: string): { ok: true } | { ok: false; erro: string } {
  const r = soap.match(/<EntregaBoletinsAlojamentoResult>([\s\S]*?)<\/EntregaBoletinsAlojamentoResult>/);
  if (!r) {
    const falha = soap.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1];
    return { ok: false, erro: falha ? desescapar(falha).trim() : "Resposta do SIBA inesperada." };
  }
  const resultado = desescapar(r[1]).trim();
  if (resultado === "0") return { ok: true };
  const erros = [...resultado.matchAll(/<RetornoBA>([\s\S]*?)<\/RetornoBA>/g)].map((m) => {
    const campo = (n: string) => m[1].match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1]?.trim() ?? "";
    const linha = Number(campo("Linha"));
    return `${campo("Descricao")} (código ${campo("Codigo_Retorno")}${linha ? `, boletim ${linha}` : ""})`;
  });
  return { ok: false, erro: erros.length ? erros.join("; ") : resultado.slice(0, 300) };
}

export async function enviarSiba(cfg: ConfigSiba, xml: string, f: typeof fetch = fetch) {
  const res = await f(cfg.teste ? SIBA_TESTES : SIBA_PRODUCAO, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://sef.pt/EntregaBoletinsAlojamento"' },
    body: pedidoSoap(cfg, xml),
  });
  const texto = await res.text();
  if (!res.ok && !texto.includes("EntregaBoletinsAlojamentoResult")) {
    return { ok: false as const, erro: `O SIBA respondeu ${res.status}${texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] ? `: ${desescapar(texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/)![1])}` : ""}` };
  }
  return lerRespostaSiba(texto);
}

// Validação dos dados do estabelecimento (antes de ativar o envio automático).
export function validarConfigSiba(c: Omit<ConfigSiba, "alojamento_id" | "numero_ficheiro">): string | null {
  if (!/^\d{9}$/.test(c.nif)) return "O NIF/NIPC do SIBA tem 9 algarismos.";
  if (!/^\d{1,2}$/.test(c.estabelecimento)) return "O n.º do estabelecimento no SIBA tem 1 ou 2 algarismos (o primeiro é 00).";
  if (!/^\d+$/.test(c.chave)) return "A chave de acesso do SIBA só tem algarismos.";
  if (!/^\d{4}-\d{3}$/.test(c.codigo_postal)) return "Código postal no formato 0000-000.";
  if (!c.localidade.trim()) return "Indique a localidade do alojamento.";
  if (!/^\d{9,10}$/.test(c.telefone.replace(/\D/g, ""))) return "Indique um telefone com 9 algarismos.";
  if (!c.contacto_nome.trim()) return "Indique o nome do contacto.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contacto_email)) return "Indique o email de contacto.";
  return null;
}
