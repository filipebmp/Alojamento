// Publicação no Cloudflare (usada pelo GitHub Actions), a correr dentro da pasta de uma app:
//   node ../scripts/publicar.mjs <base de dados> [SEGREDO=VARIAVEL_DO_GITHUB ...]
// Cria a base de dados D1 se não existir, aplica migrações, publica o Worker e os segredos definidos.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [DB, ...mapa] = process.argv.slice(2);
// Segredos opcionais: só os que estiverem definidos no GitHub são enviados.
const SEGREDOS = mapa.map((m) => {
  const [nome, variavel = nome] = m.split("=");
  return { nome, variavel };
});

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.log("::warning::CLOUDFLARE_API_TOKEN não definido: publicação ignorada.");
  process.exit(0);
}

// Aceita o Account ID sozinho ou colado dentro do endereço do dashboard.
if (process.env.CLOUDFLARE_ACCOUNT_ID) {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID.match(/[0-9a-f]{32}/i)?.[0];
  if (!id) {
    console.error("CLOUDFLARE_ACCOUNT_ID inválido: deve ter 32 letras/números (ver o endereço dash.cloudflare.com/<id>).");
    process.exit(1);
  }
  process.env.CLOUDFLARE_ACCOUNT_ID = id;
}

const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });

let bases = JSON.parse(wrangler("d1", "list", "--json"));
if (!bases.some((b) => b.name === DB)) {
  console.log(`A criar a base de dados ${DB}…`);
  wrangler("d1", "create", DB);
  bases = JSON.parse(wrangler("d1", "list", "--json"));
}
const id = bases.find((b) => b.name === DB).uuid;
const config = readFileSync("wrangler.toml", "utf8").replace("SUBSTITUIR_PELO_ID_DA_BASE_DE_DADOS", id);
writeFileSync("wrangler.toml", config);

console.log(wrangler("d1", "migrations", "apply", DB, "--remote"));
console.log(wrangler("deploy"));

const definidos = SEGREDOS.filter((s) => process.env[s.variavel]);
if (definidos.length) {
  const ficheiro = join(mkdtempSync(join(tmpdir(), "segredos-")), "segredos.json");
  writeFileSync(ficheiro, JSON.stringify(Object.fromEntries(definidos.map((s) => [s.nome, process.env[s.variavel]]))));
  console.log(wrangler("secret", "bulk", ficheiro));
}
