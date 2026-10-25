// Emails de reserva reencaminhados (Booking, Airbnb): a plataforma extrai os dados e a instalação vai buscá-los.
// Cada email completa a reserva correspondente (pelo código ou pelas datas) ou cria-a; cancelamentos ficam
// para o gestor confirmar; o que não se consegue associar fica numa lista para decidir.

import { CAMINHO_API_EMAILS_RESERVAS, type EmailReservaEntregue } from "../../../comum/licenca";
import type { DadosEmailReserva } from "../../../comum/emails";
import { gerarToken } from "../db";
import { hojeLisboa } from "./datas";
import type { Alojamento, Reserva } from "./tipos";

export type EstadoEmail = "associado" | "por_associar" | "confirmacao" | "arquivado";

export interface EmailRecebido {
  id: number;
  recebido_em: string;
  dados: string;
  estado: EstadoEmail;
  reserva_id: number | null;
}

async function encontrarReserva(db: D1Database, d: DadosEmailReserva): Promise<Reserva | null> {
  if (d.codigo) {
    const r = await db.prepare("SELECT * FROM reservas WHERE ref_booking = ? AND ignorada = 0 ORDER BY id DESC LIMIT 1").bind(d.codigo).first<Reserva>();
    if (r) return r;
  }
  if (d.checkin && d.checkout) {
    const rs = (await db.prepare("SELECT * FROM reservas WHERE checkin = ? AND checkout = ? AND ignorada = 0 AND cancelada = 0")
      .bind(d.checkin, d.checkout)
      .all<Reserva>()).results;
    const daPlataforma = rs.filter((r) => r.origem === d.plataforma);
    if (daPlataforma.length === 1) return daPlataforma[0];
    if (rs.length === 1) return rs[0];
  }
  return null;
}

// Alojamento de uma reserva nova: o único ativo, ou aquele cujo nome aparece no email.
function escolherAlojamento(d: DadosEmailReserva, ativos: Alojamento[]): Alojamento | null {
  if (ativos.length === 1) return ativos[0];
  const p = d.propriedade?.toLowerCase();
  const encontrados = p ? ativos.filter((a) => p.includes(a.nome.toLowerCase()) || a.nome.toLowerCase().includes(p)) : [];
  return encontrados.length === 1 ? encontrados[0] : null;
}

export async function processarEmail(db: D1Database, d: DadosEmailReserva, ativos: Alojamento[], agora = new Date()): Promise<{ estado: EstadoEmail; reservaId: number | null }> {
  if (d.tipo === "confirmacao_reencaminhamento") return { estado: "confirmacao", reservaId: null };
  const r = await encontrarReserva(db, d);

  if (d.tipo === "cancelada") {
    if (!r) return { estado: "por_associar", reservaId: null };
    if (!r.cancelada) await db.prepare("UPDATE reservas SET desaparecida_em = COALESCE(desaparecida_em, ?) WHERE id = ?").bind(agora.toISOString(), r.id).run();
    return { estado: "associado", reservaId: r.id };
  }

  if (r) {
    // Só preenche o que falta: o que o gestor escreveu nunca é substituído.
    const nomeEmFalta = r.incompleta || /^Reserva( |$)/.test(r.nome_titular);
    const nome = nomeEmFalta && d.nome ? d.nome : r.nome_titular;
    const hospedes = r.incompleta && d.hospedes ? d.hospedes : r.n_hospedes;
    const completa = !r.incompleta || ((nomeEmFalta ? !!d.nome : true) && !!d.hospedes);
    const datasNovas = d.tipo === "alterada" && !r.uid_externo && d.checkin && d.checkout; // as do calendário atualizam-se sozinhas
    await db.prepare(
      `UPDATE reservas SET nome_titular = ?, n_hospedes = ?, ref_booking = COALESCE(ref_booking, ?),
         valor_total_cents = CASE WHEN valor_total_cents = 0 THEN ? ELSE valor_total_cents END,
         comissao_cents = CASE WHEN comissao_cents = 0 THEN ? ELSE comissao_cents END,
         incompleta = ?, checkin = ?, checkout = ? WHERE id = ?`,
    ).bind(nome, hospedes, d.codigo ?? null, d.totalCents ?? 0, d.comissaoCents ?? 0, completa ? 0 : 1,
      datasNovas ? d.checkin : r.checkin, datasNovas ? d.checkout : r.checkout, r.id).run();
    return { estado: "associado", reservaId: r.id };
  }

  // Reserva que ainda não chegou pelo calendário: é criada já completa (o calendário liga-se a ela depois, pelas datas).
  const alojamento = escolherAlojamento(d, ativos);
  if (d.nome && d.checkin && d.checkout && d.checkout >= hojeLisboa(agora) && alojamento) {
    const res = await db.prepare(
      `INSERT INTO reservas (alojamento_id, token, ref_booking, nome_titular, checkin, checkout, n_hospedes, valor_total_cents, comissao_cents, origem, incompleta, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(alojamento.id, gerarToken(), d.codigo ?? null, d.nome, d.checkin, d.checkout, d.hospedes ?? 1, d.totalCents ?? 0, d.comissaoCents ?? 0,
      d.plataforma === "desconhecida" ? "manual" : d.plataforma, d.hospedes ? 0 : 1, agora.toISOString()).run();
    return { estado: "associado", reservaId: res.meta.last_row_id };
  }
  return { estado: "por_associar", reservaId: null };
}

async function pedido(urlBase: string, corpo: unknown, servico?: Fetcher): Promise<{ itens: EmailReservaEntregue[] }> {
  const req = new Request(new URL(CAMINHO_API_EMAILS_RESERVAS, urlBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const res = await (servico ? servico.fetch(req) : fetch(req));
  if (!res.ok) throw new Error(`a plataforma respondeu ${res.status}`);
  return res.json();
}

// Vai buscar os emails pendentes, processa-os e confirma-os à plataforma (que os apaga). Idempotente.
export async function receberEmails(db: D1Database, chave: string, urlBase: string, servico?: Fetcher): Promise<number> {
  const ativos = (await db.prepare("SELECT * FROM alojamentos WHERE ativo = 1").all<Alojamento>()).results;
  let confirmar: number[] = [];
  let total = 0;
  for (let ronda = 0; ronda < 5; ronda++) {
    const { itens } = await pedido(urlBase, { chave, confirmar }, servico);
    if (!itens.length) break;
    confirmar = [];
    for (const item of itens) {
      const ja = await db.prepare("SELECT 1 FROM emails_recebidos WHERE id_plataforma = ?").bind(item.id).first();
      if (!ja) {
        const d = item.dados as DadosEmailReserva;
        const { estado, reservaId } = await processarEmail(db, d, ativos);
        await db.prepare("INSERT INTO emails_recebidos (id_plataforma, recebido_em, dados, estado, reserva_id, criado_em) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(item.id, item.recebidoEm, JSON.stringify(d), estado, reservaId, new Date().toISOString())
          .run();
        total++;
      }
      confirmar.push(item.id);
    }
  }
  if (confirmar.length) await pedido(urlBase, { chave, confirmar }, servico);
  return total;
}

export async function listarEmails(db: D1Database, limite = 40): Promise<EmailRecebido[]> {
  return (await db.prepare("SELECT * FROM emails_recebidos ORDER BY id DESC LIMIT ?").bind(limite).all<EmailRecebido>()).results;
}
