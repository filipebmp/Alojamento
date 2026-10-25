// Números do ecrã "Hoje" e barras do calendário, a partir das reservas (sem acesso à base de dados).

import { diferencaDias, somarDias } from "./datas";
import type { Reserva } from "./tipos";

type R = Pick<Reserva, "id" | "alojamento_id" | "checkin" | "checkout" | "cancelada" | "ignorada" | "valor_total_cents" | "comissao_cents">;

const conta = (r: Pick<Reserva, "cancelada" | "ignorada">) => !r.cancelada && !r.ignorada;

// Noites da reserva dentro do intervalo [inicio, fim[.
export function noitesEntre(r: Pick<Reserva, "checkin" | "checkout">, inicio: string, fim: string): number {
  const de = r.checkin > inicio ? r.checkin : inicio;
  const ate = r.checkout < fim ? r.checkout : fim;
  return Math.max(0, diferencaDias(de, ate));
}

export function diasNoMes(mes: string): number {
  return diferencaDias(`${mes}-01`, primeiroDoMesSeguinte(mes));
}

function primeiroDoMesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export interface NumerosHoje {
  entradas: number;
  saidas: number;
  hospedados: number; // reservas a decorrer (entraram antes de hoje e saem depois)
  ocupacao: number | null; // 0–100, no mês de hoje; null sem alojamentos
  receitaCents: number; // valor sem comissões das reservas com entrada no mês
}

export function numerosHoje(reservas: R[], alojamentos: number, hoje: string): NumerosHoje {
  const mes = hoje.slice(0, 7);
  const inicio = `${mes}-01`;
  const fim = primeiroDoMesSeguinte(mes);
  const validas = reservas.filter(conta);
  const noites = validas.reduce((n, r) => n + noitesEntre(r, inicio, fim), 0);
  return {
    entradas: validas.filter((r) => r.checkin === hoje).length,
    saidas: validas.filter((r) => r.checkout === hoje).length,
    hospedados: validas.filter((r) => r.checkin < hoje && r.checkout > hoje).length,
    ocupacao: alojamentos ? Math.round((100 * noites) / (alojamentos * diasNoMes(mes))) : null,
    receitaCents: validas
      .filter((r) => r.checkin >= inicio && r.checkin < fim)
      .reduce((s, r) => s + Math.max(0, r.valor_total_cents - r.comissao_cents), 0),
  };
}

export interface Barra<T> {
  reserva: T;
  inicio: number; // posição em dias desde o início da janela (meio do dia de entrada)
  dias: number; // comprimento em dias
  cortadaInicio: boolean;
  cortadaFim: boolean;
  linha: number; // reservas sobrepostas no mesmo alojamento ficam em linhas diferentes
}

// Barras de um alojamento numa janela de `dias` dias a partir de `inicio`.
// Cada estadia vai do meio do dia de entrada ao meio do dia de saída.
export function barrasCalendario<T extends R>(reservas: T[], inicio: string, dias: number): Barra<T>[] {
  const fim = somarDias(inicio, dias);
  const visiveis = reservas
    .filter((r) => conta(r) && r.checkout > somarDias(inicio, -1) && r.checkin < fim)
    .sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : a.id - b.id));
  const fimLinhas: string[] = [];
  return visiveis.map((r) => {
    let linha = fimLinhas.findIndex((f) => f <= r.checkin);
    if (linha < 0) linha = fimLinhas.push(r.checkout) - 1;
    else fimLinhas[linha] = r.checkout;
    const a = diferencaDias(inicio, r.checkin) + 0.5;
    const b = diferencaDias(inicio, r.checkout) + 0.5;
    const de = Math.max(0, a);
    const ate = Math.min(dias, b);
    return { reserva: r, inicio: de, dias: ate - de, cortadaInicio: a < 0, cortadaFim: b > dias, linha };
  }).filter((b) => b.dias > 0);
}
