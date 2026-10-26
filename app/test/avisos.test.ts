import { describe, expect, it } from "vitest";
import { pedidoAvisosValido } from "../../comum/licenca";
import { horaLisboa, itensAviso } from "../src/lib/avisos";
import type { Pendente } from "../src/lib/regras";

const p = (tipo: Pendente["tipo"], prazo: string | null, alojamentoId = 1): Pendente => ({ tipo, prazo, descricao: "Hans Müller: x", alojamentoId });

describe("aviso diário por email", () => {
  it("agrupa as tarefas com prazo até amanhã, sem nomes de hóspedes", () => {
    const itens = itensAviso([
      p("formulario", "2026-10-26"), p("formulario", "2026-10-26"), p("siba", "2026-10-24"),
      p("fatura", "2026-10-27"), p("fatura", "2026-10-30"), p("email", null), p("tmt_divergente", "2026-10-20"),
    ], "2026-10-26", new Map([[1, "Casa"]]));
    expect(itens).toEqual([
      { tipo: "siba", prazo: "atrasado", quantidade: 1, alojamento: null },
      { tipo: "formulario", prazo: "hoje", quantidade: 2, alojamento: null },
      { tipo: "fatura", prazo: "amanha", quantidade: 1, alojamento: null },
    ]);
    expect(JSON.stringify(itens)).not.toContain("Hans");
    expect(pedidoAvisosValido({ chave: "BG-AAAA-BBBB", para: "g@ex.pt", painel: null, itens })).toBe(true);
  });

  it("com vários alojamentos indica o alojamento", () => {
    const itens = itensAviso([p("siba", "2026-10-26", 1), p("siba", "2026-10-26", 2)], "2026-10-26", new Map([[1, "Casa"], [2, "T1"]]));
    expect(itens.map((i) => i.alojamento)).toEqual(["Casa", "T1"]);
  });

  it("hora em Lisboa (verão e inverno)", () => {
    expect(horaLisboa(new Date("2026-07-01T07:30:00Z"))).toBe(8);
    expect(horaLisboa(new Date("2026-12-01T07:30:00Z"))).toBe(7);
  });

  it("a plataforma recusa conteúdo livre", () => {
    expect(pedidoAvisosValido({ chave: "BG-AAAA-BBBB", para: "g@ex.pt", painel: null, itens: [{ tipo: "texto livre", prazo: "hoje", quantidade: 1, alojamento: null }] })).toBe(false);
    expect(pedidoAvisosValido({ chave: "BG-AAAA-BBBB", para: "g@ex.pt", painel: null, itens: [] })).toBe(false);
  });
});

import { emailAvisos, linkPainel } from "../../plataforma/src/email";

describe("email do aviso (plataforma)", () => {
  it("texto agrupado por prazo", () => {
    const e = emailAvisos([
      { tipo: "siba", prazo: "atrasado", quantidade: 1, alojamento: null },
      { tipo: "formulario", prazo: "hoje", quantidade: 2, alojamento: "Casa <b>" },
    ], "https://casa.bookgest.pt/admin");
    expect(e.assunto).toBe("bookgest: 3 tarefas com prazo — há atrasos");
    expect(e.texto).toContain("Atrasado:\n- 1 comunicação ao SIBA");
    expect(e.texto).toContain("Termina hoje:\n- 2 formulários de check-in por preencher");
    expect(e.html).toContain("Casa &#60;b&#62;");
  });

  it("o botão só leva à instalação da licença ou a bookgest.pt", () => {
    expect(linkPainel("https://casa.bookgest.pt", null, "https://bookgest.pt")).toBe("https://casa.bookgest.pt/admin");
    expect(linkPainel("https://x.workers.dev", "https://x.workers.dev", "https://bookgest.pt")).toBe("https://x.workers.dev/admin");
    expect(linkPainel("https://malicioso.com", "https://x.workers.dev", "https://bookgest.pt")).toBe("https://x.workers.dev/admin");
    expect(linkPainel("https://malicioso.com", null, "https://bookgest.pt")).toBe("https://bookgest.pt/entrar");
  });
});
