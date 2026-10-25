import { hashSenha } from "../../../comum/senha";

export type Papel = "gestor" | "equipa";

export interface Utilizador {
  id: number;
  email: string;
  nome: string | null;
  senha: string;
  papel: Papel;
  ativo: number;
  versao_sessao: string;
  criado_em: string;
  ultimo_acesso: string | null;
}

export function emailValido(email: string | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function novaVersaoSessao(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function obterUtilizador(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM utilizadores WHERE id = ?").bind(id).first<Utilizador>();
}

export function obterPorEmail(db: D1Database, email: string) {
  return db.prepare("SELECT * FROM utilizadores WHERE email = ?").bind(email).first<Utilizador>();
}

export async function listarUtilizadores(db: D1Database): Promise<Utilizador[]> {
  return (await db.prepare("SELECT * FROM utilizadores ORDER BY ativo DESC, papel DESC, email").all<Utilizador>()).results;
}

export async function contarUtilizadores(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM utilizadores").first<number>("n")) ?? 0;
}

export async function criarUtilizador(db: D1Database, d: { email: string; nome: string | null; senha: string; papel: Papel }): Promise<number> {
  const res = await db.prepare(
    "INSERT INTO utilizadores (email, nome, senha, papel, versao_sessao, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(d.email, d.nome, await hashSenha(d.senha), d.papel, novaVersaoSessao(), new Date().toISOString())
    .run();
  return res.meta.last_row_id;
}

// Muda a palavra-passe e termina todas as sessões desse utilizador.
export async function mudarSenha(db: D1Database, id: number, senha: string): Promise<void> {
  await db.prepare("UPDATE utilizadores SET senha = ?, versao_sessao = ? WHERE id = ?")
    .bind(await hashSenha(senha), novaVersaoSessao(), id)
    .run();
}

// O último gestor ativo não pode ser desativado nem passar a equipa: a instalação ficaria sem administração.
export async function eUltimoGestor(db: D1Database, id: number): Promise<boolean> {
  const outros = await db.prepare("SELECT COUNT(*) AS n FROM utilizadores WHERE papel = 'gestor' AND ativo = 1 AND id != ?")
    .bind(id)
    .first<number>("n");
  return !outros;
}

// ---------- Códigos de recuperação ----------

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const N_CODIGOS = 8;

function gerarCodigo(): string {
  const letras = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => ALFABETO[b % ALFABETO.length]).join("");
  return `${letras.slice(0, 5)}-${letras.slice(5)}`;
}

// Normaliza o que o utilizador escreveu (minúsculas, espaços, sem hífen).
export function normalizarCodigo(c: string): string {
  const s = c.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 10 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}

async function hashCodigo(codigo: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizarCodigo(codigo)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Substitui os códigos anteriores. Os códigos só são mostrados uma vez.
export async function gerarCodigos(db: D1Database, utilizadorId: number): Promise<string[]> {
  const codigos = Array.from({ length: N_CODIGOS }, gerarCodigo);
  const hashes = await Promise.all(codigos.map(hashCodigo));
  await db.batch([
    db.prepare("DELETE FROM codigos_recuperacao WHERE utilizador_id = ?").bind(utilizadorId),
    ...hashes.map((h) => db.prepare("INSERT INTO codigos_recuperacao (utilizador_id, hash) VALUES (?, ?)").bind(utilizadorId, h)),
  ]);
  return codigos;
}

export async function codigosDisponiveis(db: D1Database, utilizadorId: number): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM codigos_recuperacao WHERE utilizador_id = ? AND usado_em IS NULL")
    .bind(utilizadorId)
    .first<number>("n")) ?? 0;
}

// Gasta o código se for válido e ainda não usado (a condição no UPDATE evita usar o mesmo código duas vezes).
export async function usarCodigo(db: D1Database, utilizadorId: number, codigo: string): Promise<boolean> {
  const res = await db.prepare(
    "UPDATE codigos_recuperacao SET usado_em = ? WHERE utilizador_id = ? AND hash = ? AND usado_em IS NULL",
  )
    .bind(new Date().toISOString(), utilizadorId, await hashCodigo(codigo))
    .run();
  return res.meta.changes > 0;
}

// ---------- Recuperação por email ----------

const VALIDADE_MS = 3_600_000;
export const MAX_PEDIDOS_HORA = 3;

const aleatorio = (n: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Devolve o token (vai no link do email) e o segredo do browser (vai num cookie), ou null se houver pedidos a mais.
export async function criarPedidoRecuperacao(db: D1Database, utilizadorId: number, agora = new Date()) {
  const recentes = await db.prepare("SELECT COUNT(*) AS n FROM pedidos_recuperacao WHERE utilizador_id = ? AND criado_em > ?")
    .bind(utilizadorId, new Date(agora.getTime() - VALIDADE_MS).toISOString())
    .first<number>("n");
  if ((recentes ?? 0) >= MAX_PEDIDOS_HORA) return null;
  const token = aleatorio(32);
  const navegador = aleatorio(32);
  await db.prepare(
    "INSERT INTO pedidos_recuperacao (utilizador_id, token_hash, navegador_hash, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(utilizadorId, await sha256(token), await sha256(navegador), agora.toISOString(), new Date(agora.getTime() + VALIDADE_MS).toISOString())
    .run();
  return { token, navegador };
}

export type ResultadoPedido = { id: number; utilizadorId: number } | "invalido" | "outro_navegador";

// Valida o link: existe, não expirou, não foi usado e é aberto no browser que fez o pedido.
export async function validarPedidoRecuperacao(db: D1Database, token: string, navegador: string | undefined, agora = new Date()): Promise<ResultadoPedido> {
  const p = await db.prepare("SELECT id, utilizador_id, navegador_hash, expira_em, usado_em FROM pedidos_recuperacao WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<{ id: number; utilizador_id: number; navegador_hash: string; expira_em: string; usado_em: string | null }>();
  if (!p || p.usado_em || p.expira_em <= agora.toISOString()) return "invalido";
  if (!navegador || (await sha256(navegador)) !== p.navegador_hash) return "outro_navegador";
  return { id: p.id, utilizadorId: p.utilizador_id };
}

// Marca como usado (a condição evita que o mesmo link sirva duas vezes em pedidos simultâneos).
export async function usarPedidoRecuperacao(db: D1Database, id: number): Promise<boolean> {
  const r = await db.prepare("UPDATE pedidos_recuperacao SET usado_em = ? WHERE id = ? AND usado_em IS NULL").bind(new Date().toISOString(), id).run();
  return r.meta.changes > 0;
}
