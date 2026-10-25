import { describe, expect, it } from "vitest";
import { faturaPortal } from "../src/lib/faturacao";
import { type DadosEmissao, emitir, pedidoInvoiceXpress, pedidoToconline, pedidoVendus, testarLigacao } from "../src/lib/programas-faturacao";
import type { Alojamento, Faturacao, RegimeIva, Reserva } from "../src/lib/tipos";

const r = { id: 7, ref_booking: "4123456789", checkin: "2026-10-25", checkout: "2026-10-28", valor_total_cents: 41280 } as Reserva;
const fat = { reserva_id: 7, nome: "Hans Müller", nif: "C01X00T47", pais: "DE", morada: "Hauptstr. 1", codigo_postal: null, cidade: null, email: "h@ex.de" } as Faturacao;
const dados = (regime: RegimeIva = "6", tmt = 1200): DadosEmissao => ({
  fatura: faturaPortal(r, { nome: "Casa da Praia", registo_al: null, regime_iva: regime } as Alojamento, fat, tmt),
  reservaId: 7,
  regime,
  email: fat.email,
  hoje: "2026-10-28",
});

// fetch falso: regista os pedidos e responde pela ordem dada.
function falso(respostas: (Response | ((u: string, i?: RequestInit) => Response))[]) {
  const pedidos: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init });
    const r = respostas.shift();
    if (!r) throw new Error(`pedido inesperado: ${url}`);
    return typeof r === "function" ? r(url, init) : r;
  }) as typeof fetch;
  return { f, pedidos };
}
const ok = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

describe("pedidos aos programas", () => {
  it("InvoiceXpress: preço sem IVA, imposto IVA6 e taxa turística não sujeita", () => {
    const p = pedidoInvoiceXpress(dados()).invoice_receipt;
    expect(p.date).toBe("28/10/2026");
    expect(p.client).toMatchObject({ name: "Hans Müller", fiscal_id: "C01X00T47", country: "Germany" });
    expect(p.items).toEqual([
      expect.objectContaining({ unit_price: 389.43, tax: { name: "IVA6" } }),
      expect.objectContaining({ unit_price: 12, tax: { name: "IVA0" } }),
    ]);
    expect(p).toMatchObject({ tax_exemption: "M99" });
  });

  it("InvoiceXpress: regime de isenção", () => {
    const p = pedidoInvoiceXpress(dados("isento", 0)).invoice_receipt;
    expect(p.items[0]).toMatchObject({ unit_price: 412.8, tax: { name: "IVA0" } });
    expect(p).toMatchObject({ tax_exemption: "M10" });
  });

  it("Vendus: preço com IVA, taxa reduzida, modo de teste e envio por email", () => {
    const p = pedidoVendus(dados(), { teste: true, enviarEmail: true });
    expect(p).toMatchObject({ type: "FR", mode: "tests", client: { country: "DE", send_email: "yes" } });
    expect(p.items[0]).toMatchObject({ gross_price: 412.8, tax_id: "RED", type_id: "S" });
    expect(p.items[1]).toMatchObject({ gross_price: 12, tax_id: "ISE", tax_exemption: "M99", type_id: "I" });
  });

  it("TOConline: região da Madeira e motivo de isenção", () => {
    const p = pedidoToconline(dados("5", 0), "FRAL", null);
    expect(p).toMatchObject({ document_type: "FR", document_series_prefix: "FRAL", customer_country: "DE", vat_included_prices: false });
    expect(p.lines[0]).toMatchObject({ tax_code: "RED", tax_percentage: 5, tax_country_region: "PT-MA" });
    expect(pedidoToconline(dados("isento", 0), null, "42")).toMatchObject({ tax_exemption_reason_id: "42", lines: [{ tax_code: "ISE", tax_percentage: 0 }] });
  });
});

describe("emissão", () => {
  const ix = { programa: "invoicexpress" as const, conta: "casa", apiKey: "k", rascunho: false, enviarEmail: true };

  it("InvoiceXpress: cria, guarda o id, finaliza e envia por email", async () => {
    const { f, pedidos } = falso([
      ok({ invoice_receipt: { id: 99 } }),
      ok({ invoice_receipt: { id: 99, inverted_sequence_number: "FR 2026/5" } }),
      ok({}),
    ]);
    const guardados: string[] = [];
    const { emitida } = await emitir(ix, dados(), { f, guardarId: async (id) => { guardados.push(id); } });
    expect(emitida).toMatchObject({ idExterno: "99", numero: "FR 2026/5" });
    expect(guardados).toEqual(["99"]);
    expect(pedidos.map((p) => `${p.init?.method} ${new URL(p.url).pathname}`)).toEqual([
      "POST /invoice_receipts.json", "PUT /invoice_receipts/99/change-state.json", "PUT /invoice_receipts/99/email-document.json",
    ]);
    expect(pedidos[0].url).toContain("https://casa.app.invoicexpress.com/");
  });

  it("InvoiceXpress: depois de um erro não cria outra fatura; em rascunho não finaliza", async () => {
    const a = falso([ok({ invoice_receipt: { id: 99, sequence_number: "5" } })]);
    await emitir({ ...ix, enviarEmail: false }, dados(), { f: a.f, idExistente: "99" });
    expect(a.pedidos).toHaveLength(1);
    expect(a.pedidos[0].url).toContain("/invoice_receipts/99/change-state.json");

    const b = falso([ok({ invoice_receipt: { id: 100 } })]);
    const { emitida } = await emitir({ ...ix, rascunho: true }, dados(), { f: b.f });
    expect(emitida).toEqual({ idExterno: "100", numero: null });
  });

  it("Vendus: autenticação básica com a chave", async () => {
    const { f, pedidos } = falso([ok({ id: 5, number: "FR 01/3", output: "https://www.vendus.pt/x.pdf" })]);
    const { emitida } = await emitir({ programa: "vendus", apiKey: "abc", teste: false, enviarEmail: false }, dados(), { f });
    expect(emitida).toEqual({ idExterno: "5", numero: "FR 01/3", pdf: "https://www.vendus.pt/x.pdf" });
    expect((pedidos[0].init?.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("abc:")}`);
  });

  it("erros do programa chegam ao gestor", async () => {
    const a = falso([new Response("chave inválida", { status: 401 })]);
    await expect(emitir({ programa: "vendus", apiKey: "x", teste: false, enviarEmail: false }, dados(), { f: a.f })).rejects.toThrow("O Vendus recusou o acesso (401)");
    const b = falso([new Response('{"errors": [\n {"message": "NIF inválido"}]}', { status: 422 })]);
    await expect(emitir({ programa: "vendus", apiKey: "x", teste: false, enviarEmail: false }, dados(), { f: b.f })).rejects.toThrow('O Vendus respondeu 422: {"errors": [ {"message": "NIF inválido"}]}');
  });

  it("TOConline: obtém o token pelo redirecionamento, procura a isenção e cria o documento", async () => {
    const cfg = { programa: "toconline" as const, clientId: "c", clientSecret: "s", urlOauth: "https://oauth.toc/oauth", urlApi: "https://api.toc", serie: null };
    const { f, pedidos } = falso([
      new Response(null, { status: 302, headers: { Location: "https://oauth.pstmn.io/v1/callback?code=abc" } }),
      ok({ access_token: "T", refresh_token: "R", expires_in: 3600 }),
      ok({ data: [{ id: 7, attributes: { code: "M99" } }] }),
      ok({ data: { id: 321, attributes: { document_no: "FR 2026/1" } } }),
    ]);
    const { emitida, config } = await emitir(cfg, dados(), { f, agora: new Date("2026-10-28T10:00:00Z") });
    expect(emitida).toEqual({ idExterno: "321", numero: "FR 2026/1" });
    expect(config).toMatchObject({ accessToken: "T", refreshToken: "R", expiraEm: "2026-10-28T11:00:00.000Z" });
    expect(pedidos[1].init?.body).toContain("code=abc");
    expect(JSON.parse(String(pedidos[3].init?.body))).toMatchObject({ tax_exemption_reason_id: "7" });
    expect((pedidos[3].init?.headers as Record<string, string>).Authorization).toBe("Bearer T");
  });

  it("testar ligação ao InvoiceXpress", async () => {
    const { f, pedidos } = falso([ok({ clients: [] })]);
    await testarLigacao(ix, f);
    expect(pedidos[0].url).toBe("https://casa.app.invoicexpress.com/clients.json?per_page=1&api_key=k");
  });
});
