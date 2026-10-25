import { describe, expect, it } from "vitest";
import { assinaturaConfere, compararVersoes, separarSql } from "./versoes";

describe("versões", () => {
  it("compara números de versão", () => {
    expect(compararVersoes("0.10.0", "0.9.9")).toBe(1);
    expect(compararVersoes("0.4.0", "0.4.0")).toBe(0);
    expect(compararVersoes("0.4", "0.4.1")).toBe(-1);
  });

  it("aceita só a assinatura feita com a chave privada correspondente", async () => {
    const par = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const outra = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
    const assinar = async (k: CryptoKey, texto: string) => b64(await crypto.subtle.sign({ name: "Ed25519" }, k, new TextEncoder().encode(texto)));
    const publica = b64((await crypto.subtle.exportKey("raw", par.publicKey)) as ArrayBuffer);
    const payload = JSON.stringify({ versao: "1.0.0", script: "export default {}" });
    const assinatura = await assinar(par.privateKey, payload);
    expect(await assinaturaConfere(payload, assinatura, publica)).toBe(true);
    expect(await assinaturaConfere(payload.replace("1.0.0", "6.6.6"), assinatura, publica)).toBe(false);
    expect(await assinaturaConfere(payload, await assinar(outra.privateKey, payload), publica)).toBe(false);
    expect(await assinaturaConfere(payload, "lixo", publica)).toBe(false);
  });

  it("separa as instruções de uma migração", () => {
    const sql = "-- comentário\nCREATE TABLE a (x TEXT);\n\nINSERT INTO a VALUES ('%Y-%m');\nALTER TABLE a ADD COLUMN y INTEGER;\n";
    expect(separarSql(sql)).toEqual(["CREATE TABLE a (x TEXT)", "INSERT INTO a VALUES ('%Y-%m')", "ALTER TABLE a ADD COLUMN y INTEGER"]);
  });
});
