import { describe, expect, it } from "vitest";
import { CONCELHOS } from "../src/lib/concelhos";
import { calcularTmt, cobraTmt, descreverTmt } from "../src/lib/tmt";

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

describe("taxa turística com épocas", () => {
  const loule = { valorPorNoiteCents: 200, maxNoites: 5, idadeMinima: 16, diaDeclaracao: 15, diaPagamento: 30, valorBaixaCents: 100, altaInicio: 4, altaFim: 10 };
  const adulto = [{ data_nascimento: "1980-01-01" }];

  it("cada noite paga o valor da sua época", () => {
    // 29/03, 30/03, 31/03 época baixa; 01/04 e 02/04 época alta
    expect(calcularTmt("2026-03-29", "2026-04-03", adulto, loule).valorCents).toBe(3 * 100 + 2 * 200);
  });

  it("época que passa o fim do ano", () => {
    const inverno = { ...loule, altaInicio: 11, altaFim: 2 };
    expect(calcularTmt("2026-12-30", "2027-01-02", adulto, inverno).valorCents).toBe(600);
    expect(calcularTmt("2026-06-01", "2026-06-03", adulto, inverno).valorCents).toBe(200);
  });

  it("sem taxa fora da época (Albufeira): essas noites ficam não sujeitas", () => {
    const albufeira = { ...loule, maxNoites: 7, idadeMinima: 13, valorBaixaCents: 0 };
    const r = calcularTmt("2026-10-30", "2026-11-03", adulto, albufeira);
    expect(r).toMatchObject({ noites: 2, valorCents: 400, dormidasTotais: 4, dormidasTributaveis: 2, dormidasAcimaLimite: 2 });
    expect(cobraTmt({ ...albufeira, valorPorNoiteCents: 0 })).toBe(false);
  });

  it("descrição para o gestor", () => {
    expect(descreverTmt(loule)).toBe("2,00 € por hóspede e noite (abr–out), 1,00 € no resto do ano, máx. 5 noites");
    expect(descreverTmt({ ...loule, valorBaixaCents: null })).toBe("2,00 € por hóspede e noite, máx. 5 noites");
  });
});

describe("tabela dos concelhos", () => {
  it("tem os 308 concelhos, sem repetidos, e as regras de referência", () => {
    expect(CONCELHOS).toHaveLength(308);
    expect(new Set(CONCELHOS.map((c) => c.nome)).size).toBe(308);
    expect(CONCELHOS.filter((c) => c.tmt)).toHaveLength(49);
    expect(CONCELHOS.find((c) => c.nome === "Lisboa")).toMatchObject({ regiao: "continente", tmt: { valorPorNoiteCents: 400, maxNoites: 7, idadeMinima: 13, valorBaixaCents: null } });
    expect(CONCELHOS.find((c) => c.nome === "Loulé")?.tmt).toMatchObject({ valorPorNoiteCents: 200, valorBaixaCents: 100, altaInicio: 4, altaFim: 10 });
    expect(CONCELHOS.find((c) => c.nome === "Funchal")?.regiao).toBe("madeira");
    expect(CONCELHOS.find((c) => c.nome === "Bragança")?.tmt).toBeNull();
  });
});
