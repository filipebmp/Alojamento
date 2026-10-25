// Emissão da fatura-recibo do hóspede no programa de faturação certificado do gestor:
// InvoiceXpress, Vendus ou TOConline (as credenciais são do gestor e ficam na base de dados da instalação).
// O bookgest não é um programa certificado: só envia os dados; a fatura é numerada e assinada pelo programa.

import type { FaturaPortal } from "./faturacao";
import type { RegimeIva } from "./tipos";

export type Programa = "invoicexpress" | "vendus" | "toconline";

export const NOMES_PROGRAMA: Record<Programa, string> = { invoicexpress: "InvoiceXpress", vendus: "Vendus", toconline: "TOConline" };

export interface ConfigInvoiceXpress {
  programa: "invoicexpress";
  conta: string; // <conta>.app.invoicexpress.com
  apiKey: string;
  rascunho: boolean; // cria a fatura em rascunho: o gestor finaliza no InvoiceXpress
  enviarEmail: boolean;
}

export interface ConfigVendus {
  programa: "vendus";
  apiKey: string;
  teste: boolean; // documentos em modo de teste (sem valor fiscal)
  enviarEmail: boolean;
}

export interface ConfigToconline {
  programa: "toconline";
  clientId: string;
  clientSecret: string;
  urlOauth: string; // OAUTH_URL dos "Dados API" do TOConline
  urlApi: string; // API_URL
  serie: string | null; // prefixo da série de faturas-recibo (vazio = a predefinida)
  // Tokens obtidos pelo bookgest (renovados automaticamente).
  accessToken?: string;
  refreshToken?: string;
  expiraEm?: string;
}

export type ConfigFaturacao = ConfigInvoiceXpress | ConfigVendus | ConfigToconline;

export interface DadosEmissao {
  fatura: FaturaPortal;
  reservaId: number;
  regime: RegimeIva;
  email: string | null;
  hoje: string; // YYYY-MM-DD
}

export interface Emitida {
  idExterno: string;
  numero: string | null; // null = criada em rascunho (sem número ainda)
  pdf?: string | null;
}

// Códigos de isenção do SAF-T (PT): M10 = regime de isenção do art. 53.º; M99 = não sujeito (taxa turística).
const ISENCAO_ART53 = { codigo: "M10", lei: "Artigo 53.º do CIVA" };
const NAO_SUJEITO = { codigo: "M99", lei: "Não sujeito ou não tributado" };
const REGIAO: Record<RegimeIva, string> = { "6": "PT", "5": "PT-MA", "4": "PT-AC", isento: "PT" };

const euros = (cents: number) => Math.round(cents) / 100;
const dataPt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const paisEn = (codigo: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
};

// ---------- Pedidos (funções puras, testadas) ----------

export function pedidoInvoiceXpress(d: DadosEmissao) {
  const f = d.fatura;
  const isento = d.regime === "isento";
  const items = [{
    name: "Alojamento",
    description: f.descricao,
    unit_price: euros(f.precoSemIvaCents),
    quantity: 1,
    tax: { name: isento ? "IVA0" : `IVA${f.taxaIva}` },
  }];
  if (f.taxaTuristicaCents) {
    items.push({ name: "Taxa turística", description: "Taxa municipal turística, não sujeita a IVA", unit_price: euros(f.taxaTuristicaCents), quantity: 1, tax: { name: "IVA0" } });
  }
  return {
    invoice_receipt: {
      date: dataPt(d.hoje),
      due_date: dataPt(d.hoje),
      reference: f.referencia,
      client: {
        name: f.adquirente.nome,
        code: `bookgest-${f.adquirente.pais}-${f.adquirente.nif}`.slice(0, 60),
        fiscal_id: f.adquirente.nif,
        country: paisEn(f.adquirente.pais),
        address: f.adquirente.morada ?? undefined,
        email: d.email ?? undefined,
      },
      items,
      // Uma só menção de isenção por documento: art. 53.º se o alojamento é isento; senão a da taxa turística.
      ...(isento ? { tax_exemption: ISENCAO_ART53.codigo } : f.taxaTuristicaCents ? { tax_exemption: NAO_SUJEITO.codigo } : {}),
    },
  };
}

export function pedidoVendus(d: DadosEmissao, cfg: Pick<ConfigVendus, "teste" | "enviarEmail">) {
  const f = d.fatura;
  const isento = d.regime === "isento";
  const items: Record<string, unknown>[] = [{
    reference: "ALOJAMENTO",
    title: f.descricao.slice(0, 200),
    qty: 1,
    gross_price: euros(f.alojamentoCents), // preço com IVA
    type_id: "S",
    tax_id: isento ? "ISE" : "RED",
    ...(isento ? { tax_exemption: ISENCAO_ART53.codigo, tax_exemption_law: ISENCAO_ART53.lei } : {}),
  }];
  if (f.taxaTuristicaCents) {
    items.push({
      reference: "TAXA-TURISTICA",
      title: "Taxa municipal turística, não sujeita a IVA",
      qty: 1,
      gross_price: euros(f.taxaTuristicaCents),
      type_id: "I",
      tax_id: "ISE",
      tax_exemption: NAO_SUJEITO.codigo,
      tax_exemption_law: NAO_SUJEITO.lei,
    });
  }
  return {
    type: "FR",
    date: d.hoje,
    mode: cfg.teste ? "tests" : "normal",
    external_reference: f.referencia,
    output: "pdf_url",
    client: {
      name: f.adquirente.nome,
      fiscal_id: f.adquirente.nif,
      country: f.adquirente.pais,
      address: f.adquirente.morada ?? undefined,
      email: d.email ?? undefined,
      send_email: cfg.enviarEmail && d.email ? "yes" : "no",
    },
    items,
  };
}

export function pedidoToconline(d: DadosEmissao, serie: string | null, isencaoId: string | null) {
  const f = d.fatura;
  const isento = d.regime === "isento";
  const regiao = REGIAO[d.regime];
  const lines = [{
    item_type: "Service",
    description: f.descricao,
    quantity: 1,
    unit_price: euros(f.precoSemIvaCents),
    tax_code: isento ? "ISE" : "RED",
    tax_percentage: f.taxaIva,
    tax_country_region: regiao,
  }];
  if (f.taxaTuristicaCents) {
    lines.push({
      item_type: "Service",
      description: "Taxa municipal turística, não sujeita a IVA",
      quantity: 1,
      unit_price: euros(f.taxaTuristicaCents),
      tax_code: "ISE",
      tax_percentage: 0,
      tax_country_region: regiao,
    });
  }
  return {
    document_type: "FR",
    date: d.hoje,
    ...(serie ? { document_series_prefix: serie } : {}),
    customer_business_name: f.adquirente.nome,
    customer_tax_registration_number: f.adquirente.nif,
    customer_country: f.adquirente.pais,
    ...(f.adquirente.morada ? { customer_address_detail: f.adquirente.morada } : {}),
    vat_included_prices: false,
    ...(isencaoId ? { tax_exemption_reason_id: isencaoId } : {}),
    lines,
  };
}

// Código de isenção necessário no documento (o TOConline pede o id do motivo).
export function codigoIsencao(d: DadosEmissao): string | null {
  return d.regime === "isento" ? ISENCAO_ART53.codigo : d.fatura.taxaTuristicaCents ? NAO_SUJEITO.codigo : null;
}

// ---------- Ligação aos programas ----------

type Fetch = typeof fetch;

async function json<T>(res: Response, nome: string): Promise<T> {
  const texto = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error(`${nome} recusou o acesso (${res.status}): confirme a chave ou as credenciais da API.`);
  if (!res.ok) throw new Error(`${nome} respondeu ${res.status}: ${texto.replace(/\s+/g, " ").slice(0, 300) || res.statusText}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

// InvoiceXpress
const urlIx = (cfg: ConfigInvoiceXpress, caminho: string) =>
  `https://${cfg.conta}.app.invoicexpress.com${caminho}${caminho.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(cfg.apiKey)}`;

async function ix<T>(f: Fetch, cfg: ConfigInvoiceXpress, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const res = await f(urlIx(cfg, caminho), {
    method: metodo,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return json<T>(res, "O InvoiceXpress");
}

interface RespostaIx {
  invoice_receipt?: { id: number; inverted_sequence_number?: string; sequence_number?: string; permalink?: string };
}

// Vendus
const autVendus = (apiKey: string) => `Basic ${btoa(`${apiKey}:`)}`;

// TOConline: o código de autorização é devolvido no redirecionamento (sem interação do utilizador).
async function tokenToconline(f: Fetch, cfg: ConfigToconline, agora: Date): Promise<ConfigToconline> {
  if (cfg.accessToken && cfg.expiraEm && cfg.expiraEm > new Date(agora.getTime() + 60_000).toISOString()) return cfg;
  const basic = `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`;
  const pedirToken = async (corpo: Record<string, string>) => {
    const res = await f(`${cfg.urlOauth.replace(/\/$/, "")}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: basic },
      body: new URLSearchParams({ ...corpo, scope: "commercial" }).toString(),
    });
    return json<{ access_token: string; refresh_token: string; expires_in: number }>(res, "O TOConline");
  };
  let t: { access_token: string; refresh_token: string; expires_in: number } | null = null;
  if (cfg.refreshToken) t = await pedirToken({ grant_type: "refresh_token", refresh_token: cfg.refreshToken }).catch(() => null);
  if (!t) {
    const u = new URL(`${cfg.urlOauth.replace(/\/$/, "")}/auth`);
    u.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: "https://oauth.pstmn.io/v1/callback", response_type: "code", scope: "commercial" }).toString();
    const res = await f(u.toString(), { redirect: "manual", headers: { "Content-Type": "application/json" } });
    const destino = res.headers.get("Location");
    const code = destino ? new URL(destino, u).searchParams.get("code") : null;
    if (!code) throw new Error(`O TOConline não autorizou o acesso (${res.status}). Confirme o client_id e o endereço OAuth.`);
    t = await pedirToken({ grant_type: "authorization_code", code });
  }
  return {
    ...cfg,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiraEm: new Date(agora.getTime() + (t.expires_in || 3600) * 1000).toISOString(),
  };
}

async function toc<T>(f: Fetch, cfg: ConfigToconline, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const res = await f(`${cfg.urlApi.replace(/\/$/, "")}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/vnd.api+json", Accept: "application/json", Authorization: `Bearer ${cfg.accessToken}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return json<T>(res, "O TOConline");
}

// Devolve a configuração (o TOConline renova os tokens: o chamador guarda-a).
export async function testarLigacao(cfg: ConfigFaturacao, f: Fetch = fetch, agora = new Date()): Promise<ConfigFaturacao> {
  if (cfg.programa === "invoicexpress") {
    await ix(f, cfg, "GET", "/clients.json?per_page=1");
    return cfg;
  }
  if (cfg.programa === "vendus") {
    await json(await f("https://www.vendus.pt/ws/v1.1/documents/?per_page=1", { headers: { Authorization: autVendus(cfg.apiKey), Accept: "application/json" } }), "O Vendus");
    return cfg;
  }
  const c = await tokenToconline(f, cfg, agora);
  await toc(f, c, "GET", "/api/v1/commercial_document_series?filter[document_type]=FR");
  return c;
}

// Emite a fatura-recibo. `idExistente`: documento já criado numa tentativa anterior (InvoiceXpress), para não duplicar.
export async function emitir(
  cfg: ConfigFaturacao,
  d: DadosEmissao,
  opcoes: { f?: Fetch; agora?: Date; idExistente?: string | null; guardarId?: (id: string) => Promise<void> } = {},
): Promise<{ emitida: Emitida; config: ConfigFaturacao }> {
  const f = opcoes.f ?? fetch;
  if (cfg.programa === "invoicexpress") {
    let id = opcoes.idExistente ?? null;
    if (!id) {
      const criada = await ix<RespostaIx>(f, cfg, "POST", "/invoice_receipts.json", pedidoInvoiceXpress(d));
      id = String(criada.invoice_receipt!.id);
      await opcoes.guardarId?.(id); // antes de finalizar: uma nova tentativa não cria outra fatura
    }
    if (cfg.rascunho) return { emitida: { idExterno: id, numero: null }, config: cfg };
    const final = await ix<RespostaIx>(f, cfg, "PUT", `/invoice_receipts/${id}/change-state.json`, { invoice_receipt: { state: "finalized" } });
    const numero = final.invoice_receipt?.inverted_sequence_number ?? final.invoice_receipt?.sequence_number ?? id;
    if (cfg.enviarEmail && d.email) {
      await ix(f, cfg, "PUT", `/invoice_receipts/${id}/email-document.json`, {
        message: { client: { email: d.email, save: "0" }, subject: "Fatura-recibo / Invoice", body: "Segue em anexo a fatura-recibo da sua estadia. / Please find attached the invoice for your stay." },
      }).catch(() => undefined); // a fatura já está emitida; o envio pode ser repetido no InvoiceXpress
    }
    return { emitida: { idExterno: id, numero, pdf: final.invoice_receipt?.permalink ?? null }, config: cfg };
  }

  if (cfg.programa === "vendus") {
    const res = await f("https://www.vendus.pt/ws/v1.1/documents/", {
      method: "POST",
      headers: { Authorization: autVendus(cfg.apiKey), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(pedidoVendus(d, cfg)),
    });
    const r = await json<{ id: number; number?: string; output?: string }>(res, "O Vendus");
    return { emitida: { idExterno: String(r.id), numero: r.number ?? String(r.id), pdf: r.output?.startsWith("http") ? r.output : null }, config: cfg };
  }

  const c = await tokenToconline(f, cfg, opcoes.agora ?? new Date());
  let isencaoId: string | null = null;
  const codigo = codigoIsencao(d);
  if (codigo) {
    const lista = await toc<{ data?: { id: string | number; attributes?: { code?: string } }[] }>(f, c, "GET", `/api/v1/tax_exemption_reasons?filter[code]=${codigo}`);
    const encontrado = lista.data?.find((x) => x.attributes?.code === codigo) ?? lista.data?.[0];
    if (!encontrado) throw new Error(`O TOConline não tem o motivo de isenção ${codigo}.`);
    isencaoId = String(encontrado.id);
  }
  const r = await toc<{ data?: { id: string | number; attributes?: { document_no?: string } }; id?: string | number; document_no?: string }>(
    f, c, "POST", "/api/v1/commercial_sales_documents", pedidoToconline(d, c.serie, isencaoId),
  );
  const id = String(r.data?.id ?? r.id);
  return { emitida: { idExterno: id, numero: r.data?.attributes?.document_no ?? r.document_no ?? id }, config: c };
}

// ---------- Configuração guardada na instalação ----------

const CHAVE = "faturacao_programa";

export async function lerConfigFaturacao(db: D1Database): Promise<ConfigFaturacao | null> {
  const v = (await db.prepare("SELECT valor FROM definicoes WHERE chave = ?").bind(CHAVE).first<{ valor: string }>())?.valor;
  if (!v) return null;
  try {
    return JSON.parse(v) as ConfigFaturacao;
  } catch {
    return null;
  }
}

export async function gravarConfigFaturacao(db: D1Database, cfg: ConfigFaturacao | null): Promise<void> {
  if (!cfg) {
    await db.prepare("DELETE FROM definicoes WHERE chave = ?").bind(CHAVE).run();
    return;
  }
  await db.prepare("INSERT INTO definicoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .bind(CHAVE, JSON.stringify(cfg))
    .run();
}

// Lê o formulário das definições. Campos secretos vazios mantêm o valor guardado.
export function lerFormularioFaturacao(b: Record<string, string>, atual: ConfigFaturacao | null): ConfigFaturacao | null | string {
  const t = (k: string) => b[k]?.trim() ?? "";
  const segredo = (k: string, guardado: string | undefined) => t(k) || guardado || "";
  const programa = t("programa");
  if (!programa) return null;
  if (programa === "invoicexpress") {
    const conta = t("ix_conta").toLowerCase().replace(/^https?:\/\//, "").replace(/\.app\.invoicexpress\.com.*$/, "");
    const apiKey = segredo("ix_api_key", atual?.programa === "invoicexpress" ? atual.apiKey : undefined);
    if (!/^[a-z0-9-]+$/.test(conta)) return "Indique o nome da conta InvoiceXpress (o que aparece antes de .app.invoicexpress.com).";
    if (!apiKey) return "Indique a chave da API do InvoiceXpress.";
    return { programa, conta, apiKey, rascunho: b.ix_rascunho === "1", enviarEmail: b.enviar_email === "1" };
  }
  if (programa === "vendus") {
    const apiKey = segredo("vendus_api_key", atual?.programa === "vendus" ? atual.apiKey : undefined);
    if (!apiKey) return "Indique a chave da API do Vendus.";
    return { programa, apiKey, teste: b.vendus_teste === "1", enviarEmail: b.enviar_email === "1" };
  }
  if (programa === "toconline") {
    const anterior = atual?.programa === "toconline" ? atual : undefined;
    const cfg: ConfigToconline = {
      programa,
      clientId: t("toc_client_id"),
      clientSecret: segredo("toc_client_secret", anterior?.clientSecret),
      urlOauth: t("toc_url_oauth"),
      urlApi: t("toc_url_api"),
      serie: t("toc_serie") || null,
    };
    if (!cfg.clientId || !cfg.clientSecret) return "Indique o client_id e o client_secret do TOConline.";
    if (!/^https:\/\/\S+$/.test(cfg.urlOauth) || !/^https:\/\/\S+$/.test(cfg.urlApi)) return "Os endereços OAuth e API do TOConline começam por https://";
    // Os tokens só se mantêm se as credenciais não mudaram.
    if (anterior && anterior.clientId === cfg.clientId && anterior.clientSecret === cfg.clientSecret && anterior.urlOauth === cfg.urlOauth) {
      Object.assign(cfg, { accessToken: anterior.accessToken, refreshToken: anterior.refreshToken, expiraEm: anterior.expiraEm });
    }
    return cfg;
  }
  return "Escolha o programa de faturação.";
}
