import type { Alojamento, DeclaracaoTmt, Faturacao, Hospede, Passo, Reserva } from "./lib/tipos";

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
  return (await db.prepare("SELECT * FROM declaracoes_tmt_alojamento").all<DeclaracaoTmt>()).results;
}

export async function listarAlojamentos(db: D1Database): Promise<Alojamento[]> {
  return (await db.prepare("SELECT * FROM alojamentos ORDER BY ativo DESC, nome, id").all<Alojamento>()).results;
}

export async function obterAlojamento(db: D1Database, id: number): Promise<Alojamento | null> {
  return db.prepare("SELECT * FROM alojamentos WHERE id = ?").bind(id).first<Alojamento>();
}

export async function listarPassos(db: D1Database, alojamentoId: number): Promise<Passo[]> {
  return (
    await db
      .prepare(
        `SELECT id, alojamento_id, ordem, texto, imagem IS NOT NULL AS tem_imagem, atualizado_em
         FROM passos WHERE alojamento_id = ? ORDER BY ordem, id`,
      )
      .bind(alojamentoId)
      .all<Passo>()
  ).results;
}

export async function obterImagemPasso(db: D1Database, id: number, alojamentoId: number) {
  const row = await db
    .prepare("SELECT imagem, imagem_tipo, atualizado_em FROM passos WHERE id = ? AND alojamento_id = ? AND imagem IS NOT NULL")
    .bind(id, alojamentoId)
    .first<{ imagem: ArrayBuffer | number[]; imagem_tipo: string; atualizado_em: string }>();
  if (!row) return null;
  // O D1 pode devolver BLOBs como ArrayBuffer ou como array de bytes.
  return { bytes: new Uint8Array(row.imagem), tipo: row.imagem_tipo, versao: row.atualizado_em };
}

// ---------- Definições da instalação ----------

export async function lerDefinicao(db: D1Database, chave: string): Promise<string | null> {
  return (await db.prepare("SELECT valor FROM definicoes WHERE chave = ?").bind(chave).first<{ valor: string }>())?.valor ?? null;
}

export async function gravarDefinicao(db: D1Database, chave: string, valor: string): Promise<void> {
  await db.prepare("INSERT INTO definicoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .bind(chave, valor)
    .run();
}

// Grava só se ainda não existir e devolve o valor que ficou (seguro com pedidos em simultâneo).
export async function definicaoInicial(db: D1Database, chave: string, valor: string): Promise<string> {
  await db.prepare("INSERT OR IGNORE INTO definicoes (chave, valor) VALUES (?, ?)").bind(chave, valor).run();
  return (await lerDefinicao(db, chave))!;
}

// Acertos após a migração 0003, feitos uma vez por instância do Worker:
// o código do cofre passa do segredo CODIGO_CHAVES para o primeiro alojamento, e linhas
// criadas pela versão anterior durante a publicação ficam associadas a esse alojamento.
let preparada: Promise<void> | null = null;

export function prepararInstalacao(db: D1Database, codigoChaves: string | undefined): Promise<void> {
  preparada ??= (async () => {
    const primeiro = "(SELECT MIN(id) FROM alojamentos)";
    await db.batch([
      ...(codigoChaves
        ? [db.prepare(`UPDATE alojamentos SET codigo_cofre = ? WHERE codigo_cofre IS NULL AND id = ${primeiro}`).bind(codigoChaves)]
        : []),
      db.prepare(`UPDATE reservas SET alojamento_id = ${primeiro} WHERE alojamento_id IS NULL`),
      db.prepare(`UPDATE passos SET alojamento_id = ${primeiro} WHERE alojamento_id IS NULL`),
    ]);
  })().catch((e) => {
    preparada = null;
    throw e;
  });
  return preparada;
}
