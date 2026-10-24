import { describe, expect, it } from "vitest";
import { calcularTmt } from "../src/lib/tmt";

describe("taxa turística de Almada", () => {
  it("cobra 2€ por hóspede e noite", () => {
    const r = calcularTmt("2026-07-01", "2026-07-04", [
      { data_nascimento: "1980-01-01" },
      { data_nascimento: "1982-01-01" },
    ]);
    expect(r).toEqual({ noites: 3, hospedesTributaveis: 2, dormidasTributaveis: 6, valorCents: 1200 });
  });

  it("limita a 5 noites", () => {
    const r = calcularTmt("2026-07-01", "2026-07-08", [{ data_nascimento: "1980-01-01" }]);
    expect(r.noites).toBe(5);
    expect(r.valorCents).toBe(1000);
  });

  it("isenta menores de 13 anos à data do check-in", () => {
    const r = calcularTmt("2026-07-01", "2026-07-03", [
      { data_nascimento: "1980-01-01" },
      { data_nascimento: "2013-07-02" }, // faz 13 no dia seguinte ao check-in
      { data_nascimento: "2013-07-01" }, // faz 13 no dia do check-in
    ]);
    expect(r.hospedesTributaveis).toBe(2);
  });
});
