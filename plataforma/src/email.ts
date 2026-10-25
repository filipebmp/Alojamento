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
