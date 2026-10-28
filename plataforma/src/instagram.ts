// Plano de Instagram para promover o bookgest: perfil e publicações prontas (imagens verticais 1080×1350 em SVG,
// convertidas em PNG no navegador, com legenda e hashtags).

export type Estilo = "verde" | "claro" | "creme";

export interface Diapositivo {
  estilo: Estilo;
  sobre?: string; // linha pequena por cima do título
  titulo: string;
  texto?: string;
  lista?: string[];
}

export interface Publicacao {
  quando: string;
  formato: "Imagem" | "Carrossel";
  tema: string;
  diapositivos: Diapositivo[];
  legenda: string;
  hashtags: string;
}

export const PERFIL = {
  utilizador: "bookgest.pt",
  alternativas: ["bookgest", "bookgest_pt", "bookgest.app"],
  nome: "bookgest · Alojamento Local",
  categoria: "Software (ou Aplicação)",
  bio: "Gestão de Alojamento Local sem papelada 🏡\nCheck-in online · SIBA automático · taxa turística · faturas\n4,90 €/alojamento · 30 dias grátis 👇",
  link: "https://bookgest.pt",
  destaques: [
    ["Como funciona", "o vídeo do painel, do check-in ao código das chaves"],
    ["SIBA", "o envio automático dos boletins"],
    ["Taxa", "a taxa turística calculada por concelho"],
    ["Preço", "4,90 € por alojamento, 30 dias grátis"],
    ["Dúvidas", "respostas às perguntas mais frequentes"],
  ] as [string, string][],
  rotina: [
    "3 publicações por semana (segunda, quarta e sexta, por volta das 19h).",
    "Stories quase todos os dias: bastidores, dicas curtas, perguntas com sondagem (\"Já envia o SIBA à mão?\").",
    "Responder a todos os comentários e mensagens no próprio dia.",
    "Seguir e comentar contas de gestores de AL, associações (ALEP) e grupos de anfitriões, sem publicidade agressiva.",
    "Fixar no topo do perfil as publicações 1, 4 e 6 (apresentação, obrigações e preço).",
    "Ao fim de um mês, ver em Estatísticas que publicações trouxeram visitas ao perfil e cliques no link, e repetir o que resultou.",
  ],
};

const HASHTAGS = "#alojamentolocal #alojamentolocalportugal #anfitriao #airbnbportugal #bookingcom #turismoportugal #gestaodealojamento";

export const PUBLICACOES: Publicacao[] = [
  {
    quando: "Semana 1 · segunda",
    formato: "Carrossel",
    tema: "Apresentação",
    diapositivos: [
      { estilo: "verde", sobre: "Novo", titulo: "O seu Alojamento Local em ordem, sem papelada.", texto: "Deslize para ver como →" },
      { estilo: "claro", sobre: "1 · Check-in online", titulo: "O hóspede preenche os dados no telemóvel.", texto: "Em português ou inglês, antes de chegar. O link segue por WhatsApp num toque." },
      { estilo: "claro", sobre: "2 · Código das chaves", titulo: "O código aparece só na hora certa.", texto: "Depois do check-in feito e perto da entrada, com as suas fotos de como chegar." },
      { estilo: "claro", sobre: "3 · Prazos legais", titulo: "SIBA, fatura e taxa turística à vista.", texto: "O bookgest avisa o que falta tratar em cada reserva." },
      { estilo: "verde", sobre: "bookgest.pt", titulo: "Experimente 30 dias grátis.", texto: "Sem cartão. Link na bio." },
    ],
    legenda: "Gerir um Alojamento Local não devia ser um segundo emprego. 🏡\n\nO bookgest junta num só sítio o check-in online dos hóspedes, o código das chaves, as reservas do Booking, do Airbnb e do Vrbo, e todos os prazos legais: SIBA, fatura e taxa turística.\n\nFeito em Portugal, para o Alojamento Local português. Experimente 30 dias grátis, sem cartão. Link na bio. 👆",
    hashtags: HASHTAGS,
  },
  {
    quando: "Semana 1 · quarta",
    formato: "Imagem",
    tema: "SIBA automático",
    diapositivos: [
      { estilo: "creme", sobre: "SIBA", titulo: "Ainda envia os boletins ao SIBA à mão?", texto: "Com o bookgest seguem sozinhos, assim que o hóspede termina o check-in." },
    ],
    legenda: "Cada hóspede estrangeiro tem de ser comunicado ao SIBA. À mão, é copiar passaportes campo a campo, reserva a reserva. 😮‍💨\n\nNo bookgest, o hóspede preenche os dados no check-in online e o boletim segue automaticamente para o webservice oficial. Se algo falhar, vê o motivo e reenvia com um clique.\n\nMenos tempo ao computador, zero prazos esquecidos. Link na bio.",
    hashtags: `${HASHTAGS} #siba #aima`,
  },
  {
    quando: "Semana 1 · sexta",
    formato: "Carrossel",
    tema: "Taxa turística",
    diapositivos: [
      { estilo: "verde", sobre: "Taxa turística", titulo: "Sabe quanto cobrar no seu concelho?", texto: "Cada vez mais câmaras cobram. As regras mudam de concelho para concelho." },
      { estilo: "claro", sobre: "O que muda", titulo: "Valor por noite, máximo de noites, idades isentas.", texto: "E há concelhos com época alta e época baixa." },
      { estilo: "claro", sobre: "No bookgest", titulo: "Escolhe o concelho e a taxa fica calculada.", texto: "Tabela dos 308 concelhos, com o valor de cada reserva e o resumo para declarar." },
      { estilo: "verde", sobre: "bookgest.pt", titulo: "Uma preocupação a menos.", texto: "30 dias grátis. Link na bio." },
    ],
    legenda: "Taxa turística: quanto, a quem, durante quantas noites? 🤔\n\nAs regras mudam de concelho para concelho e há cada vez mais câmaras a cobrar. No bookgest escolhe o concelho do alojamento e a taxa de cada reserva fica calculada, com o total do mês pronto para declarar e pagar.\n\n(Confirme sempre o regulamento da sua câmara.) Link na bio.",
    hashtags: `${HASHTAGS} #taxaturistica`,
  },
  {
    quando: "Semana 2 · segunda",
    formato: "Imagem",
    tema: "Obrigações do AL",
    diapositivos: [
      { estilo: "claro", sobre: "Guarde esta publicação", titulo: "As obrigações de cada estadia", lista: [
        "Comunicar os hóspedes estrangeiros ao SIBA",
        "Emitir a fatura da estadia",
        "Cobrar e declarar a taxa turística (se houver)",
        "Responder ao INE, se for selecionado",
        "Ter livro de reclamações e seguro",
      ] },
    ],
    legenda: "Lista rápida para quem tem Alojamento Local (guarde para não se esquecer 📌):\n\n✅ Comunicar os hóspedes estrangeiros ao SIBA\n✅ Emitir a fatura de cada estadia\n✅ Cobrar e declarar a taxa turística, se o concelho a tiver\n✅ Responder ao inquérito do INE, se for selecionado\n✅ Ter o livro de reclamações e o seguro em dia\n\nO bookgest mostra em cada reserva o que já está feito e o que falta. Esqueceu-se de alguma? Diga nos comentários. 👇",
    hashtags: HASHTAGS,
  },
  {
    quando: "Semana 2 · quarta",
    formato: "Imagem",
    tema: "Várias plataformas",
    diapositivos: [
      { estilo: "verde", sobre: "Reservas", titulo: "Booking, Airbnb, Vrbo… num só calendário.", texto: "Ligue o calendário de cada plataforma e as reservas entram sozinhas." },
    ],
    legenda: "Uma aplicação para cada plataforma? Não. 🙅\n\nNo bookgest liga o calendário (iCal) do Booking, Airbnb, Vrbo, Tripadvisor ou Rentalia e todas as reservas aparecem num só calendário, com uma cor por plataforma. As reservas diretas criam-se em segundos.\n\nLink na bio.",
    hashtags: `${HASHTAGS} #vrbo`,
  },
  {
    quando: "Semana 2 · sexta",
    formato: "Imagem",
    tema: "Preço",
    diapositivos: [
      { estilo: "verde", sobre: "Preço simples", titulo: "4,90 € por alojamento, por mês.", texto: "IVA incluído · sem fidelização · 30 dias grátis, sem cartão." },
    ],
    legenda: "Sem planos complicados nem letras pequenas. 💚\n\n4,90 € por alojamento, por mês, com IVA incluído. Sem fidelização: cancela quando quiser e os seus dados continuam disponíveis.\n\nExperimente 30 dias grátis, sem cartão. Link na bio.",
    hashtags: HASHTAGS,
  },
  {
    quando: "Semana 3 · segunda",
    formato: "Carrossel",
    tema: "Check-in online",
    diapositivos: [
      { estilo: "creme", sobre: "Check-in online", titulo: "O hóspede preenche. Você descansa.", texto: "Deslize →" },
      { estilo: "claro", sobre: "Passo 1", titulo: "Envia o link por WhatsApp.", texto: "Num toque, a partir da reserva." },
      { estilo: "claro", sobre: "Passo 2", titulo: "O hóspede preenche no telemóvel.", texto: "Documentos de todos os hóspedes e dados da fatura." },
      { estilo: "claro", sobre: "Passo 3", titulo: "Recebe o código das chaves.", texto: "Só perto da hora de entrada, com as fotos de como chegar." },
      { estilo: "verde", sobre: "bookgest.pt", titulo: "Sem papéis à porta.", texto: "30 dias grátis. Link na bio." },
    ],
    legenda: "Chega de pedir fotografias de passaportes por mensagem. 📱\n\nCom o check-in online do bookgest, o hóspede preenche os dados de todos os acompanhantes antes de chegar, em português ou inglês. O código do cofre só aparece quando está tudo preenchido e perto da hora de entrada.\n\nLink na bio.",
    hashtags: `${HASHTAGS} #checkinonline`,
  },
  {
    quando: "Semana 3 · quarta",
    formato: "Imagem",
    tema: "Faturação",
    diapositivos: [
      { estilo: "claro", sobre: "Faturação", titulo: "A fatura de cada estadia, em 1 clique.", texto: "Com o InvoiceXpress, o Vendus ou o TOConline. Ou preparada campo a campo para o Portal das Finanças." },
    ],
    legenda: "Faturar cada estadia não tem de ser um quebra-cabeças. 🧾\n\nLigue o seu programa de faturação (InvoiceXpress, Vendus ou TOConline) e emite a fatura da reserva com um clique, com os dados que o hóspede deixou no check-in. Prefere o Portal das Finanças, que é gratuito? O bookgest prepara tudo campo a campo.\n\nLink na bio.",
    hashtags: `${HASHTAGS} #faturacao`,
  },
  {
    quando: "Semana 3 · sexta",
    formato: "Imagem",
    tema: "Avisos diários",
    diapositivos: [
      { estilo: "verde", sobre: "Todas as manhãs", titulo: "O que tem de tratar hoje, no seu email.", texto: "Entradas, saídas e prazos a terminar. Nada fica esquecido." },
    ],
    legenda: "Bom dia! ☕ Hoje tem 2 entradas, 1 saída e uma fatura por emitir.\n\nÉ isto que o bookgest lhe envia todas as manhãs: o resumo do dia e os prazos que estão a terminar. Abre o painel e trata tudo em minutos.\n\nLink na bio.",
    hashtags: HASHTAGS,
  },
  {
    quando: "Semana 4 · segunda",
    formato: "Imagem",
    tema: "Dica",
    diapositivos: [
      { estilo: "creme", sobre: "Dica", titulo: "Reencaminhe os emails de reserva.", texto: "O bookgest lê o nome, os hóspedes e os valores e completa a reserva sozinho." },
    ],
    legenda: "Dica para quem usa o bookgest: o calendário do Booking e do Airbnb só traz as datas. 📩\n\nReencaminhe os emails de confirmação para o seu endereço do bookgest (ou crie um filtro no Gmail que o faz por si) e o nome do hóspede, o número de pessoas e os valores entram na reserva sozinhos.\n\nTem dúvidas? Pergunte nos comentários.",
    hashtags: HASHTAGS,
  },
  {
    quando: "Semana 4 · quarta",
    formato: "Imagem",
    tema: "Privacidade",
    diapositivos: [
      { estilo: "claro", sobre: "Privacidade", titulo: "Os dados dos seus hóspedes são seus.", texto: "Sem publicidade, sem venda de dados. E pode ter o bookgest na sua própria conta Cloudflare." },
    ],
    legenda: "Passaportes, moradas, contactos: os dados dos hóspedes são sensíveis. 🔒\n\nNo bookgest não há publicidade nem venda de dados. Quem preferir pode instalar o bookgest na sua própria conta Cloudflare (modo Privado), onde só o gestor tem acesso. Se deixar de pagar, continua a poder consultar tudo.\n\nLink na bio.",
    hashtags: `${HASHTAGS} #rgpd`,
  },
  {
    quando: "Semana 4 · sexta",
    formato: "Carrossel",
    tema: "Comece hoje",
    diapositivos: [
      { estilo: "verde", sobre: "Comece hoje", titulo: "O bookgest pronto em 3 passos.", texto: "Deslize →" },
      { estilo: "claro", sobre: "1", titulo: "Escolha o endereço.", texto: "Ex.: casa-da-praia.bookgest.pt" },
      { estilo: "claro", sobre: "2", titulo: "Crie o alojamento.", texto: "Concelho, código do cofre e regras da casa." },
      { estilo: "claro", sobre: "3", titulo: "Ligue as reservas.", texto: "Cole o link do calendário de cada plataforma." },
      { estilo: "verde", sobre: "bookgest.pt", titulo: "30 dias grátis, sem cartão.", texto: "Link na bio." },
    ],
    legenda: "Comece em poucos minutos, sem conhecimentos técnicos. 🚀\n\n1️⃣ Escolha o endereço do seu bookgest\n2️⃣ Crie o alojamento (concelho, código do cofre, regras)\n3️⃣ Ligue o calendário do Booking, Airbnb ou Vrbo\n\nE já está: as reservas entram sozinhas e o hóspede recebe o link de check-in. 30 dias grátis, sem cartão. Link na bio.",
    hashtags: HASHTAGS,
  },
];

// ---------- Imagens (SVG 1080×1350) ----------
// Formato vertical 4:5, o recomendado para o feed. A grelha do perfil mostra só o centro em 3:4 (corta ~34 px de
// cada lado), por isso o texto fica a MARGEM das laterais.
export const LARGURA = 1080;
export const ALTURA = 1350;
const MARGEM = 120;
export const Y_RODAPE = 1240;

const CORES: Record<Estilo, { fundo: string; texto: string; suave: string; destaque: string; logo: string; logoIcone: string }> = {
  verde: { fundo: "#0f5c4d", texto: "#ffffff", suave: "#cfe6df", destaque: "#9fe0cd", logo: "#ffffff", logoIcone: "#0f5c4d" },
  claro: { fundo: "#f5f6f3", texto: "#16201c", suave: "#5b6762", destaque: "#0f5c4d", logo: "#0f5c4d", logoIcone: "#ffffff" },
  creme: { fundo: "#fbf3e4", texto: "#16201c", suave: "#6b5f4b", destaque: "#b5541c", logo: "#0f5c4d", logoIcone: "#ffffff" },
};

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Quebra o texto em linhas de até `max` caracteres (aproximação da largura, suficiente para estes tamanhos).
export function quebrar(texto: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    if (atual && (atual + " " + palavra).length > max) {
      linhas.push(atual);
      atual = palavra;
    } else atual = atual ? `${atual} ${palavra}` : palavra;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const FONTE = "Inter, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CASA = '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>';

export function svgDiapositivo(d: Diapositivo, n = 1, total = 1): string {
  const c = CORES[d.estilo];
  const partes: string[] = [];
  let y = d.lista ? 380 : 480;
  if (d.sobre) {
    partes.push(`<text x="${MARGEM}" y="${y}" font-size="34" font-weight="700" letter-spacing="3" fill="${c.destaque}">${xml(d.sobre.toUpperCase())}</text>`);
    y += d.lista ? 74 : 86;
  }
  const tamanhoTitulo = d.lista ? 64 : d.titulo.length > 44 ? 72 : 84;
  for (const l of quebrar(d.titulo, Math.floor(1560 / tamanhoTitulo))) {
    partes.push(`<text x="${MARGEM}" y="${y}" font-size="${tamanhoTitulo}" font-weight="800" letter-spacing="-2" fill="${c.texto}">${xml(l)}</text>`);
    y += Math.round(tamanhoTitulo * 1.14);
  }
  if (d.texto) {
    y += 34;
    for (const l of quebrar(d.texto, 38)) {
      partes.push(`<text x="${MARGEM}" y="${y}" font-size="40" fill="${c.suave}">${xml(l)}</text>`);
      y += 56;
    }
  }
  if (d.lista) {
    y += 24;
    for (const item of d.lista) {
      const linhas = quebrar(item, 34);
      partes.push(`<circle cx="${MARGEM + 22}" cy="${y - 12}" r="22" fill="${c.destaque}"/><path d="M${MARGEM + 11} ${y - 12}l8 8 15-16" fill="none" stroke="${c.fundo}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
      for (const l of linhas) {
        partes.push(`<text x="${MARGEM + 70}" y="${y}" font-size="36" font-weight="600" fill="${c.texto}">${xml(l)}</text>`);
        y += 46;
      }
      y += 24;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}" viewBox="0 0 ${LARGURA} ${ALTURA}" font-family="${FONTE}">
  <rect width="${LARGURA}" height="${ALTURA}" fill="${c.fundo}"/>
  <rect x="${MARGEM}" y="${MARGEM}" width="76" height="76" rx="22" fill="${c.logo}"/>
  <g transform="translate(${MARGEM + 14} ${MARGEM + 14}) scale(2)" fill="none" stroke="${c.logoIcone}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CASA}</g>
  <text x="${MARGEM + 100}" y="${MARGEM + 53}" font-size="44" font-weight="800" letter-spacing="-1" fill="${c.texto}">bookgest</text>
  ${partes.join("\n  ")}
  <text x="${MARGEM}" y="${Y_RODAPE}" font-size="32" font-weight="600" fill="${c.suave}">bookgest.pt</text>
  ${total > 1 ? `<text x="${LARGURA - MARGEM}" y="${Y_RODAPE}" font-size="32" font-weight="600" fill="${c.suave}" text-anchor="end">${n}/${total}</text>` : ""}
</svg>`;
}

// Fotografia de perfil: a casa do logótipo em fundo verde.
export function svgPerfil(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#0f5c4d"/>
  <g transform="translate(252 240) scale(24)" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CASA}</g>
</svg>`;
}
