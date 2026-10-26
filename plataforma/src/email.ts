// Envio de emails pelo Resend (https://resend.com), a partir do domínio bookgest.pt.

export interface ConfigEmail {
  apiKey: string;
  remetente: string; // ex.: "bookgest <nao-responder@bookgest.pt>"
  url?: string; // só para testes locais
}

export async function enviarEmail(
  cfg: ConfigEmail,
  m: { para: string; assunto: string; texto: string; html: string; responderPara?: string | null },
): Promise<void> {
  const res = await fetch(cfg.url ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.remetente,
      to: [m.para],
      subject: m.assunto,
      text: m.texto,
      html: m.html,
      ...(m.responderPara ? { reply_to: m.responderPara } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function emailRecuperacao(link: string) {
  const texto =
    "Recebemos um pedido para redefinir a sua palavra-passe do bookgest.\n\n" +
    `Abra este link no mesmo browser onde fez o pedido (válido durante 1 hora, só uma vez):\n${link}\n\n` +
    "Se não foi você, ignore este email: a sua palavra-passe não muda.";
  const html = `<p>Recebemos um pedido para redefinir a sua palavra-passe do bookgest.</p>
<p><a href="${escapar(link)}" style="display:inline-block;padding:10px 16px;background:#0f5c4d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Definir nova palavra-passe</a></p>
<p>Abra o link <strong>no mesmo browser onde fez o pedido</strong>. É válido durante 1 hora e só uma vez.</p>
<p style="color:#5d6964">Se não foi você, ignore este email: a sua palavra-passe não muda.</p>`;
  return { assunto: "Recuperar a palavra-passe do bookgest", texto, html };
}

export async function hashEmail(email: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Licença de cortesia (piloto): a chave e os próximos passos. Respostas vão para o contacto do site.
export function emailLicencaCortesia(d: { chave: string; nome: string | null; alojamentos: number; linkCriar: string; linkInstalar: string }) {
  const ola = d.nome ? `Olá ${d.nome},` : "Olá,";
  const texto =
    `${ola}\n\nOfereceram-lhe uma licença do bookgest para ${d.alojamentos} alojamento(s), sem custos.\n\n` +
    `A sua chave de licença: ${d.chave}\n\n` +
    `Para começar já (alojado pelo bookgest, 1 minuto):\n${d.linkCriar}\n\n` +
    `Ou, se preferir que os dados fiquem numa conta Cloudflare sua (cerca de 10 minutos):\n${d.linkInstalar}\n\n` +
    "Responda a este email se tiver alguma dúvida.";
  const html = `<p>${escapar(ola)}</p>
<p>Ofereceram-lhe uma licença do <strong>bookgest</strong> para ${d.alojamentos} alojamento(s), sem custos.</p>
<p>A sua chave de licença:</p>
<p style="font:600 20px ui-monospace,monospace;letter-spacing:.05em;padding:12px;border:2px dashed #0f5c4d;border-radius:8px;text-align:center">${escapar(d.chave)}</p>
${botao(d.linkCriar, "Começar já")}
<p style="color:#5d6964">Alojado pelo bookgest: fica pronto num minuto.</p>
<p>Prefere que os dados dos seus hóspedes fiquem numa conta Cloudflare em seu nome (gratuita, cerca de 10 minutos)?
<a href="${escapar(d.linkInstalar)}">Instalar na minha conta Cloudflare</a>.</p>
<p style="color:#5d6964">Responda a este email se tiver alguma dúvida.</p>`;
  return { assunto: "A sua licença do bookgest", texto, html };
}

const botao = (link: string, texto: string) =>
  `<p><a href="${escapar(link)}" style="display:inline-block;padding:10px 16px;background:#0f5c4d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapar(texto)}</a></p>`;

export function emailConfirmarRegisto(link: string) {
  return {
    assunto: "Confirme o seu email para começar a usar o bookgest",
    texto: `Para criar o seu bookgest (30 dias grátis), confirme o seu email:\n${link}\n\nSe não foi você, ignore este email.`,
    html: `<p>Para criar o seu bookgest (30 dias grátis), confirme o seu email:</p>${botao(link, "Confirmar e criar o meu bookgest")}
<p style="color:#5d6964">Se não foi você, ignore este email.</p>`,
  };
}

export function emailInstalacaoPronta(d: { url: string; linkConta: string | null }) {
  const passo = d.linkConta
    ? `Falta criar a sua conta de gestor (este link só funciona uma vez):\n${d.linkConta}\n\n`
    : "";
  return {
    assunto: "O seu bookgest está pronto",
    texto: `O endereço do seu bookgest é:\n${d.url}\n\nGuarde-o nos favoritos ou no ecrã principal do telemóvel.\n\n${passo}`,
    html: `<p>O endereço do seu bookgest é:</p><p><strong>${escapar(d.url)}</strong></p>
<p>Guarde-o nos favoritos ou no ecrã principal do telemóvel.</p>
${d.linkConta ? `<p>Falta criar a sua conta de gestor (este link só funciona uma vez):</p>${botao(d.linkConta, "Criar a minha conta")}` : ""}`,
  };
}

export function emailEnderecos(urls: string[]) {
  return {
    assunto: "O endereço do seu bookgest",
    texto: `Para entrar no seu bookgest:\n${urls.map((u) => `${u}/login`).join("\n")}\n\nGuarde o endereço nos favoritos ou no ecrã principal do telemóvel.`,
    html: `<p>Para entrar no seu bookgest:</p>${urls.map((u) => botao(`${u}/login`, u.replace(/^https:\/\//, ""))).join("")}
<p style="color:#5d6964">Guarde o endereço nos favoritos ou no ecrã principal do telemóvel.</p>`,
  };
}

// Aviso diário ao gestor: tarefas com prazo a terminar (só tipos e quantidades, sem dados de hóspedes).
const TEXTOS_AVISO: Record<string, [string, string]> = {
  formulario: ["formulário de check-in por preencher (lembre o hóspede: os dados são precisos para o SIBA)", "formulários de check-in por preencher (lembre os hóspedes: os dados são precisos para o SIBA)"],
  dados_hospedes: ["reserva com dados de hóspedes em falta", "reservas com dados de hóspedes em falta"],
  completar: ["reserva importada por completar (nome e n.º de hóspedes)", "reservas importadas por completar (nome e n.º de hóspedes)"],
  siba: ["comunicação ao SIBA", "comunicações ao SIBA"],
  fatura: ["fatura-recibo por emitir", "faturas-recibo por emitir"],
  tmt_declarar: ["declaração da taxa turística", "declarações da taxa turística"],
  tmt_pagar: ["pagamento da taxa turística", "pagamentos da taxa turística"],
  ine: ["resposta ao inquérito do INE", "respostas ao inquérito do INE"],
};

const PRAZOS_AVISO: [string, string][] = [["atrasado", "Atrasado"], ["hoje", "Termina hoje"], ["amanha", "Termina amanhã"]];

export function emailAvisos(itens: { tipo: string; prazo: string; quantidade: number; alojamento: string | null }[], painel: string) {
  const linha = (i: (typeof itens)[number]) =>
    `${i.quantidade} ${TEXTOS_AVISO[i.tipo]?.[i.quantidade === 1 ? 0 : 1] ?? i.tipo}${i.alojamento ? ` — ${i.alojamento}` : ""}`;
  const grupos = PRAZOS_AVISO.map(([p, titulo]) => ({ titulo, linhas: itens.filter((i) => i.prazo === p).map(linha) })).filter((g) => g.linhas.length);
  const total = itens.reduce((s, i) => s + i.quantidade, 0);
  const texto =
    `Bom dia! Tem ${total} ${total === 1 ? "tarefa" : "tarefas"} com prazo a terminar no bookgest:\n\n` +
    grupos.map((g) => `${g.titulo}:\n${g.linhas.map((l) => `- ${l}`).join("\n")}`).join("\n\n") +
    `\n\nAbrir o bookgest: ${painel}\n\nPode desligar este aviso em A minha conta.`;
  const html = `<p>Bom dia! Tem <strong>${total} ${total === 1 ? "tarefa" : "tarefas"}</strong> com prazo a terminar no bookgest:</p>
${grupos.map((g) => `<p style="margin:16px 0 4px;font-weight:600">${escapar(g.titulo)}</p><ul style="margin:0;padding-left:20px">${g.linhas.map((l) => `<li>${escapar(l)}</li>`).join("")}</ul>`).join("")}
<p style="margin-top:20px"><a href="${escapar(painel)}" style="display:inline-block;padding:10px 16px;background:#0f5c4d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Abrir o bookgest</a></p>
<p style="color:#5d6964">Pode desligar este aviso em A minha conta.</p>`;
  const assunto = itens.some((i) => i.prazo === "atrasado")
    ? `bookgest: ${total} ${total === 1 ? "tarefa" : "tarefas"} com prazo — há atrasos`
    : `bookgest: ${total} ${total === 1 ? "tarefa" : "tarefas"} com prazo a terminar`;
  return { assunto, texto, html };
}

// Só a instalação registada na licença, ou um endereço *.bookgest.pt; senão, a página de entrada do site.
export function linkPainel(pedido: string | null, instalacao: string | null, site: string | undefined): string {
  const anfitriao = (u: string | null) => {
    try {
      return u ? new URL(u) : null;
    } catch {
      return null;
    }
  };
  const p = anfitriao(pedido);
  const i = anfitriao(instalacao);
  if (p && p.protocol === "https:" && (p.hostname === i?.hostname || p.hostname === "bookgest.pt" || p.hostname.endsWith(".bookgest.pt"))) {
    return `${p.origin}/admin`;
  }
  if (i && i.protocol === "https:") return `${i.origin}/admin`;
  return `${(site ?? "https://bookgest.pt").replace(/\/$/, "")}/entrar`;
}
