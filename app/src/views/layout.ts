import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Conteudo = HtmlEscapedString | Promise<HtmlEscapedString>;

// admin: true = menu do gestor; "equipa" = menu reduzido da equipa.
export function pagina(titulo: string, corpo: Conteudo, opcoes: { admin?: boolean | "equipa" } = {}) {
  return html`<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0f5c4d">
  <title>${titulo}</title>
  ${opcoes.admin ? html`<link rel="manifest" href="/manifest.webmanifest">` : ""}
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/estilo.css">
</head>
<body>
  ${opcoes.admin
    ? html`<header><a href="/admin" class="marca">🏠 bookgest</a>
        <nav><a href="/admin/reservas/nova">+ Reserva</a>${opcoes.admin === "equipa"
          ? html`<a href="/admin/conta">Conta</a>`
          : html`<a href="/admin/tmt">Taxa turística</a><a href="/admin/alojamentos">Alojamentos</a><a href="/admin/definicoes">Definições</a>`}</nav></header>`
    : ""}
  <main>${corpo}</main>
  ${opcoes.admin ? html`<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")</script>` : ""}
</body>
</html>`;
}

export function dataPt(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
