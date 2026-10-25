// Cliente mínimo da API do Stripe (sem SDK): pedidos form-encoded e verificação dos webhooks.

const API = "https://api.stripe.com/v1";

type Parametros = Record<string, unknown>;

// { a: { b: 1 }, c: [ { d: 2 } ] } → a[b]=1&c[0][d]=2 (formato que o Stripe espera).
export function codificar(params: Parametros, prefixo = ""): string[] {
  return Object.entries(params).flatMap(([k, v]) => {
    const nome = prefixo ? `${prefixo}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) {
      return v.flatMap((x, i) =>
        typeof x === "object" ? codificar(x as Parametros, `${nome}[${i}]`) : [`${encodeURIComponent(`${nome}[${i}]`)}=${encodeURIComponent(String(x))}`],
      );
    }
    if (typeof v === "object") return codificar(v as Parametros, nome);
    return [`${encodeURIComponent(nome)}=${encodeURIComponent(String(v))}`];
  });
}

export class ErroStripe extends Error {}

export async function stripe<T>(chave: string, metodo: "GET" | "POST", caminho: string, params: Parametros = {}): Promise<T> {
  const corpo = codificar(params).join("&");
  const url = metodo === "GET" && corpo ? `${API}${caminho}?${corpo}` : `${API}${caminho}`;
  const res = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: metodo === "POST" ? corpo : undefined,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new ErroStripe(json.error?.message ?? `Stripe respondeu ${res.status}`);
  return json;
}

// ---------- Objetos usados (só os campos que a plataforma lê) ----------

export interface Morada {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface CheckoutSession {
  id: string;
  client_reference_id?: string | null;
  status: "open" | "complete" | "expired";
  customer: string | null;
  subscription: string | Subscription | null;
  customer_details: {
    email: string | null;
    name: string | null;
    address: Morada | null;
    tax_ids?: { type: string; value: string }[];
  } | null;
}

export interface Subscription {
  id: string;
  status: string;
  customer: string;
  items: { data: { quantity?: number }[] };
}

export interface Invoice {
  id: string;
  customer: string;
  amount_paid: number;
  customer_email: string | null;
  customer_name: string | null;
  customer_address: Morada | null;
  customer_tax_ids?: { type: string; value: string }[] | null;
  status_transitions?: { paid_at?: number | null };
  lines: { data: { quantity?: number | null; period?: { start: number; end: number } }[] };
  // Versões antigas da API: invoice.subscription; desde 2025-03: invoice.parent.subscription_details.subscription
  subscription?: string | null;
  parent?: { subscription_details?: { subscription?: string | null } | null } | null;
}

export interface Price {
  id: string;
  unit_amount: number | null;
  currency: string;
}

export interface Evento {
  id: string;
  type: string;
  data: { object: unknown };
}

export function subscricaoDaFatura(i: Invoice): string | null {
  return i.subscription ?? i.parent?.subscription_details?.subscription ?? null;
}

// ---------- Webhooks ----------

const TOLERANCIA_S = 300;

// Cabeçalho Stripe-Signature: "t=<segundos>,v1=<hmac hex>[,v1=…]"; HMAC-SHA256 de "<t>.<corpo>".
export async function assinaturaValida(corpo: string, cabecalho: string | null | undefined, segredo: string, agora = Date.now()): Promise<boolean> {
  if (!cabecalho) return false;
  const partes = cabecalho.split(",").map((p) => p.split("=", 2) as [string, string]);
  const t = Number(partes.find(([k]) => k === "t")?.[1]);
  const assinaturas = partes.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !assinaturas.length || Math.abs(agora / 1000 - t) > TOLERANCIA_S) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${t}.${corpo}`)));
  const esperado = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return assinaturas.some((a) => iguaisTexto(a, esperado));
}

function iguaisTexto(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
