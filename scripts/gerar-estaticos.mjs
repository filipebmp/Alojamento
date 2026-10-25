// Gera app/src/estaticos.gerado.ts com o conteúdo de app/public/: a app é publicada como um único
// ficheiro (sem "assets" do Cloudflare), para o instalador e as atualizações automáticas a poderem enviar.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pasta = new URL("../app/public/", import.meta.url).pathname;
const tipos = { css: "text/css", svg: "image/svg+xml", webmanifest: "application/manifest+json", js: "text/javascript" };
const ficheiros = readdirSync(pasta).sort().map((nome) => ({
  caminho: `/${nome}`,
  tipo: `${tipos[nome.split(".").pop()] ?? "application/octet-stream"}; charset=utf-8`,
  conteudo: readFileSync(join(pasta, nome), "utf8"),
}));
writeFileSync(
  new URL("../app/src/estaticos.gerado.ts", import.meta.url),
  `// Gerado por scripts/gerar-estaticos.mjs a partir de app/public/ — não editar.\n` +
    `export const ESTATICOS: Record<string, { tipo: string; conteudo: string }> = ${JSON.stringify(
      Object.fromEntries(ficheiros.map((f) => [f.caminho, { tipo: f.tipo, conteudo: f.conteudo }])),
      null,
      2,
    )};\n`,
);
