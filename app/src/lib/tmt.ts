import { diferencaDias, idadeEm } from "./datas";
import type { RegrasTmt } from "./tipos";

export interface HospedeTmt {
  data_nascimento: string;
}

export function cobraTmt(regras: RegrasTmt): boolean {
  return regras.valorPorNoiteCents > 0;
}

export function noitesTributaveis(checkin: string, checkout: string, regras: RegrasTmt): number {
  const noites = Math.max(0, diferencaDias(checkin, checkout));
  return regras.maxNoites > 0 ? Math.min(noites, regras.maxNoites) : noites;
}

export function hospedesTributaveis(hospedes: HospedeTmt[], checkin: string, regras: RegrasTmt): number {
  return hospedes.filter((h) => idadeEm(h.data_nascimento, checkin) >= regras.idadeMinima).length;
}

// Resumo para a declaração mensal: além das dormidas tributáveis, as câmaras pedem as
// dormidas não sujeitas (noites acima do limite) e as isentas (menores).
export function calcularTmt(checkin: string, checkout: string, hospedes: HospedeTmt[], regras: RegrasTmt) {
  if (!cobraTmt(regras)) {
    return { noites: 0, hospedesTributaveis: 0, dormidasTotais: 0, dormidasTributaveis: 0, dormidasAcimaLimite: 0, dormidasMenores: 0, valorCents: 0 };
  }
  const noitesEstadia = Math.max(0, diferencaDias(checkin, checkout));
  const noites = noitesTributaveis(checkin, checkout, regras);
  const tributaveis = hospedesTributaveis(hospedes, checkin, regras);
  const menores = hospedes.length - tributaveis;
  return {
    noites,
    hospedesTributaveis: tributaveis,
    dormidasTotais: noitesEstadia * hospedes.length,
    dormidasTributaveis: noites * tributaveis,
    dormidasAcimaLimite: (noitesEstadia - noites) * tributaveis,
    dormidasMenores: noitesEstadia * menores,
    valorCents: noites * tributaveis * regras.valorPorNoiteCents,
  };
}
