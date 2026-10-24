// Publicação no Cloudflare (usado pelo GitHub Actions):
// cria a base de dados D1 se não existir, aplica migrações, publica o Worker e os segredos.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = "alojamento";
const SEGREDOS = ["ADMIN_PASSWORD", "SESSION_SECRET", "CODIGO_CHAVES"];

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.log("::warning::CLOUDFLARE_API_TOKEN não definido: publicação ignorada.");
  process.exit(0);
}

const faltam = SEGREDOS.filter((n) => !process.env[n]);
if (faltam.length) {
  console.error(`Faltam segredos no GitHub (Settings → Secrets and variables → Actions): ${faltam.join(", ")}`);
  process.exit(1);
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

const ficheiro = join(mkdtempSync(join(tmpdir(), "segredos-")), "segredos.json");
writeFileSync(ficheiro, JSON.stringify(Object.fromEntries(SEGREDOS.map((n) => [n, process.env[n]]))));
console.log(wrangler("secret", "bulk", ficheiro));
