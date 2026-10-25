import { describe, expect, it } from "vitest";
import { calcularTmt } from "../src/lib/tmt";

const almada = { valorPorNoiteCents: 200, maxNoites: 5, idadeMinima: 13, diaDeclaracao: 15, diaPagamento: 30 };

describe("taxa turística de Almada", () => {
  it("cobra 2€ por hóspede e noite", () => {
    const r = calcularTmt("2026-07-01", "2026-07-04", [
      { data_nascimento: "1980-01-01" },
      { data_nascimento: "1982-01-01" },
    ], almada);
    expect(r).toEqual({
      noites: 3,
      hospedesTributaveis: 2,
      dormidasTotais: 6,
      dormidasTributaveis: 6,
      dormidasAcimaLimite: 0,
      dormidasMenores: 0,
      valorCents: 1200,
    });
  });

  it("limita a 5 noites e conta as restantes como não sujeitas", () => {
    const r = calcularTmt("2026-07-01", "2026-07-08", [
      { data_nascimento: "1980-01-01" },
      { data_nascimento: "1981-01-01" },
      { data_nascimento: "2020-01-01" },
    ], almada);
    expect(r.noites).toBe(5);
    expect(r.valorCents).toBe(2000);
    expect(r.dormidasTotais).toBe(21);
    expect(r.dormidasTributaveis).toBe(10);
    expect(r.dormidasAcimaLimite).toBe(4);
    expect(r.dormidasMenores).toBe(7);
  });

  it("isenta menores de 13 anos à data do check-in", () => {
    const r = calcularTmt("2026-07-01", "2026-07-03", [
      { data_nascimento: "1980-01-01" },
      { data_nascimento: "2013-07-02" }, // faz 13 no dia seguinte ao check-in
      { data_nascimento: "2013-07-01" }, // faz 13 no dia do check-in
    ], almada);
    expect(r.hospedesTributaveis).toBe(2);
  });

  it("sem limite de noites quando o concelho não o define", () => {
    const r = calcularTmt("2026-07-01", "2026-07-08", [{ data_nascimento: "1980-01-01" }], { ...almada, maxNoites: 0 });
    expect(r.valorCents).toBe(1400);
    expect(r.dormidasAcimaLimite).toBe(0);
  });

  it("não calcula nada em concelhos sem taxa", () => {
    const r = calcularTmt("2026-07-01", "2026-07-08", [{ data_nascimento: "1980-01-01" }], { ...almada, valorPorNoiteCents: 0 });
    expect(r.valorCents).toBe(0);
  });
});
