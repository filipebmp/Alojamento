import { html } from "hono/html";
import type { ResultadoInstalacao } from "./instalador";
import { pagina } from "./views";

// Chave de API com as permissões já escolhidas (o gestor só confirma). Se o Cloudflare mudar este
// formato, os passos manuais abaixo continuam válidos.
const PERMISSOES = [
  { key: "workers_scripts", type: "edit" },
  { key: "d1", type: "edit" },
  { key: "account_settings", type: "read" },
];
const LINK_CHAVE = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(JSON.stringify(PERMISSOES))}&name=bookgest&accountId=*`;

const passos = (n: number) => html`<p class="nota">Passo ${n} de 3</p>`;

export function paginaInstalar(chave: string, erro?: string) {
  return pagina("Instalar o bookgest", html`<h1>Instalar o bookgest</h1>
    ${passos(1)}
    <p>O bookgest fica instalado numa conta Cloudflare <strong>em seu nome</strong>, gratuita. Os dados dos seus hóspedes
      ficam lá e nós não temos acesso a eles.</p>
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <form method="post" action="/instalar">
      <label>Chave de licença <input name="chave" required value="${chave}" placeholder="BG-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters"></label>
      <button type="submit">Continuar</button>
    </form>`);
}

export function paginaInstalarCloudflare(chave: string, erro?: string) {
  return pagina("Instalar o bookgest", html`<h1>Ligar à sua conta Cloudflare</h1>
    ${passos(2)}
    ${erro ? html`<p class="erro">${erro}</p>` : ""}
    <section class="cartao">
      <h2>1. Criar a conta Cloudflare</h2>
      <p>Se ainda não tem: <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener">criar conta gratuita</a>
        (email e palavra-passe) e confirmar o email.</p>
    </section>
    <section class="cartao">
      <h2>2. Criar uma chave de API</h2>
      <p><a class="botao" href="${LINK_CHAVE}" target="_blank" rel="noopener">Criar a chave no Cloudflare</a></p>
      <p>Na página que abre: <em>Continue to summary</em> → <em>Create Token</em> → copiar a chave.</p>
      <details><summary>Se as permissões não aparecerem preenchidas</summary>
        <p><em>My Profile → API Tokens → Create Token → Create Custom Token</em>, com as permissões:</p>
        <ul><li>Account · Workers Scripts · Edit</li><li>Account · D1 · Edit</li><li>Account · Account Settings · Read</li></ul>
        <p>Em <em>Account Resources</em>, escolher a sua conta. Depois <em>Continue to summary → Create Token</em>.</p>
      </details>
      <p class="nota">A chave só dá acesso a estas partes da sua conta. Fica guardada na sua conta Cloudflare, para o
        bookgest se atualizar sozinho; nós usamo-la apenas durante a instalação e não a guardamos.</p>
    </section>
    <form method="post" action="/instalar/concluir" class="cartao" onsubmit="this.querySelector('button').disabled = true; this.querySelector('button').textContent = 'A instalar… (até 1 minuto)'">
      <h2>3. Colar a chave</h2>
      <input type="hidden" name="chave" value="${chave}">
      <label>Chave de API do Cloudflare <input name="token" required autocomplete="off" spellcheck="false"></label>
      <button type="submit">Instalar</button>
    </form>`);
}

export function paginaInstalado(r: ResultadoInstalacao) {
  const link = r.tokenConfiguracao ? `${r.url}/configurar?t=${r.tokenConfiguracao}` : `${r.url}/login`;
  return pagina("bookgest instalado", html`<h1>✅ bookgest instalado</h1>
    ${passos(3)}
    <p>O endereço do seu bookgest é:</p>
    <p class="chave">${r.url}</p>
    <p><strong>Guarde-o</strong> (nos favoritos ou no ecrã principal do telemóvel).</p>
    ${r.reinstalacao
      ? html`<p>Já tinha dados nesta conta: foram mantidos. Entre com o seu email e palavra-passe.</p>`
      : html`<p>Falta criar a sua conta de gestor. Este link só funciona uma vez:</p>`}
    <p><a class="botao grande" href="${link}">${r.reinstalacao ? "Entrar" : "Criar a minha conta"}</a></p>
    <p class="nota">Se o endereço ainda não abrir, espere um ou dois minutos: o Cloudflare está a ativá-lo.</p>`);
}
