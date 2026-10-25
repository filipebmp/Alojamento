import { describe, expect, it } from "vitest";
import { emailValido, normalizarCodigo } from "../src/lib/utilizadores";

describe("utilizadores", () => {
  it("normaliza o email", () => {
    expect(emailValido("  Ana@Exemplo.PT ")).toBe("ana@exemplo.pt");
    expect(emailValido("ana@exemplo")).toBeNull();
    expect(emailValido("")).toBeNull();
    expect(emailValido(undefined)).toBeNull();
  });

  it("aceita o código de recuperação escrito de várias formas", () => {
    expect(normalizarCodigo("abcde-fghjk")).toBe("ABCDE-FGHJK");
    expect(normalizarCodigo("ABCDE FGHJK")).toBe("ABCDE-FGHJK");
    expect(normalizarCodigo("abcdefghjk")).toBe("ABCDE-FGHJK");
  });
});
