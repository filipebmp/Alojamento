import { describe, expect, it } from "vitest";
import { DESCONHECIDO, csvIne, relatorioIne } from "../src/lib/ine";
import type { Reserva } from "../src/lib/tipos";

let id = 0;
const reserva = (checkin: string, checkout: string, n: number, valor = 0, extra: Partial<Reserva> = {}) =>
  ({ id: ++id, checkin, checkout, n_hospedes: n, valor_total_cents: valor, cancelada: 0, ignorada: 0, ...extra }) as Reserva;
const h = (pais: string | null, nac = "XX") => ({ pais_residencia: pais, nacionalidade: nac });

describe("relatório do INE", () => {
  // Exemplo das instruções oficiais do IPHH (mês de 30 dias).
  it("reproduz o exemplo das instruções de preenchimento", () => {
    const r = relatorioIne([
      { reserva: reserva("2026-06-03", "2026-06-09", 2), hospedes: [h("DE"), h("DE")] },
      { reserva: reserva("2026-06-10", "2026-06-15", 4), hospedes: [h("AU"), h("AU"), h("AU"), h("AU")] },
      { reserva: reserva("2026-06-16", "2026-06-19", 1), hospedes: [h("BE")] },
      { reserva: reserva("2026-05-30", "2026-06-03", 2), hospedes: [h("CA"), h("CA")] }, // entrou no mês anterior: 2 noites em junho
      { reserva: reserva("2026-06-20", "2026-06-22", 3), hospedes: [h("ES"), h("ES"), h("ES")] },
      { reserva: reserva("2026-06-23", "2026-06-27", 2), hospedes: [h("ES"), h("ES")] },
    ], { regime_iva: "6" }, "2026-06");
    expect(r.linhas).toEqual([
      { pais: "AU", entraram: 4, dormiram: 4, dormidas: 20 },
      { pais: "BE", entraram: 1, dormiram: 1, dormidas: 3 },
      { pais: "CA", entraram: 0, dormiram: 2, dormidas: 4 },
      { pais: "DE", entraram: 2, dormiram: 2, dormidas: 12 },
      { pais: "ES", entraram: 5, dormiram: 5, dormidas: 14 },
    ]);
    expect(r.total).toMatchObject({ entraram: 12, dormiram: 14, dormidas: 53 });
    expect(r.utilizacoes).toBe(6 + 5 + 3 + 2 + 2 + 4);
    expect(r.semMovimento).toBe(false);
  });

  it("residentes em Portugal primeiro (portugueses sem país de residência contam como PT), hóspedes sem dados no fim", () => {
    const r = relatorioIne([
      { reserva: reserva("2026-06-01", "2026-06-03", 3), hospedes: [h(null, "PT"), h("PT", "BR")] },
      { reserva: reserva("2026-06-05", "2026-06-06", 1), hospedes: [h("FR")] },
    ], { regime_iva: "6" }, "2026-06");
    expect(r.linhas.map((l) => [l.pais, l.dormidas])).toEqual([["PT", 4], ["FR", 1], [DESCONHECIDO, 2]]);
    expect(r.hospedesSemDados).toBe(1);
  });

  it("volume de negócios: só as noites do mês, sem IVA, arredondado ao euro; canceladas não contam", () => {
    const r = relatorioIne([
      { reserva: reserva("2026-06-29", "2026-07-03", 2, 42400), hospedes: [h("ES"), h("ES")] }, // 2 de 4 noites em junho
      { reserva: reserva("2026-06-10", "2026-06-12", 2, 99900, { cancelada: 1 }), hospedes: [] },
    ], { regime_iva: "6" }, "2026-06");
    expect(r.aposentoEuros).toBe(200); // 424 € / 2 / 1,06
    expect(r.utilizacoes).toBe(2);
    expect(relatorioIne([], { regime_iva: "isento" }, "2026-02")).toMatchObject({ semMovimento: true, diasMes: 28, linhas: [] });
  });

  it("CSV para guardar", () => {
    const r = relatorioIne([{ reserva: reserva("2026-06-01", "2026-06-03", 1, 10600), hospedes: [h("ES")] }], { regime_iva: "6" }, "2026-06");
    const csv = csvIne(r, "Casa", (c) => (c === "ES" ? "Espanha" : c), ["Tipologia;T1"]);
    expect(csv).toContain("Espanha;ES;1;1;2\r\n");
    expect(csv).toContain("do qual de aposento;100");
  });
});
