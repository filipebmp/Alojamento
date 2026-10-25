// Palavra-passe do gestor guardada como hash PBKDF2-SHA256 ("pbkdf2$iterações$sal$hash", em base64).
// 100 000 iterações é o máximo que o runtime dos Workers aceita.

const ITERACOES = 100_000;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, chave, 256));
}

export async function hashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACOES}$${b64(sal)}$${b64(await derivar(senha, sal, ITERACOES))}`;
}

export async function verificarSenha(senha: string, guardado: string): Promise<boolean> {
  const [tipo, iteracoes, sal, hash] = guardado.split("$");
  if (tipo !== "pbkdf2" || !sal || !hash) return false;
  return iguais(await derivar(senha, deB64(sal), Number(iteracoes)), deB64(hash));
}

// Comparação em tempo constante.
export function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

export const SENHA_MINIMA = 8;
