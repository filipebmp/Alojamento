// Instala o bookgest na conta Cloudflare do gestor, com a chave de API que ele criou.
// A chave é usada só durante este pedido e guardada como segredo na conta dele (para as atualizações
// automáticas); a plataforma não a guarda.

import { type Binding, Cloudflare, ErroCloudflare } from "../../comum/cloudflare";
import type { Versao } from "../../comum/versoes";

export const NOME_SCRIPT = "bookgest";
export const NOME_BASE = "bookgest";
export const CRON_DIARIO = "17 4 * * *";

export interface ResultadoInstalacao {
  url: string;
  tokenConfiguracao: string | null; // null = já havia utilizadores (reinstalação)
  reinstalacao: boolean;
}

const aleatorio = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function instalar(
  token: string,
  d: { versao: Versao; chaveLicenca: string; urlLicencas: string; apiCloudflare?: string },
): Promise<ResultadoInstalacao> {
  const cf = new Cloudflare(token, d.apiCloudflare);

  const contas = await cf.pedido<{ id: string; name: string }[]>("GET", "/accounts");
  if (!contas.length) throw new ErroCloudflare("A chave não dá acesso a nenhuma conta. Confirme as permissões da chave.");
  const conta = contas[0].id;

  // Subdomínio workers.dev da conta (contas novas ainda não têm).
  let subdominio: string;
  try {
    subdominio = (await cf.pedido<{ subdomain: string }>("GET", `/accounts/${conta}/workers/subdomain`)).subdomain;
  } catch {
    subdominio = (await cf.pedido<{ subdomain: string }>("PUT", `/accounts/${conta}/workers/subdomain`, { subdomain: `bookgest-${aleatorio(6)}` })).subdomain;
  }
  const url = `https://${NOME_SCRIPT}.${subdominio}.workers.dev`;

  // Base de dados: reutiliza a existente numa reinstalação (os dados do gestor nunca são apagados).
  const existentes = await cf.pedido<{ uuid: string; name: string }[]>("GET", `/accounts/${conta}/d1/database?name=${NOME_BASE}`);
  const base = existentes.find((b) => b.name === NOME_BASE)?.uuid
    ?? (await cf.pedido<{ uuid: string }>("POST", `/accounts/${conta}/d1/database`, { name: NOME_BASE })).uuid;
  await cf.aplicarMigracoes(conta, base, d.versao.migracoes);

  const bindings: Binding[] = [
    { type: "d1", name: "DB", id: base },
    { type: "plain_text", name: "URL_PUBLICO", text: url },
    { type: "plain_text", name: "URL_LICENCAS", text: d.urlLicencas },
    { type: "plain_text", name: "CF_CONTA", text: conta },
    { type: "plain_text", name: "CF_SCRIPT", text: NOME_SCRIPT },
    { type: "secret_text", name: "CF_API_TOKEN", text: token },
  ];
  await cf.publicarScript(conta, NOME_SCRIPT, d.versao, bindings);
  await cf.pedido("POST", `/accounts/${conta}/workers/scripts/${NOME_SCRIPT}/subdomain`, { enabled: true, previews_enabled: false });
  await cf.pedido("PUT", `/accounts/${conta}/workers/scripts/${NOME_SCRIPT}/schedules`, [{ cron: CRON_DIARIO }]);

  // Chave de licença e, numa instalação nova, o código de uso único que abre o assistente de primeiro arranque.
  const utilizadores = await cf.consultar<{ n: number }>(conta, base, "SELECT COUNT(*) AS n FROM utilizadores");
  const reinstalacao = (utilizadores[0]?.n ?? 0) > 0;
  const tokenConfiguracao = reinstalacao ? null : aleatorio(24);
  await cf.consultar(conta, base, "INSERT OR REPLACE INTO definicoes (chave, valor) VALUES ('licenca_chave', ?)", [d.chaveLicenca]);
  if (tokenConfiguracao) {
    await cf.consultar(conta, base, "INSERT OR REPLACE INTO definicoes (chave, valor) VALUES ('token_configuracao', ?)", [await sha256(tokenConfiguracao)]);
  }
  return { url, tokenConfiguracao, reinstalacao };
}
