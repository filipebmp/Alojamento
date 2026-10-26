// Quando e o que enviar ao SIBA, a partir das reservas guardadas na base de dados.

import { hojeLisboa } from "./datas";
import { eEstrangeiro, hospedeCompleto } from "./regras";
import { type ConfigSiba, enviarSiba, hospedesParaEnviar, xmlBoletins } from "./siba";
import type { Alojamento, Faturacao, Hospede, Reserva } from "./tipos";

type HospedeSiba = Hospede & { siba_enviado_em: string | null };
type ReservaSiba = Reserva & { siba_erro: string | null; siba_tentativa_em: string | null };

export async function lerConfigSiba(db: D1Database, alojamentoId: number): Promise<ConfigSiba | null> {
  return db.prepare("SELECT * FROM siba_config WHERE alojamento_id = ?").bind(alojamentoId).first<ConfigSiba>();
}

export type EstadoSiba =
  | { estado: "sem_estrangeiros" | "enviado" | "agendado" | "a_espera" | "desligado" }
  | { estado: "erro"; erro: string };

// Resultado de uma tentativa (ou o motivo de não haver nada a enviar).
export async function enviarReservaSiba(db: D1Database, reservaId: number, agora = new Date(), f: typeof fetch = fetch): Promise<EstadoSiba> {
  const r = await db.prepare("SELECT * FROM reservas WHERE id = ?").bind(reservaId).first<ReservaSiba>();
  if (!r || r.cancelada || r.ignorada) return { estado: "desligado" };
  const cfg = await lerConfigSiba(db, r.alojamento_id);
  if (!cfg?.ativo) return { estado: "desligado" };
  // O SIBA só aceita a data de entrada até hoje: as chegadas futuras seguem no dia do check-in.
  if (r.checkin > hojeLisboa(agora)) return { estado: "agendado" };

  const hospedes = (await db.prepare("SELECT * FROM hospedes WHERE reserva_id = ? ORDER BY titular DESC, id").bind(r.id).all<HospedeSiba>()).results;
  const estrangeiros = hospedes.filter(eEstrangeiro);
  const porEnviar = hospedesParaEnviar(hospedes);
  const todosRegistados = hospedes.length >= r.n_hospedes && estrangeiros.every(hospedeCompleto);

  if (!porEnviar.length) {
    if (todosRegistados && !r.siba_submetido_em && estrangeiros.length) {
      await db.prepare("UPDATE reservas SET siba_submetido_em = ?, siba_erro = NULL WHERE id = ?").bind(agora.toISOString(), r.id).run();
    }
    return { estado: estrangeiros.length ? (todosRegistados ? "enviado" : "a_espera") : hospedes.length >= r.n_hospedes ? "sem_estrangeiros" : "a_espera" };
  }

  const [a, fat] = await Promise.all([
    db.prepare("SELECT * FROM alojamentos WHERE id = ?").bind(r.alojamento_id).first<Alojamento>(),
    db.prepare("SELECT * FROM faturacao WHERE reserva_id = ?").bind(r.id).first<Faturacao>(),
  ]);
  // N.º do ficheiro: sequencial por estabelecimento, reservado antes do envio (dois envios nunca repetem).
  const numero = (await db.prepare("UPDATE siba_config SET numero_ficheiro = numero_ficheiro + 1 WHERE alojamento_id = ? RETURNING numero_ficheiro")
    .bind(cfg.alojamento_id).first<number>("numero_ficheiro"))!;
  const xml = xmlBoletins(cfg, a!.nome, a!.morada ?? cfg.localidade, porEnviar.map((h) => ({
    hospede: h,
    checkin: r.checkin,
    checkout: r.checkout,
    // A cidade de residência só é pedida na faturação: serve para o titular quando o país coincide.
    localResidencia: h.titular && fat?.cidade && fat.pais === h.pais_residencia ? fat.cidade : "",
  })), numero, agora);

  let resposta: { ok: true } | { ok: false; erro: string };
  try {
    resposta = await enviarSiba(cfg, xml, f);
  } catch (e) {
    resposta = { ok: false, erro: `Sem ligação ao SIBA: ${e instanceof Error ? e.message : String(e)}` };
  }
  const quando = agora.toISOString();
  if (!resposta.ok) {
    await db.prepare("UPDATE reservas SET siba_erro = ?, siba_tentativa_em = ? WHERE id = ?").bind(resposta.erro.slice(0, 500), quando, r.id).run();
    return { estado: "erro", erro: resposta.erro };
  }
  await db.batch([
    ...porEnviar.map((h) => db.prepare("UPDATE hospedes SET siba_enviado_em = ? WHERE id = ?").bind(quando, h.id)),
    db.prepare("UPDATE reservas SET siba_erro = NULL, siba_tentativa_em = ?, siba_submetido_em = CASE WHEN ? THEN ? ELSE siba_submetido_em END WHERE id = ?")
      .bind(quando, todosRegistados ? 1 : 0, quando, r.id),
  ]);
  return { estado: todosRegistados ? "enviado" : "a_espera" };
}

// De hora a hora: reservas já iniciadas, com estrangeiros por enviar, em alojamentos com o envio ligado.
// Depois de um erro, só volta a tentar sozinho ao fim de 24 horas (o gestor pode reenviar antes, na reserva).
export async function enviarPendentesSiba(db: D1Database, agora = new Date()): Promise<void> {
  const hoje = hojeLisboa(agora);
  const umDia = new Date(agora.getTime() - 86_400_000).toISOString();
  const ids = (await db.prepare(
    `SELECT DISTINCT r.id FROM reservas r
       JOIN siba_config s ON s.alojamento_id = r.alojamento_id AND s.ativo = 1
       JOIN hospedes h ON h.reserva_id = r.id AND h.siba_enviado_em IS NULL AND h.nacionalidade IS NOT NULL AND h.nacionalidade <> 'PT'
     WHERE r.cancelada = 0 AND r.ignorada = 0 AND r.checkin <= ? AND r.checkout >= date(?, '-30 days')
       AND (r.siba_erro IS NULL OR r.siba_tentativa_em < ?)
     LIMIT 20`,
  ).bind(hoje, hoje, umDia).all<{ id: number }>()).results;
  for (const { id } of ids) await enviarReservaSiba(db, id, agora);
}
