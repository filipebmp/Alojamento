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
    </form>`, { estreito: true });
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
    </form>`, { estreito: true });
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
    <p class="nota">Se o endereço ainda não abrir, espere um ou dois minutos: o Cloudflare está a ativá-lo.</p>`, { estreito: true });
}

// ---------- Modo "Simples" (alojado pelo bookgest) ----------

const campoEndereco = (slug: string, sufixo: string) => html`
  <label>Nome do endereço <input name="slug" required value="${slug}" pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"
    placeholder="casa-da-praia" autocapitalize="none" spellcheck="false"></label>
  <p class="nota">Letras minúsculas, números e hífens. O seu bookgest fica em <strong>${sufixo}</strong>.</p>`;

export function paginaRegistar(opcoes: { erro?: string; enviado?: boolean; nome?: string; email?: string; slug?: string; sufixo: string }) {
  if (opcoes.enviado) {
    return pagina("Confirme o seu email", html`<h1>Confirme o seu email</h1>
      <p>Enviámos um link para <strong>${opcoes.email}</strong>. Abra-o para criar o seu bookgest.</p>
      <p class="nota">Não chegou? Veja a pasta de spam. O link é válido durante 48 horas.</p>`, { estreito: true });
  }
  return pagina("Experimentar o bookgest", html`<h1>Experimentar 30 dias grátis</h1>
    <p>Sem cartão. No fim, decide se quer continuar.</p>
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <form method="post" action="/registar">
      <label>Nome <input name="nome" value="${opcoes.nome ?? ""}" autocomplete="name"></label>
      <label>Email <input type="email" name="email" required value="${opcoes.email ?? ""}" autocomplete="email"></label>
      ${campoEndereco(opcoes.slug ?? "", opcoes.sufixo)}
      <label class="opcao"><input type="checkbox" name="termos" value="1" required>
        Aceito os <a href="/termos" target="_blank">termos de utilização e de tratamento de dados</a></label>
      <button type="submit">Criar o meu bookgest</button>
    </form>
    <p class="nota">Prefere que os dados fiquem numa conta Cloudflare sua? Depois de subscrever pode usar o
      <a href="/instalar">instalador</a>.</p>`, { estreito: true });
}

export function paginaCriar(chave: string, opcoes: { erro?: string; slug?: string; sufixo: string }) {
  return pagina("Criar o seu bookgest", html`<h1>Criar o seu bookgest</h1>
    <p>Alojado pelo bookgest: fica pronto em menos de um minuto.</p>
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    <form method="post" action="/criar" onsubmit="this.querySelector('button').disabled = true; this.querySelector('button').textContent = 'A criar…'">
      <input type="hidden" name="chave" value="${chave}">
      ${campoEndereco(opcoes.slug ?? "", opcoes.sufixo)}
      <button type="submit">Criar</button>
    </form>
    <p class="nota">Ou <a href="/instalar?chave=${encodeURIComponent(chave)}">instalar numa conta Cloudflare sua</a>.</p>`, { estreito: true });
}

export function paginaAssinar(chave: string, opcoes: { precoCents: number | null; alojamentos: number; erro?: string; ativa?: boolean }) {
  const preco = opcoes.precoCents != null ? (opcoes.precoCents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" }) : null;
  return pagina("Subscrever", html`<h1>Continuar a usar o bookgest</h1>
    ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
    ${opcoes.ativa
      ? html`<p>✅ Esta licença já tem uma assinatura ativa.</p>`
      : html`${preco ? html`<p><strong>${preco}</strong> por alojamento, por mês (IVA incluído). Sem fidelização.</p>` : ""}
        <form method="post" action="/assinar" class="linha">
          <input type="hidden" name="chave" value="${chave}">
          <label>Alojamentos <input type="number" name="alojamentos" min="1" max="50" value="${opcoes.alojamentos}" required></label>
          <button type="submit">Subscrever</button>
        </form>
        <p class="nota">A sua instalação e os seus dados mantêm-se: só muda a licença.</p>`}`, { estreito: true });
}

export function paginaTermos(contacto: string | null) {
  return pagina("Termos", html`<h1>Termos de utilização e tratamento de dados</h1>
    <p class="aviso">Versão provisória, em revisão jurídica.</p>
    <h2>Quem somos</h2>
    <p>O bookgest é um serviço de gestão de Alojamento Local${contacto ? html` (contacto: <a href="mailto:${contacto}">${contacto}</a>)` : ""}.</p>
    <h2>Os dados dos seus hóspedes</h2>
    <p>O gestor é o responsável pelo tratamento dos dados dos seus hóspedes. No modo alojado, o bookgest trata-os
      apenas por conta do gestor, como subcontratante (art. 28.º do RGPD): numa base de dados separada para cada
      cliente, sem os consultar, ceder ou usar para outros fins, e apaga-os quando o gestor deixar o serviço e o pedir.
      No modo privado (conta Cloudflare do gestor), o bookgest não tem acesso a eles.</p>
    <p>A infraestrutura é da Cloudflare (subcontratante ulterior), com dados guardados na União Europeia ou ao abrigo
      das cláusulas contratuais-tipo.</p>
    <h2>Os seus dados de cliente</h2>
    <p>Nome, email, dados de faturação e número de alojamentos, para gerir a licença, faturar e dar apoio.</p>`, { estreito: true });
}

export function paginaEntrar(opcoes: { enviado?: boolean; erro?: string; erroEndereco?: string; endereco?: string; dominio?: string } = {}) {
  if (opcoes.enviado) {
    return pagina("Entrar", html`<h1>Entrar no seu bookgest</h1>
      <p>✅ Se o email estiver associado a um bookgest, enviámos-lhe o link para entrar.</p>
      <p class="nota">Não chegou? Veja a pasta de spam.</p>`, { estreito: true, naEntrada: true });
  }
  return pagina("Entrar", html`<h1>Entrar no seu bookgest</h1>
    ${opcoes.erroEndereco ? html`<p class="erro">${opcoes.erroEndereco}</p>` : ""}
    <form method="post" action="/entrar/ir">
      <label>O endereço do seu bookgest
        <span class="endereco"><input name="endereco" required value="${opcoes.endereco ?? ""}" placeholder="casa-da-praia"
          autocapitalize="none" spellcheck="false" autocomplete="off" ${opcoes.endereco ? "" : "autofocus"}>${opcoes.dominio ? html`<span>.${opcoes.dominio}</span>` : ""}</span></label>
      <button type="submit">Entrar</button>
    </form>
    <details class="cartao" ${opcoes.erro ? "open" : ""}>
      <summary>Não sabe o seu endereço?</summary>
      <p>Indique o email com que se registou e enviamos-lhe o link.</p>
      ${opcoes.erro ? html`<p class="erro">${opcoes.erro}</p>` : ""}
      <form method="post" action="/entrar">
        <label>Email <input type="email" name="email" required autocomplete="email"></label>
        <button type="submit">Enviar o link</button>
      </form>
    </details>`, { estreito: true, naEntrada: true });
}
