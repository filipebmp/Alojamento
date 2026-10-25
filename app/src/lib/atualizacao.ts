// Atualização automática: a instalação descarrega a versão mais recente da plataforma, confirma a
// assinatura com a chave pública embutida, aplica as migrações em falta e publica-se a si própria
// com a chave de API do gestor (segredo CF_API_TOKEN, só existe nas instalações feitas pelo instalador).

import { Cloudflare } from "../../../comum/cloudflare";
import {
  CAMINHO_API_VERSOES,
  CHAVE_PUBLICA_VERSOES,
  type Migracao,
  SQL_TABELA_MIGRACOES,
  type Versao,
  type VersaoAssinada,
  assinaturaConfere,
  compararVersoes,
  separarSql,
} from "../../../comum/versoes";

export interface ConfigAtualizacao {
  token: string;
  conta: string;
  script: string;
  urlPlataforma: string;
  servico?: Fetcher;
  apiCloudflare?: string;
  chavePublica?: string; // para testes
}

// Cada migração e o seu registo em d1_migrations vão no mesmo batch (transação): ou entra tudo, ou nada.
export async function aplicarMigracoesLocais(db: D1Database, migracoes: Migracao[]): Promise<string[]> {
  await db.prepare(SQL_TABELA_MIGRACOES).run();
  const feitas = new Set((await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results.map((r) => r.name));
  const aplicadas: string[] = [];
  for (const m of migracoes) {
    if (feitas.has(m.nome)) continue;
    await db.batch([...separarSql(m.sql).map((s) => db.prepare(s)), db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.nome)]);
    aplicadas.push(m.nome);
  }
  return aplicadas;
}

export async function atualizar(db: D1Database, cfg: ConfigAtualizacao, alvo: string, atual: string): Promise<Versao> {
  const chavePublica = cfg.chavePublica ?? CHAVE_PUBLICA_VERSOES;
  if (!chavePublica) throw new Error("chave pública das versões por definir");
  const pedido = new Request(new URL(`${CAMINHO_API_VERSOES}/${alvo}`, cfg.urlPlataforma));
  const res = await (cfg.servico ? cfg.servico.fetch(pedido) : fetch(pedido));
  if (!res.ok) throw new Error(`a plataforma respondeu ${res.status} ao pedir a versão ${alvo}`);
  const assinada = await res.json<VersaoAssinada>();
  if (!(await assinaturaConfere(assinada.payload, assinada.assinatura, chavePublica))) throw new Error("assinatura da versão inválida");
  const v = JSON.parse(assinada.payload) as Versao;
  if (v.versao !== alvo || compararVersoes(v.versao, atual) <= 0) throw new Error(`versão inesperada (${v.versao})`);
  await aplicarMigracoesLocais(db, v.migracoes);
  const cf = new Cloudflare(cfg.token, cfg.apiCloudflare);
  await cf.publicarScript(cfg.conta, cfg.script, v, "manter");
  // Instalações antigas tinham só a verificação diária: passa a ser de hora a hora (calendários).
  await cf.pedido("PUT", `/accounts/${cfg.conta}/workers/scripts/${cfg.script}/schedules`, [{ cron: "17 * * * *" }]);
  return v;
}
