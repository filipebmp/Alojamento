import { describe, expect, it } from "vitest";
import { type ConfigSiba, codigoPaisSiba, dividirNome, enviarSiba, hospedesParaEnviar, lerRespostaSiba, limparDocumento, limparNome, pedidoSoap, validarConfigSiba, xmlBoletins } from "../src/lib/siba";
import type { Hospede } from "../src/lib/tipos";

const cfg: ConfigSiba = {
  alojamento_id: 1, ativo: 1, teste: 1, nif: "123456789", estabelecimento: "00", chave: "987654", abreviatura: "PRAIA",
  localidade: "Almada", codigo_postal: "2800-001", telefone: "912 345 678", contacto_nome: "Filipe", contacto_email: "f@ex.pt", numero_ficheiro: 0,
};
const hans: Hospede = {
  id: 1, reserva_id: 7, titular: 1, nome: "Hans-Peter Müller Groß", data_nascimento: "1980-05-01", nacionalidade: "DE",
  pais_residencia: "DE", doc_tipo: "P", doc_numero: "c01x-00t47", doc_pais: "DE",
};

describe("dados para o SIBA", () => {
  it("códigos de país ICAO", () => {
    expect(codigoPaisSiba("DE")).toBe("D");
    expect(codigoPaisSiba("gb")).toBe("GBR");
    expect(codigoPaisSiba("XK")).toBe("RKS");
    expect(codigoPaisSiba("ES")).toBe("ESP");
  });

  it("nomes só com os caracteres aceites e apelido separado", () => {
    expect(limparNome("Zoë O'Brien-Łukasz 3º")).toBe("Zoe O'Brien-Lukasz");
    expect(limparNome("João Conceição")).toBe("João Conceição");
    expect(dividirNome("Hans-Peter Müller Groß")).toEqual({ apelido: "Gross", nome: "Hans-Peter Muller" });
    expect(dividirNome("Madonna")).toEqual({ apelido: "Madonna", nome: "" });
    expect(limparDocumento("c01x-00t47 ")).toBe("C01X00T47");
  });

  it("só os estrangeiros completos e ainda não enviados", () => {
    const pt = { ...hans, id: 2, nacionalidade: "PT", doc_tipo: null, doc_numero: null, doc_pais: null };
    const incompleto = { ...hans, id: 3, doc_numero: null };
    const enviado = { ...hans, id: 4, siba_enviado_em: "2026-10-25" };
    expect(hospedesParaEnviar([hans, pt, incompleto, enviado]).map((h) => h.id)).toEqual([1]);
  });

  it("XML conforme o BAL.XSD", () => {
    const xml = xmlBoletins(cfg, "Casa da Praia", "Rua do Mar, 1", [{ hospede: hans, checkin: "2026-10-25", checkout: "2026-10-28", localResidencia: "Berlin" }], 3, new Date("2026-10-25T16:00:00Z"));
    expect(xml).toContain('<MovimentoBAL xmlns="http://sef.pt/BAws">');
    expect(xml).toContain("<Codigo_Unidade_Hoteleira>123456789</Codigo_Unidade_Hoteleira><Estabelecimento>00</Estabelecimento><Nome>Casa da Praia</Nome><Abreviatura>PRAIA</Abreviatura>");
    expect(xml).toContain("<Codigo_Postal>2800</Codigo_Postal><Zona_Postal>001</Zona_Postal><Telefone>912345678</Telefone><Fax></Fax>");
    expect(xml).toContain(
      "<Boletim_Alojamento><Apelido>Gross</Apelido><Nome>Hans-Peter Muller</Nome><Nacionalidade>D</Nacionalidade>" +
      "<Data_Nascimento>1980-05-01T00:00:00</Data_Nascimento><Documento_Identificacao>C01X00T47</Documento_Identificacao>" +
      "<Pais_Emissor_Documento>D</Pais_Emissor_Documento><Tipo_Documento>P</Tipo_Documento>" +
      "<Data_Entrada>2026-10-25T00:00:00</Data_Entrada><Data_Saida>2026-10-28T00:00:00</Data_Saida>" +
      "<Pais_Residencia_Origem>D</Pais_Residencia_Origem><Local_Residencia_Origem>Berlin</Local_Residencia_Origem></Boletim_Alojamento>",
    );
    expect(xml).toContain("<Envio><Numero_Ficheiro>3</Numero_Ficheiro><Data_Movimento>2026-10-25T16:00:00</Data_Movimento></Envio>");
  });

  it("sem cidade de residência usa o nome do país", () => {
    const xml = xmlBoletins(cfg, "Casa", "Rua", [{ hospede: hans, checkin: "2026-10-25", checkout: "2026-10-28", localResidencia: "" }], 1, new Date());
    expect(xml).toContain("<Local_Residencia_Origem>Alemanha</Local_Residencia_Origem>");
  });

  it("pedido SOAP com os boletins em Base64", () => {
    const soap = pedidoSoap(cfg, "<MovimentoBAL>ç</MovimentoBAL>");
    expect(soap).toContain("<UnidadeHoteleira>123456789</UnidadeHoteleira><Estabelecimento>0</Estabelecimento><ChaveAcesso>987654</ChaveAcesso>");
    const b64 = soap.match(/<Boletins>(.*)<\/Boletins>/)![1];
    expect(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).toBe("<MovimentoBAL>ç</MovimentoBAL>");
  });
});

describe("respostas do SIBA", () => {
  const resposta = (r: string) => `<soap:Envelope><soap:Body><EntregaBoletinsAlojamentoResponse xmlns="http://sef.pt/"><EntregaBoletinsAlojamentoResult>${r}</EntregaBoletinsAlojamentoResult></EntregaBoletinsAlojamentoResponse></soap:Body></soap:Envelope>`;

  it("aceite", () => {
    expect(lerRespostaSiba(resposta("0"))).toEqual({ ok: true });
  });

  it("erros devolvidos pelo SIBA (formato real do ambiente de testes)", () => {
    const erro = "&lt;ErrosBA xmlns=\"http://www.sef.pt/BAws\"&gt;\n  &lt;RetornoBA&gt;\n    &lt;Linha&gt;0&lt;/Linha&gt;\n    &lt;Codigo_Retorno&gt;51&lt;/Codigo_Retorno&gt;\n    &lt;Descricao&gt;Número de identificação fiscal inválido&lt;/Descricao&gt;\n  &lt;/RetornoBA&gt;\n&lt;/ErrosBA&gt;";
    expect(lerRespostaSiba(resposta(erro))).toEqual({ ok: false, erro: "Número de identificação fiscal inválido (código 51)" });
  });

  it("envio para o ambiente de testes com o SOAPAction", async () => {
    let pedido: { url: string; init?: RequestInit } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      pedido = { url, init };
      return new Response(resposta("0"));
    }) as typeof fetch;
    expect(await enviarSiba(cfg, "<x/>", f)).toEqual({ ok: true });
    expect(pedido!.url).toBe("https://siba.ssi.gov.pt/bawsdev/boletinsalojamento.asmx");
    expect((pedido!.init!.headers as Record<string, string>).SOAPAction).toBe('"http://sef.pt/EntregaBoletinsAlojamento"');
  });

  it("validação dos dados do estabelecimento", () => {
    expect(validarConfigSiba(cfg)).toBeNull();
    expect(validarConfigSiba({ ...cfg, nif: "123" })).toContain("9 algarismos");
    expect(validarConfigSiba({ ...cfg, codigo_postal: "2800" })).toContain("0000-000");
  });
});
