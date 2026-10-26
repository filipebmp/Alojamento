// Inquérito mensal do INE (IPHH): hóspedes e dormidas por país de residência, utilização e volume de negócios.
// Regras do formulário oficial (instruções de preenchimento do IPHH no WebInq):
// - entraram: hóspedes com entrada no mês; dormiram: os que entraram mais os que transitaram do mês anterior;
// - dormidas: noites de cada hóspede dentro do mês (estadias que atravessam meses são divididas);
// - volume de negócios de aposento: sem IVA e sem taxa turística, só das noites do mês, arredondado ao euro.

import { taxaIva } from "./faturacao";
import { noitesEntre } from "./painel";
import type { Alojamento, Hospede, Reserva } from "./tipos";

export const MODALIDADES = [
  ["apartamento", "Apartamento"],
  ["moradia", "Moradia"],
  ["quartos", "Quartos"],
  ["hospedagem", "Estabelecimento de hospedagem"],
  ["hostel", "Hostel"],
] as const;

export const TIPOLOGIAS = ["T0", "T1", "T2", "T3", "T4", "T5", "T6"] as const;

// "PT" = residentes em Portugal (portugueses e estrangeiros); "??" = hóspedes ainda sem dados.
export const DESCONHECIDO = "??";

export interface LinhaIne {
  pais: string;
  entraram: number;
  dormiram: number;
  dormidas: number;
}

export interface RelatorioIne {
  mes: string;
  linhas: LinhaIne[]; // Portugal primeiro, depois por código de país
  total: LinhaIne;
  semMovimento: boolean;
  hospedesSemDados: number;
  utilizacoes: number; // noites em que o alojamento esteve ocupado no mês
  aposentoEuros: number; // sem IVA e sem taxa turística
  diasMes: number;
}

function primeiroDia(mes: string) {
  return `${mes}-01`;
}

function mesSeguinte(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export function paisResidencia(h: Pick<Hospede, "pais_residencia" | "nacionalidade">): string {
  return (h.pais_residencia ?? (h.nacionalidade === "PT" ? "PT" : h.nacionalidade) ?? DESCONHECIDO).toUpperCase();
}

export function relatorioIne(
  reservas: { reserva: Reserva; hospedes: Pick<Hospede, "pais_residencia" | "nacionalidade">[] }[],
  alojamento: Pick<Alojamento, "regime_iva">,
  mes: string,
): RelatorioIne {
  const inicio = primeiroDia(mes);
  const fim = mesSeguinte(mes);
  const porPais = new Map<string, LinhaIne>();
  const linha = (pais: string) => {
    let l = porPais.get(pais);
    if (!l) porPais.set(pais, (l = { pais, entraram: 0, dormiram: 0, dormidas: 0 }));
    return l;
  };
  let utilizacoes = 0;
  let aposentoCents = 0;
  let semDados = 0;
  const iva = taxaIva(alojamento.regime_iva);

  for (const { reserva: r, hospedes } of reservas) {
    if (r.cancelada || r.ignorada) continue;
    const noites = noitesEntre(r, inicio, fim);
    if (!noites) continue;
    const entrou = r.checkin >= inicio && r.checkin < fim;
    const paises = hospedes.map(paisResidencia);
    const emFalta = Math.max(0, r.n_hospedes - hospedes.length);
    for (let i = 0; i < emFalta; i++) paises.push(DESCONHECIDO);
    semDados += emFalta;
    for (const p of paises) {
      const l = linha(p);
      if (entrou) l.entraram++;
      l.dormiram++;
      l.dormidas += noites;
    }
    utilizacoes += noites;
    // Valor pago (com IVA, sem taxa turística) repartido pelas noites; só as do mês.
    const totalNoites = Math.max(1, noitesEntre(r, r.checkin, r.checkout));
    aposentoCents += (r.valor_total_cents * noites) / totalNoites / (1 + iva / 100);
  }

  const linhas = [...porPais.values()].sort((a, b) =>
    a.pais === "PT" ? -1 : b.pais === "PT" ? 1 : a.pais === DESCONHECIDO ? 1 : b.pais === DESCONHECIDO ? -1 : a.pais.localeCompare(b.pais),
  );
  const total = linhas.reduce((t, l) => ({ pais: "", entraram: t.entraram + l.entraram, dormiram: t.dormiram + l.dormiram, dormidas: t.dormidas + l.dormidas }),
    { pais: "", entraram: 0, dormiram: 0, dormidas: 0 });
  const diasMes = Math.round((Date.parse(fim) - Date.parse(inicio)) / 86_400_000);
  return { mes, linhas, total, semMovimento: !total.dormidas, hospedesSemDados: semDados, utilizacoes, aposentoEuros: Math.round(aposentoCents / 100), diasMes };
}

// CSV (separador ";", como o Excel em português) com o quadro 1 e os outros dados.
export function csvIne(r: RelatorioIne, nomeAlojamento: string, nomePais: (c: string) => string, capacidade: string[]): string {
  const linhas = [
    `Alojamento;${nomeAlojamento}`,
    `Mês;${r.mes}`,
    "",
    "País de residência;Código;Hóspedes que entraram no mês;Hóspedes que dormiram no mês;Dormidas",
    ...r.linhas.map((l) => `${l.pais === "PT" ? "Residentes em Portugal" : l.pais === DESCONHECIDO ? "Sem dados (completar)" : nomePais(l.pais)};${l.pais};${l.entraram || ""};${l.dormiram};${l.dormidas}`),
    `Total;;${r.total.entraram};${r.total.dormiram};${r.total.dormidas}`,
    "",
    ...capacidade,
    `Número de utilizações no mês;${r.utilizacoes}`,
    `Dias de abertura;${r.diasMes}`,
    `Volume de negócios total (sem IVA e sem taxa turística);${r.aposentoEuros}`,
    `do qual de aposento;${r.aposentoEuros}`,
  ];
  return `﻿${linhas.join("\r\n")}\r\n`;
}
