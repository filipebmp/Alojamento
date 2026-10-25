import { diferencaDias, idadeEm, somarDias } from "./datas";
import type { RegrasTmt } from "./tipos";

export interface HospedeTmt {
  data_nascimento: string;
}

export const temEpocas = (r: RegrasTmt) => r.valorBaixaCents != null && r.altaInicio != null && r.altaFim != null;

export function cobraTmt(regras: RegrasTmt): boolean {
  return regras.valorPorNoiteCents > 0 || (temEpocas(regras) && (regras.valorBaixaCents ?? 0) > 0);
}

// Mês na época alta (a época pode passar o fim do ano, ex.: novembro a fevereiro).
export function naEpocaAlta(mes: number, r: RegrasTmt): boolean {
  const de = r.altaInicio!;
  const ate = r.altaFim!;
  return de <= ate ? mes >= de && mes <= ate : mes >= de || mes <= ate;
}

// Valor da noite que começa no dia indicado (YYYY-MM-DD).
export function valorNoite(dia: string, r: RegrasTmt): number {
  if (!temEpocas(r)) return r.valorPorNoiteCents;
  return naEpocaAlta(Number(dia.slice(5, 7)), r) ? r.valorPorNoiteCents : r.valorBaixaCents!;
}

export function noitesTributaveis(checkin: string, checkout: string, regras: RegrasTmt): number {
  return valoresNoites(checkin, checkout, regras).length;
}

// Valores das noites cobradas: as primeiras da estadia até ao limite, sem as noites de época sem taxa.
function valoresNoites(checkin: string, checkout: string, regras: RegrasTmt): number[] {
  const noites = Math.max(0, diferencaDias(checkin, checkout));
  const limite = regras.maxNoites > 0 ? Math.min(noites, regras.maxNoites) : noites;
  return Array.from({ length: limite }, (_, i) => valorNoite(somarDias(checkin, i), regras)).filter((v) => v > 0);
}

export function hospedesTributaveis(hospedes: HospedeTmt[], checkin: string, regras: RegrasTmt): number {
  return hospedes.filter((h) => idadeEm(h.data_nascimento, checkin) >= regras.idadeMinima).length;
}

// Resumo para a declaração mensal: além das dormidas tributáveis, as câmaras pedem as
// dormidas não sujeitas (noites acima do limite ou fora da época da taxa) e as isentas (menores).
export function calcularTmt(checkin: string, checkout: string, hospedes: HospedeTmt[], regras: RegrasTmt) {
  if (!cobraTmt(regras)) {
    return { noites: 0, hospedesTributaveis: 0, dormidasTotais: 0, dormidasTributaveis: 0, dormidasAcimaLimite: 0, dormidasMenores: 0, valorCents: 0 };
  }
  const noitesEstadia = Math.max(0, diferencaDias(checkin, checkout));
  const valores = valoresNoites(checkin, checkout, regras);
  const noites = valores.length;
  const tributaveis = hospedesTributaveis(hospedes, checkin, regras);
  const menores = hospedes.length - tributaveis;
  return {
    noites,
    hospedesTributaveis: tributaveis,
    dormidasTotais: noitesEstadia * hospedes.length,
    dormidasTributaveis: noites * tributaveis,
    dormidasAcimaLimite: (noitesEstadia - noites) * tributaveis,
    dormidasMenores: noitesEstadia * menores,
    valorCents: valores.reduce((s, v) => s + v, 0) * tributaveis,
  };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const euros = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

// "2,00 € por hóspede e noite (abr–out), 1,00 € no resto do ano, máx. 7 noites"
export function descreverTmt(r: RegrasTmt): string {
  const limite = r.maxNoites ? `, máx. ${r.maxNoites} noites` : "";
  if (!temEpocas(r)) return `${euros(r.valorPorNoiteCents)} por hóspede e noite${limite}`;
  const epoca = `${MESES[r.altaInicio! - 1]}–${MESES[r.altaFim! - 1]}`;
  const resto = r.valorBaixaCents ? `, ${euros(r.valorBaixaCents)} no resto do ano` : ", sem taxa no resto do ano";
  return `${euros(r.valorPorNoiteCents)} por hóspede e noite (${epoca})${resto}${limite}`;
}
