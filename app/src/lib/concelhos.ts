import type { Alojamento, Config, RegimeIva, RegrasTmt } from "./tipos";

// ---------- Os 308 concelhos ----------
// Nomes repetidos (Lagoa, Calheta) levam a região entre parênteses.

export type Regiao = "continente" | "madeira" | "acores";

const CONTINENTE = (
  // Aveiro
  "Águeda|Albergaria-a-Velha|Anadia|Arouca|Aveiro|Castelo de Paiva|Espinho|Estarreja|Ílhavo|Mealhada|Murtosa|Oliveira de Azeméis|" +
  "Oliveira do Bairro|Ovar|Santa Maria da Feira|São João da Madeira|Sever do Vouga|Vagos|Vale de Cambra|" +
  // Beja
  "Aljustrel|Almodôvar|Alvito|Barrancos|Beja|Castro Verde|Cuba|Ferreira do Alentejo|Mértola|Moura|Odemira|Ourique|Serpa|Vidigueira|" +
  // Braga
  "Amares|Barcelos|Braga|Cabeceiras de Basto|Celorico de Basto|Esposende|Fafe|Guimarães|Póvoa de Lanhoso|Terras de Bouro|" +
  "Vieira do Minho|Vila Nova de Famalicão|Vila Verde|Vizela|" +
  // Bragança
  "Alfândega da Fé|Bragança|Carrazeda de Ansiães|Freixo de Espada à Cinta|Macedo de Cavaleiros|Miranda do Douro|Mirandela|" +
  "Mogadouro|Torre de Moncorvo|Vila Flor|Vimioso|Vinhais|" +
  // Castelo Branco
  "Belmonte|Castelo Branco|Covilhã|Fundão|Idanha-a-Nova|Oleiros|Penamacor|Proença-a-Nova|Sertã|Vila de Rei|Vila Velha de Ródão|" +
  // Coimbra
  "Arganil|Cantanhede|Coimbra|Condeixa-a-Nova|Figueira da Foz|Góis|Lousã|Mira|Miranda do Corvo|Montemor-o-Velho|" +
  "Oliveira do Hospital|Pampilhosa da Serra|Penacova|Penela|Soure|Tábua|Vila Nova de Poiares|" +
  // Évora
  "Alandroal|Arraiolos|Borba|Estremoz|Évora|Montemor-o-Novo|Mora|Mourão|Portel|Redondo|Reguengos de Monsaraz|Vendas Novas|" +
  "Viana do Alentejo|Vila Viçosa|" +
  // Faro
  "Albufeira|Alcoutim|Aljezur|Castro Marim|Faro|Lagoa (Algarve)|Lagos|Loulé|Monchique|Olhão|Portimão|São Brás de Alportel|" +
  "Silves|Tavira|Vila do Bispo|Vila Real de Santo António|" +
  // Guarda
  "Aguiar da Beira|Almeida|Celorico da Beira|Figueira de Castelo Rodrigo|Fornos de Algodres|Gouveia|Guarda|Manteigas|Mêda|" +
  "Pinhel|Sabugal|Seia|Trancoso|Vila Nova de Foz Côa|" +
  // Leiria
  "Alcobaça|Alvaiázere|Ansião|Batalha|Bombarral|Caldas da Rainha|Castanheira de Pera|Figueiró dos Vinhos|Leiria|Marinha Grande|" +
  "Nazaré|Óbidos|Pedrógão Grande|Peniche|Pombal|Porto de Mós|" +
  // Lisboa
  "Alenquer|Amadora|Arruda dos Vinhos|Azambuja|Cadaval|Cascais|Lisboa|Loures|Lourinhã|Mafra|Odivelas|Oeiras|Sintra|" +
  "Sobral de Monte Agraço|Torres Vedras|Vila Franca de Xira|" +
  // Portalegre
  "Alter do Chão|Arronches|Avis|Campo Maior|Castelo de Vide|Crato|Elvas|Fronteira|Gavião|Marvão|Monforte|Nisa|Ponte de Sor|" +
  "Portalegre|Sousel|" +
  // Porto
  "Amarante|Baião|Felgueiras|Gondomar|Lousada|Maia|Marco de Canaveses|Matosinhos|Paços de Ferreira|Paredes|Penafiel|Porto|" +
  "Póvoa de Varzim|Santo Tirso|Trofa|Valongo|Vila do Conde|Vila Nova de Gaia|" +
  // Santarém
  "Abrantes|Alcanena|Almeirim|Alpiarça|Benavente|Cartaxo|Chamusca|Constância|Coruche|Entroncamento|Ferreira do Zêzere|Golegã|" +
  "Mação|Ourém|Rio Maior|Salvaterra de Magos|Santarém|Sardoal|Tomar|Torres Novas|Vila Nova da Barquinha|" +
  // Setúbal
  "Alcácer do Sal|Alcochete|Almada|Barreiro|Grândola|Moita|Montijo|Palmela|Santiago do Cacém|Seixal|Sesimbra|Setúbal|Sines|" +
  // Viana do Castelo
  "Arcos de Valdevez|Caminha|Melgaço|Monção|Paredes de Coura|Ponte da Barca|Ponte de Lima|Valença|Viana do Castelo|" +
  "Vila Nova de Cerveira|" +
  // Vila Real
  "Alijó|Boticas|Chaves|Mesão Frio|Mondim de Basto|Montalegre|Murça|Peso da Régua|Ribeira de Pena|Sabrosa|" +
  "Santa Marta de Penaguião|Valpaços|Vila Pouca de Aguiar|Vila Real|" +
  // Viseu
  "Armamar|Carregal do Sal|Castro Daire|Cinfães|Lamego|Mangualde|Moimenta da Beira|Mortágua|Nelas|Oliveira de Frades|" +
  "Penalva do Castelo|Penedono|Resende|Santa Comba Dão|São João da Pesqueira|São Pedro do Sul|Sátão|Sernancelhe|Tabuaço|" +
  "Tarouca|Tondela|Vila Nova de Paiva|Viseu|Vouzela"
).split("|");

const MADEIRA = "Calheta (Madeira)|Câmara de Lobos|Funchal|Machico|Ponta do Sol|Porto Moniz|Porto Santo|Ribeira Brava|Santa Cruz|Santana|São Vicente".split("|");

const ACORES = (
  "Angra do Heroísmo|Calheta (Açores)|Corvo|Horta|Lagoa (Açores)|Lajes das Flores|Lajes do Pico|Madalena|Nordeste|Ponta Delgada|" +
  "Povoação|Ribeira Grande|Santa Cruz da Graciosa|Santa Cruz das Flores|São Roque do Pico|Velas|Vila da Praia da Vitória|" +
  "Vila do Porto|Vila Franca do Campo"
).split("|");

// ---------- Taxa municipal turística ----------
// Valores de referência compilados dos regulamentos municipais (outubro de 2026). Não há uma tabela nacional oficial:
// cada câmara aprova o seu regulamento e pode alterá-lo. O gestor confirma sempre e pode ajustar no alojamento.
// [valor época alta ou único (cêntimos), máx. noites (0 = sem limite), idade a partir da qual paga,
//  valor época baixa (null = valor único), época alta de (mês), até (mês), nota]
type Linha = [number, number, number, (number | null)?, number?, number?, string?];

const TAXAS: Record<string, Linha> = {
  Lisboa: [400, 7, 13],
  Cascais: [400, 7, 13],
  Porto: [300, 7, 13],
  "Vila Nova de Gaia": [300, 7, 16],
  Sintra: [200, 3, 13],
  Faro: [200, 7, 16, 100, 3, 10],
  Braga: [150, 4, 16],
  Óbidos: [100, 5, 13],
  "Póvoa de Varzim": [150, 7, 13],
  Coimbra: [100, 3, 16],
  Olhão: [200, 5, 16, 100, 4, 10],
  "Figueira da Foz": [200, 7, 16, 150, 4, 9],
  Mafra: [250, 7, 13, 120, 5, 10],
  Portimão: [200, 7, 13, 100, 4, 10],
  Maia: [200, 5, 14],
  "Lagoa (Algarve)": [200, 7, 13, 100, 4, 10],
  Peniche: [100, 5, 13],
  Amarante: [200, 3, 16, 100, 4, 9],
  Albufeira: [200, 7, 13, 0, 4, 10, "Só cobrada de abril a outubro."],
  "Vila do Conde": [100, 14, 16],
  Loures: [150, 7, 13],
  "Viana do Castelo": [150, 5, 17, 100, 5, 10],
  Oeiras: [100, 7, 13],
  Setúbal: [200, 5, 19],
  Caminha: [150, 7, 16, 100, 5, 9],
  Loulé: [200, 5, 16, 100, 4, 10],
  Matosinhos: [200, 7, 16],
  "Vila Real de Santo António": [100, 7, 11, null, undefined, undefined, "Dos 11 aos 13 anos paga-se metade: confirme o cálculo."],
  "Terras de Bouro": [100, 5, 13, 0, 5, 10, "Só cobrada de maio a outubro."],
  Évora: [150, 3, 16],
  Almada: [200, 5, 13],
  Sesimbra: [200, 7, 13],
  Nazaré: [100, 5, 12, null, undefined, undefined, "Maiores de 65 anos isentos: retire-os do cálculo."],
  // Madeira
  Funchal: [200, 7, 13],
  "Santa Cruz": [200, 7, 13],
  "Câmara de Lobos": [200, 7, 13],
  Santana: [200, 7, 13],
  "Ponta do Sol": [200, 7, 13],
  Machico: [200, 7, 13],
  "Ribeira Brava": [200, 7, 13],
  "Calheta (Madeira)": [200, 7, 13],
  "Porto Santo": [200, 7, 13],
  "São Vicente": [200, 7, 13],
  // Açores
  "Ponta Delgada": [200, 3, 13],
  "Lagoa (Açores)": [200, 3, 13],
  "Ribeira Grande": [200, 3, 13],
  "Vila Franca do Campo": [200, 3, 13],
  Povoação: [200, 3, 13],
  Nordeste: [200, 3, 13],
};

const PORTAIS: Record<string, string> = {
  Almada: "https://www.cm-almada.pt/inscricao-de-estabelecimentos",
};

export interface PredefinicaoConcelho {
  nome: string;
  regiao: Regiao;
  tmt: RegrasTmt | null; // null = sem taxa turística conhecida
  nota: string | null;
  portal: string | null;
}

const SEM_TAXA: RegrasTmt = { valorPorNoiteCents: 0, maxNoites: 0, idadeMinima: 0, diaDeclaracao: 15, diaPagamento: 30, valorBaixaCents: null, altaInicio: null, altaFim: null };

function predefinicao(nome: string, regiao: Regiao): PredefinicaoConcelho {
  const t = TAXAS[nome];
  return {
    nome,
    regiao,
    tmt: t
      ? {
          ...SEM_TAXA,
          valorPorNoiteCents: t[0],
          maxNoites: t[1],
          idadeMinima: t[2],
          valorBaixaCents: t[3] ?? null,
          altaInicio: t[3] != null ? t[4] ?? null : null,
          altaFim: t[3] != null ? t[5] ?? null : null,
        }
      : null,
    nota: t?.[6] ?? null,
    portal: PORTAIS[nome] ?? null,
  };
}

// Todos os concelhos por ordem alfabética, com as regras da taxa turística quando existe.
export const CONCELHOS: PredefinicaoConcelho[] = [
  ...CONTINENTE.map((n) => predefinicao(n, "continente" as const)),
  ...MADEIRA.map((n) => predefinicao(n, "madeira" as const)),
  ...ACORES.map((n) => predefinicao(n, "acores" as const)),
].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

// IVA da região: 6% no continente, 5% na Madeira, 4% nos Açores.
export const IVA_REGIAO: Record<Regiao, RegimeIva> = { continente: "6", madeira: "5", acores: "4" };

export function regrasTmt(a: Alojamento): RegrasTmt {
  return {
    valorPorNoiteCents: a.tmt_valor_cents,
    maxNoites: a.tmt_max_noites,
    idadeMinima: a.tmt_idade_minima,
    diaDeclaracao: a.tmt_dia_declaracao,
    diaPagamento: a.tmt_dia_pagamento,
    valorBaixaCents: a.tmt_valor_baixa_cents,
    altaInicio: a.tmt_alta_inicio,
    altaFim: a.tmt_alta_fim,
  };
}

export function configAlojamento(a: Alojamento): Config {
  return {
    horasAntesCodigo: a.horas_antes_codigo,
    horaCheckin: a.hora_checkin,
    horasPrazoHospedes: a.horas_prazo_hospedes,
    tmt: regrasTmt(a),
  };
}
