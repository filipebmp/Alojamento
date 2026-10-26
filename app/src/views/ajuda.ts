// Ajuda: perguntas frequentes sobre todas as funcionalidades do painel.

import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Papel } from "../lib/utilizadores";
import { type NomeIcone, icone, pagina } from "./layout";

type Resposta = HtmlEscapedString | Promise<HtmlEscapedString>;

interface Seccao {
  id: string;
  titulo: string;
  icone: NomeIcone;
  soGestor?: boolean;
  perguntas: [string, Resposta][];
}

const SECCOES: Seccao[] = [
  {
    id: "comecar",
    titulo: "Primeiros passos",
    icone: "hoje",
    perguntas: [
      ["Por onde começo?", html`<ol>
        <li>Em <a href="/admin/alojamentos">Alojamentos</a>, confirme os dados do alojamento: concelho (a taxa turística preenche-se sozinha), código do cofre, hora de check-in e regime de IVA.</li>
        <li>Em <strong>Instruções de chegada</strong> (dentro do alojamento), acrescente os passos com fotos para o hóspede chegar e abrir o cofre.</li>
        <li>Ligue os calendários do Booking e do Airbnb (secção <strong>Importar reservas</strong> do alojamento) e, se quiser, os <a href="/admin/emails">emails de reserva</a>.</li>
        <li>Em cada reserva, envie o link de check-in ao hóspede. O resto o bookgest vai lembrando no ecrã <strong>Hoje</strong>.</li></ol>`],
      ["Como ponho o bookgest no ecrã principal do telemóvel?", html`<p>Abra o painel no navegador e escolha <strong>Partilhar → Adicionar ao ecrã principal</strong> (iPhone, Safari)
        ou <strong>⋮ → Instalar aplicação / Adicionar ao ecrã principal</strong> (Android, Chrome). Passa a abrir como uma app, sem barra do navegador.</p>`],
      ["O que é o ecrã Hoje?", html`<p>É o resumo do dia: entradas e saídas de hoje, ocupação e receita do mês, e a lista <strong>A tratar</strong>,
        com tudo o que tem prazo (formulários por preencher, SIBA, faturas, taxa turística, INE). As etiquetas dizem o prazo:
        <strong>Atrasado</strong> (vermelho), <strong>Hoje</strong> (laranja) ou a data limite. Com vários alojamentos, pode filtrar por alojamento no topo.</p>`],
    ],
  },
  {
    id: "reservas",
    titulo: "Reservas e calendário",
    icone: "reservas",
    perguntas: [
      ["Como crio uma reserva?", html`<p>No botão <strong>+</strong> (ou <strong>Nova reserva</strong>), escolha a plataforma (Booking, Airbnb, Direta ou Outra), o nome do titular,
        as datas e o n.º de hóspedes. O valor pago e a comissão podem ser preenchidos depois, em <strong>Valores</strong>, dentro da reserva.</p>`],
      ["O que mostra o Calendário?", html`<p>Uma linha por alojamento com as reservas em barras com a cor da plataforma (azul Booking, rosa Airbnb, verde direta).
        As barras às riscas são reservas importadas que ainda não têm nome nem n.º de hóspedes. Toque numa barra para abrir a reserva.
        No computador pode ver 2 ou 4 semanas.</p>`],
      ["O que é o Progresso de uma reserva?", html`<p>Os passos obrigatórios de cada estadia: <strong>dados dos hóspedes → SIBA → fatura-recibo → taxa turística</strong>.
        Cada passo fica com um visto quando está feito e mostra o prazo quando falta. O atalho à direita leva à secção certa.</p>`],
      ["Marquei uma coisa por engano. Como volto atrás?", html`<p>Ao lado de cada "✅" (comunicado ao SIBA, fatura emitida, taxa declarada ou paga, INE respondido) há um <strong>Anular</strong>.
        São marcações só do bookgest: anular não envia nada a ninguém. A exceção é uma fatura emitida num programa de faturação: essa continua
        emitida no programa e anula-se lá (nota de crédito).</p>`],
      ["Como cancelo uma reserva?", html`<p>Na reserva, em <strong>Valores</strong>, carregue em <strong>Cancelar reserva</strong>. Fica na lista de canceladas e deixa de contar na taxa turística e no INE.</p>`],
    ],
  },
  {
    id: "checkin",
    titulo: "Check-in online e código das chaves",
    icone: "chave",
    perguntas: [
      ["Como funciona o check-in online?", html`<p>Cada reserva tem um <strong>link de check-in</strong>. Envie-o por WhatsApp (botão na reserva) ou copie-o.
        O hóspede preenche no telemóvel, em português ou inglês, os seus dados, os dados da fatura e o nome e data de nascimento dos acompanhantes.
        Os documentos dos acompanhantes podem ser preenchidos até 48 horas depois do check-in.</p>`],
      ["Quando é que o hóspede vê o código do cofre?", html`<p>Só depois de preencher o formulário e a partir do número de horas antes do check-in definido no alojamento
        (por omissão, 24 horas). Junto com o código aparecem as <strong>instruções de chegada</strong> com fotos.</p>`],
      ["O que acontece se o hóspede não preencher?", html`<p>O ecrã Hoje mostra "formulário de check-in por preencher" com o prazo, para poder lembrar o hóspede a tempo.</p>`],
    ],
  },
  {
    id: "emails",
    titulo: "Emails de reserva (Booking e Airbnb)",
    icone: "emails",
    soGestor: true,
    perguntas: [
      ["Para que servem?", html`<p>Os calendários (iCal) do Booking e do Airbnb só trazem as datas. Os <strong>emails de confirmação</strong> trazem o resto:
        nome do hóspede, n.º de hóspedes, valores e n.º da reserva. Reencaminhando-os para o seu endereço do bookgest
        (em <a href="/admin/emails">Emails de reserva</a>), as reservas ficam completas sem escrever nada.</p>`],
      ["Como funciona, passo a passo?", html`<ol>
        <li>Tem um endereço próprio, do tipo <code>reservas-xxxx@bookgest.pt</code>. Não é uma caixa de correio: é uma morada de entrega.</li>
        <li>Quando chega um email, o bookgest lê só os dados da reserva e <strong>não guarda o email</strong>. Os dados ficam à espera, uns dias, que a sua instalação os vá buscar.</li>
        <li>A sua instalação vai buscá-los <strong>de hora a hora</strong>:
          <ul>
            <li>se a reserva já existe (por exemplo, veio do calendário só com as datas), é completada com o nome, os hóspedes e os valores — o que escreveu à mão nunca é substituído;</li>
            <li>se não existe, é criada, quando dá para perceber o alojamento (só tem um, ou o nome do alojamento aparece no email);</li>
            <li>se não dá para perceber, fica <strong>por associar</strong> na página Emails de reserva e escolhe o alojamento com um clique;</li>
            <li>um email de cancelamento marca a reserva para confirmar o cancelamento.</li>
          </ul></li></ol>`],
      ["O que faz o botão “Verificar emails agora”?", html`<p>Vai buscar já os emails que chegaram, em vez de esperar pela recolha automática da hora seguinte.
        Útil para testar e para ver o código de confirmação do Gmail.</p>`],
      ["Como configuro no Booking?", html`<p>O Booking deixa enviar os emails de reserva para vários endereços. Na <strong>Extranet → Propriedade → Detalhes de contacto</strong>,
        acrescente o seu endereço do bookgest aos contactos que recebem as reservas. Pronto: os emails passam a chegar sozinhos.</p>`],
      ["Como configuro no Airbnb (com o Gmail)?", html`<p>O Airbnb só envia para o email da conta, por isso é o seu Gmail que reencaminha. Faz-se uma vez, <strong>no Gmail no computador</strong>
        (a app do telemóvel não tem esta opção):</p>
        <ol>
          <li>⚙️ <strong>Definições → Ver todas as definições → Encaminhamento e POP/IMAP → Adicionar um endereço de encaminhamento</strong> e cole o seu endereço do bookgest.</li>
          <li>O Gmail envia um <strong>email de confirmação</strong> para esse endereço. Em <a href="/admin/emails">Emails de reserva</a>, carregue em
            <strong>Verificar emails agora</strong>: aparece o código e o link de confirmação (também surge no ecrã Hoje).</li>
          <li>Abra o link, ou escreva o código no Gmail, para confirmar.</li>
          <li>Na pesquisa do Gmail escreva <code>from:automated@airbnb.com</code> → <strong>Criar filtro</strong> → marque <strong>Encaminhar para</strong>,
            escolha o endereço do bookgest → <strong>Criar filtro</strong>.</li>
        </ol>
        <p>⚠️ Não escolha "Encaminhar uma cópia do correio recebido" na página de encaminhamento: isso enviaria todos os seus emails. Só o filtro do Airbnb.</p>
        <p>No Outlook: <strong>Definições → Correio → Regras → Adicionar regra</strong>, com "De: automated@airbnb.com" e a ação "Reencaminhar para".</p>`],
      ["Como testo?", html`<ol>
        <li>Abra um email de reserva antigo do Booking ou do Airbnb e <strong>reencaminhe-o</strong> à mão para o seu endereço do bookgest (os reencaminhados também são reconhecidos).</li>
        <li>Espere um minuto e carregue em <strong>Verificar emails agora</strong>.</li>
        <li>O email aparece em "Recebidos" como <strong>associado</strong> (reserva completada ou criada) ou <strong>por associar</strong>.</li></ol>`],
      ["E a privacidade?", html`<p>Os emails não são guardados: só os dados da reserva, apagados da plataforma assim que a sua instalação os recebe (ou ao fim de uns dias).</p>`],
    ],
  },
  {
    id: "alojamentos",
    titulo: "Alojamentos",
    icone: "alojamentos",
    soGestor: true,
    perguntas: [
      ["O que configuro em cada alojamento?", html`<ul>
        <li><strong>Identificação:</strong> nome, morada e n.º de registo AL.</li>
        <li><strong>Chegada dos hóspedes:</strong> código do cofre, hora de check-in, quando mostrar o código e o prazo para os acompanhantes.</li>
        <li><strong>Concelho e taxa turística:</strong> escolha o concelho e os valores preenchem-se sozinhos (confirme no regulamento da câmara).</li>
        <li><strong>Capacidade e INE:</strong> modalidade, tipologia, camas e se responde ao inquérito do INE.</li>
        <li><strong>Faturação:</strong> regime de IVA.</li>
        <li><strong>Importar reservas:</strong> links dos calendários do Booking e do Airbnb.</li>
        <li><strong>SIBA:</strong> dados para o envio automático dos boletins.</li></ul>`],
      ["Onde encontro o link do calendário (iCal)?", html`<p><strong>Booking:</strong> Extranet → Tarifas e disponibilidade → Sincronizar calendários → Exportar calendário.
        <strong>Airbnb:</strong> Anúncio → Disponibilidade → Sincronização de calendários → Exportar calendário. Cole o link no alojamento; as reservas entram de hora a hora.</p>`],
      ["Arquivar ou apagar?", html`<p><strong>Arquivar</strong> esconde o alojamento das novas reservas e conserva tudo (as reservas e declarações têm de ser guardadas).
        <strong>Apagar</strong> só é possível em alojamentos sem reservas, por exemplo criados por engano ou para testar.</p>`],
      ["Porque não consigo acrescentar um alojamento?", html`<p>A licença inclui um número de alojamentos ativos. Para acrescentar, aumente-o em
        <a href="/admin/definicoes">Definições → Licença → Alterar o n.º de alojamentos</a>, ou arquive um alojamento.</p>`],
    ],
  },
  {
    id: "siba",
    titulo: "SIBA",
    icone: "escudo",
    soGestor: true,
    perguntas: [
      ["O que tenho de comunicar ao SIBA?", html`<p>Os hóspedes de nacionalidade estrangeira (incluindo da União Europeia), até 3 dias úteis depois da entrada.
        Os portugueses não se comunicam.</p>`],
      ["Como ligo o envio automático?", html`<ol>
        <li>Registe o alojamento no <a href="https://siba.ssi.gov.pt" target="_blank" rel="noopener">portal do SIBA</a> com o modo de envio <strong>webservice</strong>
          (se já está registado em modo manual, peça a mudança ao SIBA). O SIBA envia por ofício a <strong>chave de acesso</strong>.</li>
        <li>No alojamento, secção <strong>SIBA</strong>, preencha o NIF, o n.º do estabelecimento (o primeiro é 00), a chave e os contactos, e ative o envio.</li>
        <li>Comece no ambiente de <strong>Testes</strong>; quando o SIBA aceitar, mude para <strong>Produção</strong>.</li></ol>`],
      ["Quando é que os boletins são enviados?", html`<p>Assim que o check-in do hóspede fica completo. Chegadas futuras ficam agendadas e seguem no dia do check-in.
        Na reserva vê o estado: enviado, agendado ou o erro explicado pelo SIBA, com o botão <strong>Reenviar</strong>.</p>`],
      ["E sem envio automático?", html`<p>Comunique no portal do SIBA e carregue em <strong>Marcar como comunicado</strong> na reserva, para o passo ficar feito.</p>`],
    ],
  },
  {
    id: "faturacao",
    titulo: "Fatura-recibo",
    icone: "faturacao",
    soGestor: true,
    perguntas: [
      ["Até quando tenho de emitir a fatura?", html`<p>Até 5 dias úteis depois do check-out. O prazo aparece na reserva e no ecrã Hoje.</p>`],
      ["Como emito sem programa de faturação?", html`<p>Na reserva, em Fatura-recibo, carregue em <strong>Preparar no Portal das Finanças</strong>. Aparecem todos os campos pela ordem do
        formulário do Portal (Faturas e Recibos → Emitir), cada um com <strong>Copiar</strong>: cliente, descrição, preço sem IVA, taxa de IVA e a taxa turística em linha à parte.
        No fim, registe o n.º da fatura.</p>`],
      ["Como ligo o InvoiceXpress, Vendus ou TOConline?", html`<p>Em <a href="/admin/definicoes/faturacao">Faturação</a>, escolha o programa e cole as credenciais da API
        (o sítio onde as encontrar está indicado em cada programa). Use <strong>Testar a ligação</strong>. Depois, cada reserva tem o botão <strong>Emitir fatura</strong>.
        No InvoiceXpress pode criar em rascunho; no Vendus pode experimentar em modo de teste.</p>`],
      ["Que IVA é aplicado?", html`<p>O do regime do alojamento: 6% (continente), 5% (Madeira), 4% (Açores) ou isento pelo art. 53.º. A taxa turística não está sujeita a IVA.</p>`],
    ],
  },
  {
    id: "taxa",
    titulo: "Taxa turística",
    icone: "tmt",
    soGestor: true,
    perguntas: [
      ["Como é calculada?", html`<p>Por hóspede e noite, segundo as regras do concelho: valor (com época alta e baixa, quando existe), idade a partir da qual se paga
        e máximo de noites. As noites acima do limite ou fora da época contam como "não sujeitas" e os menores como "isentos", como as câmaras pedem.</p>`],
      ["Como declaro e pago?", html`<p>Em <a href="/admin/tmt">Taxas</a> tem o resumo de cada mês por alojamento. Declare no portal da câmara e carregue em
        <strong>Declarado</strong>; depois de pagar, em <strong>Pago</strong>. O passo da taxa nas reservas desse mês fica feito.</p>`],
      ["Os valores da minha câmara estão certos?", html`<p>São valores de referência dos regulamentos municipais e podem mudar. Confirme no site da câmara e ajuste no alojamento,
        incluindo os dias de declaração e de pagamento.</p>`],
    ],
  },
  {
    id: "ine",
    titulo: "INE (inquérito mensal)",
    icone: "ine",
    soGestor: true,
    perguntas: [
      ["Tenho de responder ao INE?", html`<p>O INE inquire os alojamentos com 10 ou mais camas (e, nas regiões autónomas, também alguns mais pequenos). Se recebeu o pedido do INE,
        ative "Respondo ao inquérito mensal do INE" no alojamento. A resposta é até dia 10 do mês seguinte, mesmo sem hóspedes.</p>`],
      ["O que prepara o bookgest?", html`<p>Em <a href="/admin/ine">INE</a>, para cada mês: hóspedes que entraram, hóspedes que dormiram e dormidas por país de residência
        (as estadias que atravessam meses são divididas), utilizações, dias de abertura e volume de negócios sem IVA e sem taxa turística. Transcreva para o WebInq,
        descarregue o CSV se quiser, e carregue em <strong>Marcar como respondido</strong>.</p>`],
    ],
  },
  {
    id: "equipa",
    titulo: "Utilizadores e equipa",
    icone: "utilizadores",
    perguntas: [
      ["Posso dar acesso a quem faz as limpezas ou recebe os hóspedes?", html`<p>Sim. Em <strong>Utilizadores</strong>, crie um utilizador com o papel <strong>Equipa</strong>.
        A equipa vê e cria reservas e envia o link de check-in, mas não vê documentos dos hóspedes, dados de faturação, valores, taxa turística nem configurações.</p>`],
      ["Esqueci-me da palavra-passe.", html`<p>No ecrã de entrada, <strong>Esqueci-me da palavra-passe</strong>: recebe um link por email.
        Os gestores podem também usar um dos <strong>códigos de recuperação</strong> (em A minha conta). Guarde-os num sítio seguro.</p>`],
    ],
  },
  {
    id: "licenca",
    titulo: "Licença e assinatura",
    icone: "definicoes",
    soGestor: true,
    perguntas: [
      ["Como mudo o número de alojamentos ou cancelo?", html`<p>Em <a href="/admin/definicoes">Definições → Licença → Alterar o n.º de alojamentos</a>: abre o portal de cliente
        do Stripe, onde também pode mudar o cartão ou cancelar. A alteração chega à sua instalação em poucos minutos (ou de imediato com <strong>Guardar e verificar</strong>).</p>`],
      ["E se deixar de pagar?", html`<p>Continua a poder consultar todos os dados, e os links de check-in já enviados continuam a funcionar.
        Passados 14 dias deixa de ser possível criar reservas novas.</p>`],
      ["Quem vê os dados dos meus hóspedes?", html`<p>No modo Simples, os dados estão numa base de dados só sua, tratada pelo bookgest apenas por sua conta.
        No modo Privado (conta Cloudflare sua), o bookgest não tem acesso. O bookgest atualiza-se sozinho.</p>`],
    ],
  },
];

export function paginaAjuda(papel: Papel) {
  const seccoes = SECCOES.filter((s) => papel === "gestor" || !s.soGestor);
  return pagina("Ajuda", html`
    <h1>Ajuda</h1>
    <p class="nota">Perguntas frequentes sobre o bookgest. Não encontra o que procura? Escreva para
      <a href="mailto:geral@bookgest.pt">geral@bookgest.pt</a>.</p>
    <input type="search" placeholder="Procurar na ajuda" aria-label="Procurar na ajuda" data-procurar style="margin: 12px 0 4px">
    <nav class="filtros" aria-label="Temas" style="margin-top: 8px">
      ${seccoes.map((s) => html`<a href="#${s.id}">${s.titulo}</a>`)}
    </nav>
    ${seccoes.map((s) => html`<section class="ajuda" id="${s.id}">
      <h2>${icone(s.icone, 20)}${s.titulo}</h2>
      ${s.perguntas.map(([p, r]) => html`<details><summary>${p}</summary><div>${r}</div></details>`)}
    </section>`)}
    <script>
    document.querySelector("[data-procurar]").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll(".ajuda").forEach((s) => {
        let alguma = false;
        s.querySelectorAll("details").forEach((d) => {
          const ve = !q || d.textContent.toLowerCase().includes(q);
          d.hidden = !ve;
          d.open = !!q && ve;
          alguma = alguma || ve;
        });
        s.hidden = !alguma;
      });
    });
    </script>
  `, { admin: papel === "gestor" ? true : "equipa", seccao: "ajuda" });
}
