import { describe, expect, it } from "vitest";
import { estadoCodigo, mesesAteAnterior, pendentesReserva, pendentesTmt, prazosTmt } from "../src/lib/regras";
import type { Config, Faturacao, Hospede, Reserva } from "../src/lib/tipos";

const almada = { valorPorNoiteCents: 200, maxNoites: 5, idadeMinima: 13, diaDeclaracao: 15, diaPagamento: 30 };
const cfg: Config = { horasAntesCodigo: 24, horaCheckin: "15:00", horasPrazoHospedes: 48, tmt: almada };

const reserva: Reserva = {
  id: 1,
  alojamento_id: 1,
  token: "t",
  ref_booking: null,
  nome_titular: "Anna",
  checkin: "2026-07-10",
  checkout: "2026-07-13",
  n_hospedes: 2,
  valor_total_cents: 30000,
  comissao_cents: 4500,
  tmt_cobrada_cents: null,
  fatura_numero: null,
  fatura_emitida_em: null,
  siba_submetido_em: null,
  cancelada: 0,
  criado_em: "2026-06-01T00:00:00Z",
  origem: "manual",
  uid_externo: null,
  incompleta: 0,
  ignorada: 0,
  desaparecida_em: null,
};

const titular: Hospede = {
  id: 1,
  reserva_id: 1,
  titular: 1,
  nome: "Anna Schmidt",
  data_nascimento: "1985-03-02",
  nacionalidade: "DE",
  pais_residencia: "DE",
  doc_tipo: "P",
  doc_numero: "C01X00T47",
  doc_pais: "DE",
};

const acompanhante: Hospede = {
  ...titular,
  id: 2,
  titular: 0,
  nome: "Max Schmidt",
  nacionalidade: null,
  pais_residencia: null,
  doc_tipo: null,
  doc_numero: null,
  doc_pais: null,
};

const fat: Faturacao = {
  reserva_id: 1,
  nome: "Anna Schmidt",
  nif: "DE123456789",
  pais: "DE",
  morada: null,
  codigo_postal: null,
  cidade: null,
  email: null,
};

describe("código das chaves", () => {
  const depoisDoInicio = new Date("2026-07-09T15:00:00Z");

  it("não é revelado sem o formulário do titular", () => {
    expect(estadoCodigo(reserva, [titular], null, cfg, depoisDoInicio)).toBe("formulario_em_falta");
    // falta registar o segundo hóspede
    expect(estadoCodigo(reserva, [titular], fat, cfg, depoisDoInicio)).toBe("formulario_em_falta");
  });

  it("só é revelado 24h antes da hora de check-in (hora de Lisboa)", () => {
    const hosp = [titular, acompanhante];
    // check-in 10/07 15:00 Lisboa = 14:00 UTC; início = 09/07 14:00 UTC
    expect(estadoCodigo(reserva, hosp, fat, cfg, new Date("2026-07-09T13:59:00Z"))).toBe("cedo");
    expect(estadoCodigo(reserva, hosp, fat, cfg, new Date("2026-07-09T14:00:00Z"))).toBe("disponivel");
  });

  it("expira depois do dia de check-out", () => {
    const hosp = [titular, acompanhante];
    expect(estadoCodigo(reserva, hosp, fat, cfg, new Date("2026-07-13T22:00:00Z"))).toBe("disponivel");
    expect(estadoCodigo(reserva, hosp, fat, cfg, new Date("2026-07-13T23:00:00Z"))).toBe("expirado");
  });
});

describe("pendentes de uma reserva", () => {
  const tipos = (agora: string, r = reserva, h = [titular, acompanhante]) =>
    pendentesReserva(r, h, fat, cfg, new Date(agora)).map((p) => [p.tipo, p.prazo]);

  it("pede dados em falta dos hóspedes e SIBA após o check-in", () => {
    expect(tipos("2026-07-10T16:00:00Z")).toEqual([
      ["dados_hospedes", "2026-07-12"],
      ["siba", "2026-07-15"],
    ]);
  });

  it("pede a fatura após o check-out com prazo de 5 dias úteis", () => {
    const r = { ...reserva, siba_submetido_em: "2026-07-10T18:00:00Z" };
    expect(tipos("2026-07-13T12:00:00Z", r, [titular, { ...acompanhante, nacionalidade: "PT" }])).toEqual([
      ["fatura", "2026-07-20"],
    ]);
  });

  it("assinala divergência na taxa turística cobrada pelo Booking", () => {
    const r = { ...reserva, tmt_cobrada_cents: 1000, siba_submetido_em: "x", fatura_emitida_em: "x" };
    const p = pendentesReserva(r, [titular, acompanhante], fat, cfg, new Date("2026-07-14T12:00:00Z"));
    expect(p.map((x) => x.tipo)).toEqual(["tmt_divergente"]);
  });
});

describe("taxa turística mensal", () => {
  it("lista meses até ao anterior", () => {
    expect(mesesAteAnterior("2026-08", new Date("2026-10-24T12:00:00Z"))).toEqual(["2026-08", "2026-09"]);
  });

  it("calcula prazos (fevereiro sem dia 30)", () => {
    expect(prazosTmt("2026-09", almada)).toEqual({ declarar: "2026-10-15", pagar: "2026-10-30" });
    expect(prazosTmt("2027-01", almada)).toEqual({ declarar: "2027-02-15", pagar: "2027-02-28" });
  });

  const al = { id: 1, concelho: "Almada", regras: almada };

  it("pede declaração mesmo em meses sem reservas", () => {
    const p = pendentesTmt(["2026-09"], [{ alojamento_id: 1, mes: "2026-09", declarado_em: "x", pago_em: null }], al);
    expect(p.map((x) => [x.tipo, x.descricao])).toEqual([["tmt_pagar", "Taxa turística 2026-09: pagar à CM Almada"]]);
  });

  it("separa as declarações de cada alojamento", () => {
    const p = pendentesTmt(["2026-09"], [{ alojamento_id: 2, mes: "2026-09", declarado_em: "x", pago_em: "x" }], al);
    expect(p.map((x) => x.tipo)).toEqual(["tmt_declarar", "tmt_pagar"]);
  });

  it("não pede nada em concelhos sem taxa", () => {
    expect(pendentesTmt(["2026-09"], [], { ...al, regras: { ...almada, valorPorNoiteCents: 0 } })).toEqual([]);
  });
});

describe("reservas importadas do calendário", () => {
  it("pede para completar os dados antes de tudo o resto", () => {
    const r = { ...reserva, nome_titular: "Reserva Airbnb", incompleta: 1, origem: "airbnb" };
    const p = pendentesReserva(r, [], null, cfg, new Date("2026-07-01T12:00:00Z"));
    expect(p.map((x) => [x.tipo, x.descricao, x.prazo])).toEqual([["completar", "Reserva Airbnb (10/07): completar nome e n.º de hóspedes", "2026-07-10"]]);
  });

  it("assinala as que deixaram de aparecer no calendário", () => {
    const r = { ...reserva, desaparecida_em: "2026-07-01T00:00:00Z" };
    const p = pendentesReserva(r, [], null, cfg, new Date("2026-07-01T12:00:00Z"));
    expect(p[0].tipo).toBe("desaparecida");
  });
});
