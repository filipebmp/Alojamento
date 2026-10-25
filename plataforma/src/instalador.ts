// Cria (ou reinstala) uma instalação do bookgest numa conta Cloudflare:
// - modo "privado": na conta do gestor, com a chave de API que ele criou. A chave fica como segredo na
//   conta dele (para a atualização automática); a plataforma não a guarda.
// - modo "alojado": na conta do fornecedor, uma app e uma base por cliente. A plataforma atualiza-as.

import { type Binding, Cloudflare, ErroCloudflare, ligarDominio } from "../../comum/cloudflare";
import { type Versao, compararVersoes } from "../../comum/versoes";

export const NOME_PRIVADO = "bookgest";
// De hora a hora: importação dos calendários (e, uma vez por dia, licença e atualização).
export const CRON_INSTALACAO = "17 * * * *";
export const PLATAFORMA_SCRIPT = "bookgest-plataforma";

export interface ResultadoInstalacao {
  url: string;
  tokenConfiguracao: string | null; // null = já havia utilizadores (reinstalação)
  reinstalacao: boolean;
  conta: string;
  base: string;
}

export interface OpcoesInstalacao {
  versao: Versao;
  chaveLicenca: string;
  urlLicencas: string;
  apiCloudflare?: string;
  // Alojado: conta do fornecedor e nome da instalação; privado: primeira conta da chave, nome "bookgest".
  // Com "dominio", a instalação alojada fica em <hostname> (ex.: joao.bookgest.pt) em vez do workers.dev.
  alojado?: { conta: string; nome: string; dominio?: { hostname: string; zona: string } };
}

const aleatorio = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Nomes que nenhum cliente pode usar (subdomínios do próprio bookgest.pt).
const RESERVADOS = new Set(["www", "painel", "api", "app", "admin", "gestao", "mail", "email", "send", "smtp", "bookgest", "ajuda", "suporte", "status", "blog", "docs", "teste", "demo"]);

// Nome do endereço escolhido pelo cliente (modo alojado): bk-<slug> é o nome da app e da base.
export function slugValido(s: string | undefined): string | null {
  const x = s?.trim().toLowerCase();
  return x && /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(x) && !x.includes("--") && !RESERVADOS.has(x) ? x : null;
}

export const nomeAlojado = (slug: string) => `bk-${slug}`;

export async function instalar(token: string, d: OpcoesInstalacao): Promise<ResultadoInstalacao> {
  const cf = new Cloudflare(token, d.apiCloudflare);
  const nome = d.alojado?.nome ?? NOME_PRIVADO;

  let conta = d.alojado?.conta;
  if (!conta) {
    const contas = await cf.pedido<{ id: string; name: string }[]>("GET", "/accounts");
    if (!contas.length) throw new ErroCloudflare("A chave não dá acesso a nenhuma conta. Confirme as permissões da chave.");
    conta = contas[0].id;
  }

  // Subdomínio workers.dev da conta (contas novas ainda não têm).
  let subdominio: string;
  try {
    subdominio = (await cf.pedido<{ subdomain: string }>("GET", `/accounts/${conta}/workers/subdomain`)).subdomain;
  } catch {
    subdominio = (await cf.pedido<{ subdomain: string }>("PUT", `/accounts/${conta}/workers/subdomain`, { subdomain: `bookgest-${aleatorio(6)}` })).subdomain;
  }
  const url = d.alojado?.dominio ? `https://${d.alojado.dominio.hostname}` : `https://${nome}.${subdominio}.workers.dev`;

  // Base de dados: reutiliza a existente numa reinstalação (os dados do gestor nunca são apagados).
  const existentes = await cf.pedido<{ uuid: string; name: string }[]>("GET", `/accounts/${conta}/d1/database?name=${nome}`);
  const base = existentes.find((b) => b.name === nome)?.uuid
    ?? (await cf.pedido<{ uuid: string }>("POST", `/accounts/${conta}/d1/database`, { name: nome })).uuid;
  await cf.aplicarMigracoes(conta, base, d.versao.migracoes);

  const bindings: Binding[] = [
    { type: "d1", name: "DB", id: base },
    { type: "plain_text", name: "URL_PUBLICO", text: url },
    { type: "plain_text", name: "URL_LICENCAS", text: d.urlLicencas },
    ...(d.alojado
      // Na conta do fornecedor, o Cloudflare não deixa um Worker chamar outro pelo workers.dev: ligação direta.
      ? [{ type: "service", name: "PLATAFORMA", service: PLATAFORMA_SCRIPT } as const]
      : [
          { type: "plain_text", name: "CF_CONTA", text: conta } as const,
          { type: "plain_text", name: "CF_SCRIPT", text: nome } as const,
          { type: "secret_text", name: "CF_API_TOKEN", text: token } as const,
        ]),
  ];
  await cf.publicarScript(conta, nome, d.versao, bindings);
  await cf.pedido("POST", `/accounts/${conta}/workers/scripts/${nome}/subdomain`, { enabled: true, previews_enabled: false });
  if (d.alojado?.dominio) await ligarDominio(cf, conta, d.alojado.dominio.zona, d.alojado.dominio.hostname, nome);
  await cf.pedido("PUT", `/accounts/${conta}/workers/scripts/${nome}/schedules`, [{ cron: CRON_INSTALACAO }]);

  // Chave de licença e, numa instalação nova, o código de uso único que abre o assistente de primeiro arranque.
  const utilizadores = await cf.consultar<{ n: number }>(conta, base, "SELECT COUNT(*) AS n FROM utilizadores");
  const reinstalacao = (utilizadores[0]?.n ?? 0) > 0;
  const tokenConfiguracao = reinstalacao ? null : aleatorio(24);
  await cf.consultar(conta, base, "INSERT OR REPLACE INTO definicoes (chave, valor) VALUES ('licenca_chave', ?)", [d.chaveLicenca]);
  if (tokenConfiguracao) {
    await cf.consultar(conta, base, "INSERT OR REPLACE INTO definicoes (chave, valor) VALUES ('token_configuracao', ?)", [await sha256(tokenConfiguracao)]);
  }
  return { url, tokenConfiguracao, reinstalacao, conta, base };
}

// Atualiza uma instalação alojada para a versão indicada: migrações em falta e novo código (mantendo as ligações).
export async function atualizarAlojada(token: string, conta: string, nome: string, base: string, v: Versao, apiCloudflare?: string) {
  const cf = new Cloudflare(token, apiCloudflare);
  await cf.aplicarMigracoes(conta, base, v.migracoes);
  await cf.publicarScript(conta, nome, v, "manter");
  await cf.pedido("PUT", `/accounts/${conta}/workers/scripts/${nome}/schedules`, [{ cron: CRON_INSTALACAO }]);
}

// Instalação alojada criada antes do domínio próprio: liga <hostname> e atualiza o URL_PUBLICO da app
// (os links de check-in passam a usar o domínio; o workers.dev continua a funcionar).
export async function mudarParaDominio(
  token: string,
  conta: string,
  nome: string,
  v: Versao,
  d: { hostname: string; zona: string; urlLicencas: string },
  apiCloudflare?: string,
) {
  const cf = new Cloudflare(token, apiCloudflare);
  await ligarDominio(cf, conta, d.zona, d.hostname, nome);
  await cf.publicarScript(conta, nome, v, {
    mudar: [
      { type: "plain_text", name: "URL_PUBLICO", text: `https://${d.hostname}` },
      { type: "plain_text", name: "URL_LICENCAS", text: d.urlLicencas },
    ],
    manter: ["d1", "secret_text", "service"],
  });
}

export function precisaAtualizar(publicada: string | null, atual: string): boolean {
  return !publicada || compararVersoes(atual, publicada) > 0;
}
