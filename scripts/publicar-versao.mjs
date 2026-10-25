// Assina e publica na plataforma a versão atual da app (GitHub Actions, depois de publicar a plataforma).
//   node scripts/publicar-versao.mjs <pacote index.js>
// Precisa do segredo BOOKGEST_CHAVE_ASSINATURA (chave privada Ed25519 em PEM). Sem ele, não publica.
import { createPrivateKey, sign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const [pacote] = process.argv.slice(2);
const chavePrivada = process.env.BOOKGEST_CHAVE_ASSINATURA;
const plataforma = process.env.URL_PLATAFORMA || "https://bookgest-plataforma.filipebmp.workers.dev";

if (!chavePrivada) {
  console.log("::warning::BOOKGEST_CHAVE_ASSINATURA não definido: versão não publicada (sem atualizações automáticas).");
  process.exit(0);
}

const versao = readFileSync("app/src/versao.ts", "utf8").match(/VERSAO = "(\d+\.\d+\.\d+)"/)[1];
const compatibilidade = readFileSync("app/wrangler.toml", "utf8").match(/compatibility_date = "([\d-]+)"/)[1];
const migracoes = readdirSync("app/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((nome) => ({ nome, sql: readFileSync(`app/migrations/${nome}`, "utf8") }));
const payload = JSON.stringify({ versao, compatibilidade, script: readFileSync(pacote, "utf8"), migracoes });
const assinatura = sign(null, Buffer.from(payload), createPrivateKey(chavePrivada)).toString("base64");

const res = await fetch(`${plataforma}/api/v1/versoes`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payload, assinatura }),
});
const resposta = await res.json().catch(() => ({}));
if (res.status === 409 || res.status === 503) {
  // 409: o código da app mudou sem mudar a versão (as instalações não recebem a alteração).
  // 503: a chave pública ainda não está no código (comum/versoes.ts).
  console.log(`::warning::${resposta.erro}`);
} else if (!res.ok) {
  console.error(`Publicação da versão ${versao} falhou (${res.status}): ${resposta.erro ?? ""}`);
  process.exit(1);
} else {
  console.log(`Versão ${versao}: ${resposta.estado}`);
}
