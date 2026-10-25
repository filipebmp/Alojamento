// Sincroniza as reservas de um alojamento com o calendário iCal de uma plataforma.
// Cria as reservas novas (só com datas: o nome e o n.º de hóspedes ficam por completar), atualiza datas
// alteradas e assinala as que deixaram de aparecer, sem as cancelar: o calendário pode falhar e o
// cancelamento é confirmado pelo gestor.

import { gerarToken } from "../db";
import { hojeLisboa } from "./datas";
import { type Plataforma, eReserva, lerCalendario, referencia } from "./ical";
import type { Reserva } from "./tipos";

export interface Calendario {
  id: number;
  alojamento_id: number;
  plataforma: Plataforma;
  url: string;
  ultima_sincronizacao: string | null;
  erro: string | null;
}

export const NOMES_PLATAFORMA: Record<Plataforma, string> = { booking: "Booking", airbnb: "Airbnb", outra: "outra plataforma" };

const TAMANHO_MAXIMO = 2_000_000;

export interface ResultadoSincronizacao {
  novas: number;
  atualizadas: number;
  desaparecidas: number;
}

export async function sincronizarCalendario(db: D1Database, cal: Calendario, agora = new Date()): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = { novas: 0, atualizadas: 0, desaparecidas: 0 };
  const iso = agora.toISOString();
  try {
    const res = await fetch(cal.url, { headers: { "User-Agent": "bookgest (sincronizacao de calendario)" } });
    if (!res.ok) throw new Error(`o calendário respondeu ${res.status}`);
    const texto = await res.text();
    if (texto.length > TAMANHO_MAXIMO) throw new Error("calendário demasiado grande");
    if (!texto.includes("BEGIN:VCALENDAR")) throw new Error("o endereço não é um calendário iCal");

    const hoje = hojeLisboa(agora);
    const eventos = lerCalendario(texto).filter((e) => eReserva(e, cal.plataforma) && e.checkout >= hoje);
    const existentes = (await db.prepare("SELECT * FROM reservas WHERE alojamento_id = ? AND uid_externo IS NOT NULL AND origem = ?")
      .bind(cal.alojamento_id, cal.plataforma)
      .all<Reserva>()).results;
    const porUid = new Map(existentes.map((r) => [r.uid_externo!, r]));

    for (const e of eventos) {
      const r = porUid.get(e.uid);
      if (r) {
        if (!r.cancelada && (r.checkin !== e.checkin || r.checkout !== e.checkout || r.desaparecida_em)) {
          await db.prepare("UPDATE reservas SET checkin = ?, checkout = ?, desaparecida_em = NULL WHERE id = ?").bind(e.checkin, e.checkout, r.id).run();
          resultado.atualizadas++;
        }
        continue;
      }
      // Reserva criada à mão com as mesmas datas: passa a estar ligada ao calendário (sem duplicar).
      const manual = await db.prepare(
        `SELECT id FROM reservas WHERE alojamento_id = ? AND checkin = ? AND checkout = ? AND uid_externo IS NULL AND cancelada = 0 AND ignorada = 0`,
      ).bind(cal.alojamento_id, e.checkin, e.checkout).first<number>("id");
      if (manual) {
        await db.prepare("UPDATE reservas SET uid_externo = ?, origem = ?, ref_booking = COALESCE(ref_booking, ?) WHERE id = ?")
          .bind(e.uid, cal.plataforma, referencia(e), manual)
          .run();
        continue;
      }
      await db.prepare(
        `INSERT INTO reservas (alojamento_id, token, ref_booking, nome_titular, checkin, checkout, n_hospedes, origem, uid_externo, incompleta, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?)`,
      ).bind(cal.alojamento_id, gerarToken(), referencia(e), `Reserva ${NOMES_PLATAFORMA[cal.plataforma]}`, e.checkin, e.checkout,
        cal.plataforma, e.uid, iso).run();
      resultado.novas++;
    }

    // Reservas futuras que deixaram de aparecer (um calendário vazio pode ser uma falha: nesse caso não se assinala nada).
    if (eventos.length) {
      const uids = new Set(eventos.map((e) => e.uid));
      for (const r of existentes) {
        if (!uids.has(r.uid_externo!) && r.checkin >= hoje && !r.cancelada && !r.ignorada && !r.desaparecida_em) {
          await db.prepare("UPDATE reservas SET desaparecida_em = ? WHERE id = ?").bind(iso, r.id).run();
          resultado.desaparecidas++;
        }
      }
    }
    await db.prepare("UPDATE calendarios SET ultima_sincronizacao = ?, erro = NULL WHERE id = ?").bind(iso, cal.id).run();
  } catch (e) {
    await db.prepare("UPDATE calendarios SET ultima_sincronizacao = ?, erro = ? WHERE id = ?")
      .bind(iso, String(e instanceof Error ? e.message : e).slice(0, 200), cal.id)
      .run();
  }
  return resultado;
}

export async function listarCalendarios(db: D1Database, alojamentoId?: number): Promise<Calendario[]> {
  const q = alojamentoId
    ? db.prepare("SELECT * FROM calendarios WHERE alojamento_id = ? ORDER BY id").bind(alojamentoId)
    : db.prepare("SELECT c.* FROM calendarios c JOIN alojamentos a ON a.id = c.alojamento_id WHERE a.ativo = 1 ORDER BY c.id");
  return (await q.all<Calendario>()).results;
}

export async function sincronizarTodos(db: D1Database): Promise<void> {
  for (const cal of await listarCalendarios(db)) await sincronizarCalendario(db, cal);
}
