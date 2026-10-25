import { describe, expect, it } from "vitest";
import { barrasCalendario, diasNoMes, noitesEntre, numerosHoje } from "../src/lib/painel";

let id = 0;
const r = (checkin: string, checkout: string, extra: Partial<{ cancelada: number; valor: number; comissao: number; alojamento: number }> = {}) => ({
  id: ++id,
  alojamento_id: extra.alojamento ?? 1,
  checkin,
  checkout,
  cancelada: extra.cancelada ?? 0,
  ignorada: 0,
  valor_total_cents: extra.valor ?? 0,
  comissao_cents: extra.comissao ?? 0,
});

describe("números do painel", () => {
  it("noites dentro de um intervalo", () => {
    expect(noitesEntre(r("2026-10-30", "2026-11-03"), "2026-10-01", "2026-11-01")).toBe(2);
    expect(noitesEntre(r("2026-09-28", "2026-10-02"), "2026-10-01", "2026-11-01")).toBe(1);
    expect(noitesEntre(r("2026-11-05", "2026-11-07"), "2026-10-01", "2026-11-01")).toBe(0);
    expect(diasNoMes("2026-02")).toBe(28);
    expect(diasNoMes("2026-12")).toBe(31);
  });

  it("entradas, saídas, ocupação e receita do mês", () => {
    const n = numerosHoje([
      r("2026-10-25", "2026-10-28", { valor: 41280, comissao: 6192 }),
      r("2026-10-20", "2026-10-25", { valor: 30000 }),
      r("2026-10-24", "2026-10-26", { alojamento: 2 }),
      r("2026-10-25", "2026-10-27", { cancelada: 1, valor: 99900 }),
    ], 2, "2026-10-25");
    expect(n).toEqual({ entradas: 1, saidas: 1, hospedados: 1, ocupacao: Math.round((100 * 10) / 62), receitaCents: 41280 - 6192 + 30000 });
    expect(numerosHoje([], 0, "2026-10-25").ocupacao).toBeNull();
  });
});

describe("calendário", () => {
  it("posiciona as barras do meio do dia de entrada ao meio do de saída", () => {
    const [b] = barrasCalendario([r("2026-10-26", "2026-10-29")], "2026-10-25", 14);
    expect(b).toMatchObject({ inicio: 1.5, dias: 3, cortadaInicio: false, cortadaFim: false, linha: 0 });
  });

  it("corta as barras nas pontas da janela", () => {
    const barras = barrasCalendario([r("2026-10-20", "2026-10-26"), r("2026-11-05", "2026-11-12")], "2026-10-25", 14);
    expect(barras[0]).toMatchObject({ inicio: 0, dias: 1.5, cortadaInicio: true });
    expect(barras[1]).toMatchObject({ inicio: 11.5, dias: 2.5, cortadaFim: true });
  });

  it("inclui a saída na manhã do primeiro dia e ignora canceladas", () => {
    const barras = barrasCalendario([r("2026-10-22", "2026-10-25"), r("2026-10-26", "2026-10-27", { cancelada: 1 })], "2026-10-25", 14);
    expect(barras).toHaveLength(1);
    expect(barras[0]).toMatchObject({ inicio: 0, dias: 0.5 });
  });

  it("separa reservas sobrepostas em linhas, e a saída e a entrada no mesmo dia ficam na mesma linha", () => {
    const barras = barrasCalendario([r("2026-10-25", "2026-10-28"), r("2026-10-26", "2026-10-27"), r("2026-10-28", "2026-10-30")], "2026-10-25", 14);
    expect(barras.map((b) => b.linha)).toEqual([0, 1, 0]);
  });
});
