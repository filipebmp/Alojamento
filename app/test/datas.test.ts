import { describe, expect, it } from "vitest";
import { eDiaUtil, idadeEm, instanteLisboa, pascoa, somarDiasUteis } from "../src/lib/datas";

describe("datas", () => {
  it("calcula a Páscoa", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
  });

  it("reconhece fins de semana e feriados", () => {
    expect(eDiaUtil("2026-10-24")).toBe(false); // sábado
    expect(eDiaUtil("2026-10-05")).toBe(false); // Implantação da República
    expect(eDiaUtil("2026-04-03")).toBe(false); // Sexta-feira Santa
    expect(eDiaUtil("2026-06-04")).toBe(false); // Corpo de Deus
    expect(eDiaUtil("2026-10-23")).toBe(true);
  });

  it("soma dias úteis saltando fins de semana e feriados", () => {
    // Check-in sexta 27/11/2026: seg 30, (ter 1/12 feriado), qua 2, qui 3
    expect(somarDiasUteis("2026-11-27", 3)).toBe("2026-12-03");
  });

  it("calcula a idade numa data", () => {
    expect(idadeEm("2013-06-10", "2026-06-09")).toBe(12);
    expect(idadeEm("2013-06-10", "2026-06-10")).toBe(13);
  });

  it("converte hora de Lisboa para UTC (verão e inverno)", () => {
    expect(instanteLisboa("2026-07-01", "15:00").toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(instanteLisboa("2026-12-01", "15:00").toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });
});
