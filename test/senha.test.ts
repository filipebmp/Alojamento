import { describe, expect, it } from "vitest";
import { hashSenha, verificarSenha } from "../src/lib/senha";

describe("palavra-passe", () => {
  it("aceita a palavra-passe certa e rejeita as outras", async () => {
    const guardado = await hashSenha("correta-123");
    expect(guardado).toMatch(/^pbkdf2\$100000\$/);
    expect(await verificarSenha("correta-123", guardado)).toBe(true);
    expect(await verificarSenha("errada-123", guardado)).toBe(false);
  });

  it("usa um sal diferente em cada hash", async () => {
    expect(await hashSenha("igual")).not.toBe(await hashSenha("igual"));
  });

  it("rejeita valores guardados inválidos", async () => {
    expect(await verificarSenha("x", "")).toBe(false);
    expect(await verificarSenha("x", "md5$1$a$b")).toBe(false);
  });
});
