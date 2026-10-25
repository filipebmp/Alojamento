import type { Cliente } from "./licencas";
import { type Invoice, subscricaoDaFatura } from "./stripe";

// Cada pagamento recebido no Stripe dá origem a uma fatura-recibo emitida num programa certificado
// pela AT (InvoiceXpress). Sem InvoiceXpress configurado, fica "por emitir" na página de gestão.

export interface Fatura {
  id: number;
  stripe_invoice_id: string;
  cliente_id: number | null;
  licenca_id: number | null;
  valor_cents: number;
  alojamentos: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  pago_em: string;
  estado: "por_emitir" | "emitida" | "erro";
  numero: string | null;
  invoicexpress_id: string | null;
  erro: string | null;
  emitida_em: string | null;
}

const iso = (segundos: number | null | undefined) => (segundos ? new Date(segundos * 1000).toISOString() : null);

export async function registarFatura(db: D1Database, i: Invoice): Promise<Fatura | null> {
  if (i.amount_paid <= 0) return null; // períodos gratuitos/créditos: nada a faturar
  const subscricao = subscricaoDaFatura(i);
  const [licencaId, clienteId] = await Promise.all([
    subscricao
      ? db.prepare("SELECT id FROM licencas WHERE stripe_subscription_id = ?").bind(subscricao).first<number>("id")
      : null,
    db.prepare("SELECT id FROM clientes WHERE stripe_customer_id = ?").bind(i.customer).first<number>("id"),
  ]);
  const linha = i.lines.data[0];
  await db.prepare(
    `INSERT OR IGNORE INTO faturas (stripe_invoice_id, cliente_id, licenca_id, valor_cents, alojamentos, periodo_inicio, periodo_fim, pago_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(i.id, clienteId ?? null, licencaId ?? null, i.amount_paid, i.lines.data.reduce((n, l) => n + (l.quantity ?? 0), 0) || 1,
      iso(linha?.period?.start), iso(linha?.period?.end), iso(i.status_transitions?.paid_at) ?? new Date().toISOString())
    .run();
  return db.prepare("SELECT * FROM faturas WHERE stripe_invoice_id = ?").bind(i.id).first<Fatura>();
}

// ---------- InvoiceXpress ----------

export interface ConfigInvoiceXpress {
  conta: string; // subdomínio: <conta>.app.invoicexpress.com
  apiKey: string;
  imposto: string; // nome do imposto configurado na conta, ex.: "IVA23"
  taxaIva: number; // 0.23
}

const dataPt = (isoData: string) => {
  const [a, m, d] = isoData.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

// Os preços no Stripe incluem IVA; o InvoiceXpress recebe o preço unitário sem IVA.
export function corpoFaturaRecibo(f: Fatura, c: Cliente | null, cfg: Pick<ConfigInvoiceXpress, "imposto" | "taxaIva">) {
  const semIva = f.valor_cents / 100 / (1 + cfg.taxaIva);
  const periodo = f.periodo_inicio && f.periodo_fim ? ` de ${dataPt(f.periodo_inicio)} a ${dataPt(f.periodo_fim)}` : "";
  return {
    invoice_receipt: {
      date: dataPt(f.pago_em),
      due_date: dataPt(f.pago_em),
      reference: f.stripe_invoice_id,
      client: {
        name: c?.nome || c?.email || "Consumidor final",
        code: c?.stripe_customer_id ?? `cliente-${f.cliente_id ?? "x"}`,
        email: c?.email ?? undefined,
        fiscal_id: c?.nif?.replace(/^PT/i, "") || undefined,
        address: c?.morada ?? undefined,
        postal_code: c?.codigo_postal ?? undefined,
        city: c?.cidade ?? undefined,
      },
      items: [
        {
          name: "bookgest",
          description: `Licença bookgest — ${f.alojamentos} alojamento(s)${periodo}`,
          unit_price: Math.round((semIva / f.alojamentos) * 10_000) / 10_000,
          quantity: f.alojamentos,
          tax: { name: cfg.imposto },
        },
      ],
    },
  };
}

async function ix<T>(cfg: ConfigInvoiceXpress, metodo: "POST" | "PUT", caminho: string, corpo: unknown): Promise<T> {
  const res = await fetch(`https://${cfg.conta}.app.invoicexpress.com${caminho}?api_key=${encodeURIComponent(cfg.apiKey)}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`InvoiceXpress ${res.status}: ${texto.slice(0, 300)}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

interface RespostaIx {
  invoice_receipt?: { id: number; inverted_sequence_number?: string; sequence_number?: string };
}

// Cria (uma só vez), finaliza e envia por email. Pode ser repetida após um erro sem duplicar a fatura.
export async function emitirFatura(db: D1Database, f: Fatura, cfg: ConfigInvoiceXpress): Promise<void> {
  if (f.estado === "emitida") return;
  const cliente = f.cliente_id ? await db.prepare("SELECT * FROM clientes WHERE id = ?").bind(f.cliente_id).first<Cliente>() : null;
  try {
    let id = f.invoicexpress_id;
    if (!id) {
      const criada = await ix<RespostaIx>(cfg, "POST", "/invoice_receipts.json", corpoFaturaRecibo(f, cliente, cfg));
      id = String(criada.invoice_receipt!.id);
      // Guardado antes de finalizar: uma nova tentativa não cria outra fatura.
      await db.prepare("UPDATE faturas SET invoicexpress_id = ? WHERE id = ?").bind(id, f.id).run();
    }
    const final = await ix<RespostaIx>(cfg, "PUT", `/invoice_receipts/${id}/change-state.json`, { invoice_receipt: { state: "finalized" } });
    const numero = final.invoice_receipt?.inverted_sequence_number ?? final.invoice_receipt?.sequence_number ?? null;
    await db.prepare("UPDATE faturas SET estado = 'emitida', numero = ?, erro = NULL, emitida_em = ? WHERE id = ?")
      .bind(numero, new Date().toISOString(), f.id)
      .run();
    if (cliente?.email) {
      await ix(cfg, "PUT", `/invoice_receipts/${id}/email-document.json`, {
        message: {
          client: { email: cliente.email, save: "0" },
          subject: "Fatura-recibo bookgest",
          body: "Obrigado por usar o bookgest. Segue em anexo a fatura-recibo do seu pagamento.",
        },
      }).catch(() => undefined); // a fatura já está emitida; o envio pode ser repetido no InvoiceXpress
    }
  } catch (e) {
    await db.prepare("UPDATE faturas SET estado = 'erro', erro = ? WHERE id = ?").bind(String(e).slice(0, 500), f.id).run();
  }
}
