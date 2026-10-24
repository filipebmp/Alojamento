import { diferencaDias, idadeEm } from "./datas";

// Taxa Municipal Turística de Almada (Regulamento n.º 125/2026).
// Confirmar a idade mínima junto da CM Almada (">12 anos" vs "13 ou mais" — equivalentes
// se "superior a 12" for interpretado como ter 13 anos feitos).
export const TMT_ALMADA = {
  valorPorNoiteCents: 200,
  maxNoites: 5,
  idadeMinima: 13,
};

export interface HospedeTmt {
  data_nascimento: string;
}

export function noitesTributaveis(checkin: string, checkout: string): number {
  return Math.max(0, Math.min(diferencaDias(checkin, checkout), TMT_ALMADA.maxNoites));
}

export function hospedesTributaveis(hospedes: HospedeTmt[], checkin: string): number {
  return hospedes.filter((h) => idadeEm(h.data_nascimento, checkin) >= TMT_ALMADA.idadeMinima).length;
}

export function calcularTmt(checkin: string, checkout: string, hospedes: HospedeTmt[]) {
  const noites = noitesTributaveis(checkin, checkout);
  const tributaveis = hospedesTributaveis(hospedes, checkin);
  return {
    noites,
    hospedesTributaveis: tributaveis,
    dormidasTributaveis: noites * tributaveis,
    valorCents: noites * tributaveis * TMT_ALMADA.valorPorNoiteCents,
  };
}
