// Envio de emails pelo Resend (https://resend.com), a partir do domínio bookgest.pt.

export interface ConfigEmail {
  apiKey: string;
  remetente: string; // ex.: "bookgest <nao-responder@bookgest.pt>"
  url?: string; // só para testes locais
}

export async function enviarEmail(cfg: ConfigEmail, m: { para: string; assunto: string; texto: string; html: string }): Promise<void> {
  const res = await fetch(cfg.url ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.remetente, to: [m.para], subject: m.assunto, text: m.texto, html: m.html }),
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
