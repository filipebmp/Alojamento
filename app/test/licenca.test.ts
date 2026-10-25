import { describe, expect, it } from "vitest";
import { avisoLicenca, haProblema, reservasBloqueadas } from "../src/lib/licenca";

const agora = new Date("2026-10-25T12:00:00Z");
const ok = { estado: "ativa" as const, alojamentosPagos: 2, verificadoEm: "2026-10-25T04:00:00Z" };

describe("avisos de licença", () => {
  it("sem aviso com licença ativa e alojamentos dentro do pago", () => {
    expect(avisoLicenca("BG-1", ok, 2, agora)).toBeNull();
  });

  it("pede a chave quando não existe", () => {
    expect(avisoLicenca(null, null, 1, agora)).toMatch(/Sem chave/);
  });

  it("avisa quando há mais alojamentos ativos do que pagos", () => {
    expect(avisoLicenca("BG-1", ok, 3, agora)).toMatch(/3 alojamentos ativos e a licença cobre 2/);
  });

  it("avisa de pagamento em atraso e licença inativa ou desconhecida", () => {
    expect(avisoLicenca("BG-1", { ...ok, estado: "pagamento_em_atraso" }, 1, agora)).toMatch(/atraso/);
    expect(avisoLicenca("BG-1", { ...ok, estado: "inativa" }, 1, agora)).toMatch(/inativa/);
    expect(avisoLicenca("BG-1", { ...ok, estado: "desconhecida" }, 1, agora)).toMatch(/não é reconhecida/);
  });

  it("avisa quando o servidor não responde há mais de 7 dias", () => {
    expect(avisoLicenca("BG-1", { ...ok, verificadoEm: "2026-10-17T12:00:00Z" }, 1, agora)).toMatch(/desde 17\/10\/2026/);
  });
});

describe("bloqueio por licença", () => {
  it("só bloqueia novas reservas ao fim de 14 dias com o problema", () => {
    expect(reservasBloqueadas(null, agora)).toBe(false);
    expect(reservasBloqueadas("2026-10-12T12:00:01Z", agora)).toBe(false);
    expect(reservasBloqueadas("2026-10-11T12:00:00Z", agora)).toBe(true);
  });

  it("deteta licença inativa ou alojamentos a mais", () => {
    expect(haProblema({ estado: "ativa", alojamentosPagos: 2 }, 2)).toBe(false);
    expect(haProblema({ estado: "ativa", alojamentosPagos: 2 }, 3)).toBe(true);
    expect(haProblema({ estado: "pagamento_em_atraso", alojamentosPagos: 2 }, 1)).toBe(true);
  });
});
