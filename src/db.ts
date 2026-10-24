import type { DeclaracaoTmt, Faturacao, Hospede, Reserva } from "./lib/tipos";

export interface ReservaCompleta {
  reserva: Reserva;
  hospedes: Hospede[];
  faturacao: Faturacao | null;
}

export function gerarToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

export async function obterReserva(db: D1Database, id: number): Promise<ReservaCompleta | null> {
  const reserva = await db.prepare("SELECT * FROM reservas WHERE id = ?").bind(id).first<Reserva>();
  return reserva ? completar(db, reserva) : null;
}

export async function obterReservaPorToken(db: D1Database, token: string): Promise<ReservaCompleta | null> {
  const reserva = await db.prepare("SELECT * FROM reservas WHERE token = ?").bind(token).first<Reserva>();
  return reserva ? completar(db, reserva) : null;
}

async function completar(db: D1Database, reserva: Reserva): Promise<ReservaCompleta> {
  const [hospedes, faturacao] = await Promise.all([
    db.prepare("SELECT * FROM hospedes WHERE reserva_id = ? ORDER BY titular DESC, id").bind(reserva.id).all<Hospede>(),
    db.prepare("SELECT * FROM faturacao WHERE reserva_id = ?").bind(reserva.id).first<Faturacao>(),
  ]);
  return { reserva, hospedes: hospedes.results, faturacao };
}

// Reservas ativas e as que ainda podem ter obrigações pendentes.
export async function listarReservas(db: D1Database): Promise<ReservaCompleta[]> {
  const [reservas, hospedes, faturacao] = await Promise.all([
    db.prepare("SELECT * FROM reservas ORDER BY checkin DESC").all<Reserva>(),
    db.prepare("SELECT * FROM hospedes ORDER BY titular DESC, id").all<Hospede>(),
    db.prepare("SELECT * FROM faturacao").all<Faturacao>(),
  ]);
  return reservas.results.map((reserva) => ({
    reserva,
    hospedes: hospedes.results.filter((h) => h.reserva_id === reserva.id),
    faturacao: faturacao.results.find((f) => f.reserva_id === reserva.id) ?? null,
  }));
}

export async function listarDeclaracoesTmt(db: D1Database): Promise<DeclaracaoTmt[]> {
  return (await db.prepare("SELECT * FROM declaracoes_tmt").all<DeclaracaoTmt>()).results;
}
