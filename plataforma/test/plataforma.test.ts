import { describe, expect, it } from "vitest";
import { pedidoEmailValido, pedidoValido } from "../../comum/licenca";
import { emailRecuperacao } from "../src/email";
import { type Fatura, corpoFaturaRecibo } from "../src/faturas";
import { estadoLicenca, gerarChave } from "../src/licencas";
import { slugValido } from "../src/instalador";
import { assinaturaValida, codificar } from "../src/stripe";

async function assinar(corpo: string, segredo: string, t: number) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${t}.${corpo}`)));
  return `t=${t},v1=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("webhooks do Stripe", () => {
  const corpo = '{"id":"evt_1"}';
  const agora = 1_800_000_000_000;
  const t = agora / 1000;

  it("aceita a assinatura certa", async () => {
    expect(await assinaturaValida(corpo, await assinar(corpo, "whsec_x", t), "whsec_x", agora)).toBe(true);
  });

  it("rejeita outro segredo, corpo alterado, sem cabeçalho ou fora do prazo", async () => {
    const cab = await assinar(corpo, "whsec_x", t);
    expect(await assinaturaValida(corpo, cab, "whsec_y", agora)).toBe(false);
    expect(await assinaturaValida('{"id":"evt_2"}', cab, "whsec_x", agora)).toBe(false);
    expect(await assinaturaValida(corpo, null, "whsec_x", agora)).toBe(false);
    expect(await assinaturaValida(corpo, cab, "whsec_x", agora + 301_000)).toBe(false);
  });
});

describe("pedidos ao Stripe", () => {
  it("codifica parâmetros encadeados", () => {
    expect(codificar({ mode: "subscription", line_items: [{ price: "p_1", quantity: 2 }], expand: ["subscription"], x: undefined })).toEqual([
      "mode=subscription",
      "line_items%5B0%5D%5Bprice%5D=p_1",
      "line_items%5B0%5D%5Bquantity%5D=2",
      "expand%5B0%5D=subscription",
    ]);
  });
});

describe("licenças", () => {
  it("gera chaves legíveis e diferentes", () => {
    const a = gerarChave();
    expect(a).toMatch(/^BG-[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/);
    expect(gerarChave()).not.toBe(a);
  });

  it("traduz o estado da assinatura", () => {
    const l = { tipo: "stripe" as const, revogada: 0, valida_ate: null };
    expect(estadoLicenca({ ...l, stripe_estado: "active" })).toBe("ativa");
    expect(estadoLicenca({ ...l, stripe_estado: "past_due" })).toBe("pagamento_em_atraso");
    expect(estadoLicenca({ ...l, stripe_estado: "canceled" })).toBe("inativa");
    expect(estadoLicenca({ ...l, stripe_estado: "incomplete" })).toBe("inativa");
    expect(estadoLicenca({ tipo: "cortesia", stripe_estado: null, revogada: 0, valida_ate: null })).toBe("ativa");
    expect(estadoLicenca({ tipo: "cortesia", stripe_estado: null, revogada: 1, valida_ate: null })).toBe("inativa");
    const agora = new Date("2026-10-25T12:00:00Z");
    expect(estadoLicenca({ tipo: "teste", stripe_estado: null, revogada: 0, valida_ate: "2026-11-24T12:00:00Z" }, agora)).toBe("ativa");
    expect(estadoLicenca({ tipo: "teste", stripe_estado: null, revogada: 0, valida_ate: "2026-10-25T11:59:59Z" }, agora)).toBe("inativa");
  });

  it("valida o pedido de uma instalação", () => {
    expect(pedidoValido({ chave: "BG-AAAA-BBBB", versao: "0.2.0", alojamentos: 2 })).toBe(true);
    expect(pedidoValido({ chave: "x", versao: "0.2.0", alojamentos: 2 })).toBe(false);
    expect(pedidoValido({ chave: "BG-AAAA-BBBB", versao: "0.2.0", alojamentos: -1 })).toBe(false);
    expect(pedidoValido(null)).toBe(false);
  });
});

describe("fatura-recibo no InvoiceXpress", () => {
  const fatura: Fatura = {
    id: 1, stripe_invoice_id: "in_1", cliente_id: 1, licenca_id: 1, valor_cents: 1230, alojamentos: 2,
    periodo_inicio: "2026-10-01T00:00:00Z", periodo_fim: "2026-11-01T00:00:00Z", pago_em: "2026-10-01T10:00:00Z",
    estado: "por_emitir", numero: null, invoicexpress_id: null, erro: null, emitida_em: null,
  };
  const cliente = {
    id: 1, stripe_customer_id: "cus_1", email: "a@b.pt", nome: "Ana", nif: "PT123456789", pais: "PT",
    morada: "Rua A", codigo_postal: "2800-000", cidade: "Almada",
  };

  it("retira o IVA ao preço e indica o período", () => {
    const { invoice_receipt: r } = corpoFaturaRecibo(fatura, cliente, { imposto: "IVA23", taxaIva: 0.23 });
    expect(r.date).toBe("01/10/2026");
    expect(r.client).toMatchObject({ name: "Ana", fiscal_id: "123456789", code: "cus_1" });
    expect(r.items[0]).toMatchObject({ quantity: 2, unit_price: 5, tax: { name: "IVA23" } });
    expect(r.items[0].description).toBe("Licença bookgest — 2 alojamento(s) de 01/10/2026 a 01/11/2026");
  });
});

describe("email de recuperação", () => {
  const ok = { chave: "BG-AAAA-BBBB", para: "ana@x.pt", link: "https://casa.exemplo.pt/recuperar/" + "a".repeat(43) };

  it("aceita só links de recuperação", () => {
    expect(pedidoEmailValido(ok)).toBe(true);
    expect(pedidoEmailValido({ ...ok, link: "https://phishing.pt/login" })).toBe(false);
    expect(pedidoEmailValido({ ...ok, link: "http://casa.exemplo.pt/recuperar/" + "a".repeat(43) })).toBe(false);
    expect(pedidoEmailValido({ ...ok, link: ok.link + "?x=1" })).toBe(false);
    expect(pedidoEmailValido({ ...ok, link: "javascript:alert(1)" })).toBe(false);
  });

  it("valida o destinatário", () => {
    expect(pedidoEmailValido({ ...ok, para: "não é email" })).toBe(false);
  });

  it("escapa o link no HTML do email", () => {
    expect(emailRecuperacao('https://x.pt/recuperar/"><script>').html).not.toContain("<script>");
  });
});

describe("nome do endereço (modo alojado)", () => {
  it("aceita só nomes simples", () => {
    expect(slugValido("Casa-da-Praia")).toBe("casa-da-praia");
    expect(slugValido("ab")).toBeNull();
    expect(slugValido("-casa")).toBeNull();
    expect(slugValido("casa-")).toBeNull();
    expect(slugValido("casa--praia")).toBeNull();
    expect(slugValido("casa_praia")).toBeNull();
    expect(slugValido("a".repeat(31))).toBeNull();
  });
});
