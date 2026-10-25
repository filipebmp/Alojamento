// Dados da fatura-recibo de uma reserva, prontos a copiar para o Portal das Finanças (Faturas e Recibos → Emitir).
// O Portal não permite emitir a partir de outro programa: o bookgest só prepara os campos.

import { diferencaDias } from "./datas";
import type { Alojamento, Faturacao, RegimeIva, Reserva } from "./tipos";

export const REGIMES_IVA: { valor: RegimeIva; nome: string }[] = [
  { valor: "6", nome: "IVA 6% (continente)" },
  { valor: "5", nome: "IVA 5% (Madeira)" },
  { valor: "4", nome: "IVA 4% (Açores)" },
  { valor: "isento", nome: "Isento (art. 53.º do CIVA)" },
];

export const regimeIvaValido = (v: string): v is RegimeIva => REGIMES_IVA.some((r) => r.valor === v);

export const MOTIVO_ISENCAO = "IVA - Regime de Isenção - Artigo 53.º n.º 1 do CIVA";

export const taxaIva = (r: RegimeIva) => (r === "isento" ? 0 : Number(r));

export const ivaDe = (semIvaCents: number, taxa: number) => Math.round((semIvaCents * taxa) / 100);

// Preço sem IVA tal que o Portal, ao somar o IVA arredondado ao cêntimo, chegue ao valor pago pelo hóspede.
// Alguns valores não são alcançáveis (ex.: 4,33 € com 6%): fica o mais próximo, com 1 cêntimo de diferença.
export function precoSemIva(totalCents: number, taxa: number): number {
  if (!taxa) return totalCents;
  const aprox = Math.round((totalCents * 100) / (100 + taxa));
  const comIva = (b: number) => b + ivaDe(b, taxa);
  return [aprox, aprox - 1, aprox + 1].find((b) => comIva(b) === totalCents) ?? aprox;
}

export function nomePais(codigo: string): string {
  try {
    return new Intl.DisplayNames(["pt-PT"], { type: "region" }).of(codigo.toUpperCase()) ?? codigo;
  } catch {
    return codigo;
  }
}

const dataPt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export interface FaturaPortal {
  adquirente: { pais: string; nomePais: string; nif: string; nome: string; morada: string | null };
  referencia: string;
  descricao: string;
  taxaIva: number;
  motivoIsencao: string | null;
  precoSemIvaCents: number;
  ivaCents: number;
  alojamentoCents: number; // com IVA, como o Portal o calcula (pode diferir 1 cêntimo do valor pago)
  diferencaCents: number; // alojamentoCents − valor pago pelo hóspede
  taxaTuristicaCents: number;
  totalCents: number;
}

export function faturaPortal(r: Reserva, a: Alojamento, f: Faturacao, taxaTuristicaCents: number): FaturaPortal {
  const taxa = taxaIva(a.regime_iva);
  const preco = precoSemIva(r.valor_total_cents, taxa);
  const noites = diferencaDias(r.checkin, r.checkout);
  const descricao = [
    `Alojamento local ${a.nome}`,
    a.registo_al ? `AL n.º ${a.registo_al}` : null,
    `de ${dataPt(r.checkin)} a ${dataPt(r.checkout)} (${noites} ${noites === 1 ? "noite" : "noites"})`,
    r.ref_booking ? `reserva ${r.ref_booking}` : null,
  ].filter(Boolean).join(", ");
  return {
    adquirente: {
      pais: f.pais.toUpperCase(),
      nomePais: nomePais(f.pais),
      nif: f.nif,
      nome: f.nome,
      morada: [f.morada, [f.codigo_postal, f.cidade].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    },
    referencia: r.ref_booking || `R${r.id}`,
    descricao,
    taxaIva: taxa,
    motivoIsencao: taxa ? null : MOTIVO_ISENCAO,
    precoSemIvaCents: preco,
    ivaCents: ivaDe(preco, taxa),
    alojamentoCents: preco + ivaDe(preco, taxa),
    diferencaCents: preco + ivaDe(preco, taxa) - r.valor_total_cents,
    taxaTuristicaCents,
    totalCents: preco + ivaDe(preco, taxa) + taxaTuristicaCents,
  };
}
