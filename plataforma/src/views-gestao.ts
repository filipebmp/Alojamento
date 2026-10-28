// Páginas extra da gestão: notícias do Alojamento Local e plano de Instagram.
import { html, raw } from "hono/html";
import { PERFIL, PUBLICACOES, svgDiapositivo, svgPerfil } from "./instagram";
import { type NoticiaGuardada, TEMAS, concelhosNaNoticia, eImportante } from "./noticias";
import { pagina } from "./views";

const NOMES_TEMA = new Map(TEMAS.map((t) => [t.id, t]));
const euros = (cents: number) => (cents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

// Data de Lisboa (AAAA-MM-DD) de um instante ISO.
const diaLisboa = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });

function nomeDia(dia: string, hoje: string) {
  const ontem = diaLisboa(new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function paginaNoticias(o: {
  noticias: NoticiaGuardada[];
  agora: Date;
  atualizadaEm: string | null;
  todas: boolean;
  mensagem?: string;
}) {
  const hoje = diaLisboa(o.agora.toISOString());
  const lista = o.todas ? o.noticias : o.noticias.filter((n) => eImportante(n.temas.split(",")));
  const deHoje = o.noticias.filter((n) => diaLisboa(n.publicada_em) === hoje);
  const importantesHoje = deHoje.filter((n) => eImportante(n.temas.split(",")));
  const porDia = new Map<string, NoticiaGuardada[]>();
  for (const n of lista) {
    const d = diaLisboa(n.publicada_em);
    porDia.set(d, [...(porDia.get(d) ?? []), n]);
  }
  const atualizada = o.atualizadaEm
    ? new Date(o.atualizadaEm).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nunca";

  return pagina("Notícias", html`<h1>Notícias do AL</h1>
    <p class="nota">Notícias dos últimos dias sobre Alojamento Local, taxa turística, SIBA, impostos e plataformas (Google Notícias).
      Atualizadas de 3 em 3 horas · última vez: ${atualizada}.</p>
    ${o.mensagem ? html`<p>✅ ${o.mensagem}</p>` : ""}
    <div class="cartao resumo-noticias">
      <p><strong>Hoje:</strong> ${deHoje.length} ${deHoje.length === 1 ? "notícia" : "notícias"},
        ${importantesHoje.length} ${importantesHoje.length === 1 ? "importante" : "importantes"} (legislação, registo, taxa, SIBA ou impostos).</p>
      <div class="botoes-linha">
        <a class="botao ${o.todas ? "secundario" : ""} pequeno" href="/gestao/noticias">Só importantes</a>
        <a class="botao ${o.todas ? "" : "secundario"} pequeno" href="/gestao/noticias?todas=1">Todas</a>
        <form method="post" action="/gestao/noticias/atualizar"><button class="secundario pequeno">Procurar agora</button></form>
      </div>
    </div>
    ${porDia.size
      ? [...porDia].map(([dia, ns]) => html`<h2 class="dia-noticias">${nomeDia(dia, hoje)}</h2>
          <div class="noticias">${ns.map((n) => noticia(n))}</div>`)
      : html`<p class="nota">${o.todas ? "Ainda não há notícias. Carregue em Procurar agora." : "Sem notícias importantes nos últimos dias."}</p>`}
    <p class="nota">A coluna "No bookgest" indica o que pode precisar de ser revisto na app. Nas notícias de taxa turística, o bookgest
      compara os concelhos mencionados com a sua tabela de taxas.</p>
  `, { gestao: true });
}

function noticia(n: NoticiaGuardada) {
  const temas = n.temas.split(",").filter(Boolean).map((id) => NOMES_TEMA.get(id)!).filter(Boolean);
  const noBookgest = [...new Set(temas.map((t) => t.noBookgest).filter((x): x is string => !!x))];
  const concelhos = n.temas.includes("taxa") ? concelhosNaNoticia(n.titulo) : [];
  return html`<article class="noticia ${n.vista ? "" : "nova"}">
    <div class="etiquetas">${n.vista ? "" : html`<span class="etiqueta nova">Nova</span>`}${temas.map((t) => html`<span class="etiqueta ${t.importante ? "imp" : ""}">${t.nome}</span>`)}</div>
    <a href="${n.link}" target="_blank" rel="noopener noreferrer"><strong>${n.titulo}</strong></a>
    <small>${n.fonte}${n.fonte ? " · " : ""}${new Date(n.publicada_em).toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" })}</small>
    ${noBookgest.length ? html`<p class="no-bookgest">No bookgest: ${noBookgest.join(" · ")}</p>` : ""}
    ${concelhos.map((c) => html`<p class="no-bookgest ${c.valorCents == null ? "falta" : ""}">${c.valorCents == null
      ? html`⚠️ ${c.nome}: sem taxa na tabela do bookgest. Confirme e acrescente.`
      : html`✓ ${c.nome}: na tabela do bookgest (${euros(c.valorCents)} por noite). Confirme se o valor mudou.`}</p>`)}
  </article>`;
}

// ---------- Instagram ----------

const dataSvg = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function paginaInstagram() {
  const bio = PERFIL.bio;
  return pagina("Instagram", html`<h1>Instagram</h1>
    <p class="nota">Plano para lançar a página do bookgest no Instagram: o perfil e 12 publicações para as primeiras 4 semanas.
      No telemóvel, toque em <strong>Guardar imagem</strong> em cada diapositivo e em <strong>Copiar legenda</strong>, e publique pela ordem.</p>

    <section class="cartao">
      <h2>1. O perfil</h2>
      <dl class="config">
        <dt>Nome de utilizador</dt><dd><code>@${PERFIL.utilizador}</code><br><small>Se estiver ocupado: ${PERFIL.alternativas.map((a) => `@${a}`).join(", ")}</small></dd>
        <dt>Nome</dt><dd>${PERFIL.nome} <button class="pequeno secundario" data-copiar="${PERFIL.nome}">Copiar</button></dd>
        <dt>Categoria</dt><dd>${PERFIL.categoria}<br><small>Mude para conta profissional (Empresa): dá estatísticas e o botão de contacto.</small></dd>
        <dt>Biografia</dt><dd><span class="bio">${bio}</span><br><small>${[...bio].length} de 150 caracteres</small>
          <button class="pequeno secundario" data-copiar="${bio}">Copiar</button></dd>
        <dt>Link</dt><dd>${PERFIL.link}</dd>
        <dt>Fotografia</dt><dd><img class="perfil-ig" src="${dataSvg(svgPerfil())}" alt="Fotografia de perfil" data-nome="bookgest-perfil">
          <br><button class="pequeno" data-guardar>Guardar imagem</button></dd>
      </dl>
      <h3>Destaques (stories fixas no perfil)</h3>
      <ul>${PERFIL.destaques.map(([nome, conteudo]) => html`<li><strong>${nome}</strong>: ${conteudo}</li>`)}</ul>
      <h3>Rotina</h3>
      <ul>${PERFIL.rotina.map((r) => html`<li>${r}</li>`)}</ul>
    </section>

    <h2>2. As publicações</h2>
    ${PUBLICACOES.map((p, i) => html`<section class="cartao publicacao">
      <p class="sobre-pub"><span class="etiqueta">${i + 1}</span>${p.quando} · ${p.formato} · ${p.tema}</p>
      <div class="diapositivos">${p.diapositivos.map((d, k) => html`<figure>
        <img src="${dataSvg(svgDiapositivo(d, k + 1, p.diapositivos.length))}" alt="${d.titulo}" loading="lazy"
          data-nome="bookgest-${String(i + 1).padStart(2, "0")}-${k + 1}">
        <button class="pequeno" data-guardar>Guardar imagem${p.diapositivos.length > 1 ? ` ${k + 1}` : ""}</button>
      </figure>`)}</div>
      <details><summary>Legenda</summary><p class="legenda-ig">${p.legenda}\n\n${p.hashtags}</p></details>
      <button class="pequeno secundario" data-copiar="${p.legenda}\n\n${p.hashtags}">Copiar legenda</button>
    </section>`)}

    <script>${raw(SCRIPT_INSTAGRAM)}</script>
  `, { gestao: true });
}

// Converte o SVG em PNG (1080×1350 nas publicações, 1080×1080 na fotografia de perfil) e partilha (iPhone: "Guardar imagem") ou descarrega; copia textos.
const SCRIPT_INSTAGRAM = `
document.addEventListener("click", async (e) => {
  const copiar = e.target.closest("[data-copiar]");
  if (copiar) {
    await navigator.clipboard.writeText(copiar.dataset.copiar);
    const t = copiar.textContent; copiar.textContent = "Copiado ✓"; setTimeout(() => (copiar.textContent = t), 1500);
    return;
  }
  const guardar = e.target.closest("[data-guardar]");
  if (!guardar) return;
  const img = guardar.parentElement.querySelector("img");
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 1080;
  canvas.height = img.naturalHeight || 1080;
  const fonte = new Image();
  fonte.src = img.src;
  await fonte.decode();
  canvas.getContext("2d").drawImage(fonte, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const ficheiro = new File([blob], img.dataset.nome + ".png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [ficheiro] })) {
    try { await navigator.share({ files: [ficheiro] }); } catch {}
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ficheiro.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});`;
