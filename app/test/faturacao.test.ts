import { describe, expect, it } from "vitest";
import { faturaPortal, nomePais, precoSemIva } from "../src/lib/faturacao";
import type { Alojamento, Faturacao, Reserva } from "../src/lib/tipos";

describe("preço sem IVA", () => {
  it("o IVA arredondado soma o valor pago, ou fica a 1 cêntimo quando não há preço exato", () => {
    for (const taxa of [6, 5, 4]) {
      for (let total = 100; total < 60000; total += 37) {
        const b = precoSemIva(total, taxa);
        const comIva = b + Math.round((b * taxa) / 100);
        expect(Math.abs(comIva - total)).toBeLessThanOrEqual(1);
        const exato = [b - 2, b - 1, b, b + 1, b + 2].some((x) => x + Math.round((x * taxa) / 100) === total);
        if (exato) expect(comIva).toBe(total);
      }
    }
    expect(precoSemIva(41280, 6)).toBe(38943);
  });

  it("isento: o preço é o valor pago", () => {
    expect(precoSemIva(41280, 0)).toBe(41280);
  });
});

describe("fatura para o Portal das Finanças", () => {
  const r = { id: 7, ref_booking: "4123456789", checkin: "2026-10-25", checkout: "2026-10-28", valor_total_cents: 41280 } as Reserva;
  const f = { reserva_id: 7, nome: "Hans Müller", nif: "C01X00T47", pais: "de", morada: "Hauptstr. 1", codigo_postal: "10115", cidade: "Berlin", email: null } as Faturacao;
  const a = { nome: "Casa da Praia", registo_al: "12345/AL", regime_iva: "6" } as Alojamento;

  it("prepara adquirente, descrição e valores", () => {
    const x = faturaPortal(r, a, f, 1200);
    expect(x).toMatchObject({
      adquirente: { pais: "DE", nif: "C01X00T47", nome: "Hans Müller", morada: "Hauptstr. 1, 10115 Berlin" },
      referencia: "4123456789",
      descricao: "Alojamento local Casa da Praia, AL n.º 12345/AL, de 25/10/2026 a 28/10/2026 (3 noites), reserva 4123456789",
      taxaIva: 6,
      motivoIsencao: null,
      diferencaCents: 0,
      precoSemIvaCents: 38943,
      ivaCents: 2337,
      totalCents: 42480,
    });
  });

  it("regime de isenção", () => {
    const x = faturaPortal({ ...r, ref_booking: null }, { ...a, regime_iva: "isento", registo_al: null }, f, 0);
    expect(x).toMatchObject({ taxaIva: 0, ivaCents: 0, precoSemIvaCents: 41280, referencia: "R7" });
    expect(x.motivoIsencao).toContain("53.º");
    expect(x.descricao).toBe("Alojamento local Casa da Praia, de 25/10/2026 a 28/10/2026 (3 noites)");
  });

  it("nome do país em português", () => {
    expect(nomePais("DE")).toBe("Alemanha");
  });
});
