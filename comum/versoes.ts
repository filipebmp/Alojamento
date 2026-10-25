// Versões da app publicadas na plataforma, assinadas com Ed25519 no GitHub Actions.
// As instalações só aplicam uma versão cuja assinatura confere com a chave pública embutida no código:
// quem tivesse acesso à plataforma não conseguiria enviar código seu às instalações dos gestores.

export const CAMINHO_API_VERSOES = "/api/v1/versoes";

export interface Migracao {
  nome: string; // ex.: "0004_utilizadores.sql" (mesmo nome que o wrangler regista em d1_migrations)
  sql: string;
}

export interface Versao {
  versao: string;
  compatibilidade: string; // compatibility_date do Worker
  script: string; // módulo ES único (index.js)
  migracoes: Migracao[];
}

// O que circula: o JSON exato que foi assinado e a assinatura (base64).
export interface VersaoAssinada {
  payload: string;
  assinatura: string;
}

export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function assinaturaConfere(payload: string, assinatura: string, chavePublica: string): Promise<boolean> {
  try {
    const chave = await crypto.subtle.importKey("raw", deB64(chavePublica), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, chave, deB64(assinatura), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

// Separa um ficheiro de migração em instruções (sem comentários). As migrações não usam ";" dentro de textos.
export function separarSql(sql: string): string[] {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Tabela que o wrangler usa para registar migrações aplicadas (mantém-se compatível com `wrangler d1 migrations`).
export const SQL_TABELA_MIGRACOES =
  "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)";

// Chave pública (Ed25519, 32 bytes em base64) que verifica as versões. A privada só existe no GitHub
// (segredo BOOKGEST_CHAVE_ASSINATURA). Vazia = atualizações automáticas e publicação de versões desligadas.
export const CHAVE_PUBLICA_VERSOES = "";
