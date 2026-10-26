// Identificação do responsável pelo tratamento dos dados dos hóspedes (o gestor), mostrada no check-in (art. 13.º do RGPD).
import { gravarDefinicao, lerDefinicao } from "../db";

export interface Responsavel {
  nome: string;
  nif: string;
  email: string;
}

const CHAVE = "rgpd_responsavel";

export async function lerResponsavel(db: D1Database): Promise<Responsavel | null> {
  const v = await lerDefinicao(db, CHAVE);
  return v ? (JSON.parse(v) as Responsavel) : null;
}

export async function gravarResponsavel(db: D1Database, r: Responsavel): Promise<void> {
  await gravarDefinicao(db, CHAVE, JSON.stringify(r));
}
