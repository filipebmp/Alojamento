// Cliente mínimo da API do Cloudflare, usado pelo instalador (plataforma) e pela atualização automática
// (instalação do gestor), sempre com a chave de API do gestor.

import { type Migracao, SQL_TABELA_MIGRACOES, type Versao } from "./versoes";

export const API_CLOUDFLARE = "https://api.cloudflare.com/client/v4";

export class ErroCloudflare extends Error {}

interface RespostaCf<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

export class Cloudflare {
  constructor(
    private token: string,
    private base = API_CLOUDFLARE,
  ) {}

  async pedido<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const res = await fetch(this.base + caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${this.token}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => null)) as RespostaCf<T> | null;
    if (!res.ok || !json?.success) {
      const msg = json?.errors?.map((e) => `${e.message} (${e.code})`).join("; ") || `HTTP ${res.status}`;
      throw new ErroCloudflare(msg);
    }
    return json.result;
  }

  // ---------- D1 ----------

  async consultar<T = Record<string, unknown>>(conta: string, base: string, sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pedido<{ results: T[] }[]>("POST", `/accounts/${conta}/d1/database/${base}/query`, { sql, params });
    return r.flatMap((x) => x.results ?? []);
  }

  // Aplica as migrações em falta e regista-as em d1_migrations (como o wrangler).
  async aplicarMigracoes(conta: string, base: string, migracoes: Migracao[]): Promise<string[]> {
    await this.consultar(conta, base, SQL_TABELA_MIGRACOES);
    const feitas = new Set((await this.consultar<{ name: string }>(conta, base, "SELECT name FROM d1_migrations")).map((r) => r.name));
    const aplicadas: string[] = [];
    for (const m of migracoes) {
      if (feitas.has(m.nome)) continue;
      await this.consultar(conta, base, `${m.sql.trim().replace(/;?\s*$/, ";")}\nINSERT INTO d1_migrations (name) VALUES ('${m.nome.replace(/'/g, "''")}');`);
      aplicadas.push(m.nome);
    }
    return aplicadas;
  }

  // ---------- Workers ----------

  // Publica o módulo da versão. Na primeira publicação definem-se as ligações (bindings);
  // nas atualizações mantêm-se as existentes (keep_bindings).
  async publicarScript(conta: string, nome: string, v: Pick<Versao, "script" | "compatibilidade">, bindings: Binding[] | "manter") {
    const metadata = {
      main_module: "index.js",
      compatibility_date: v.compatibilidade,
      ...(bindings === "manter" ? { bindings: [], keep_bindings: ["d1", "plain_text", "secret_text", "service"] } : { bindings }),
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("index.js", new Blob([v.script], { type: "application/javascript+module" }), "index.js");
    const res = await fetch(`${this.base}/accounts/${conta}/workers/scripts/${nome}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    const json = (await res.json().catch(() => null)) as RespostaCf<unknown> | null;
    if (!res.ok || !json?.success) {
      throw new ErroCloudflare(json?.errors?.map((e) => `${e.message} (${e.code})`).join("; ") || `HTTP ${res.status}`);
    }
  }
}

export type Binding =
  | { type: "d1"; name: string; id: string }
  | { type: "plain_text"; name: string; text: string }
  | { type: "secret_text"; name: string; text: string };
