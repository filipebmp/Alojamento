// Países (ISO 3166-1 alfa-2) para as listas de nacionalidade, documento, residência e faturação.
// Os nomes vêm do próprio runtime (Intl), em português e em inglês.

const CODIGOS = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

// Os mais frequentes no Alojamento Local aparecem primeiro.
const FREQUENTES = ["PT", "ES", "FR", "GB", "DE", "IT", "NL", "BE", "IE", "CH", "US", "CA", "BR"];

export interface Pais {
  codigo: string;
  nome: string; // "Alemanha / Germany"
}

function nomes(): Map<string, string> {
  const pt = new Intl.DisplayNames(["pt-PT"], { type: "region" });
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  return new Map(CODIGOS.map((c) => {
    const a = pt.of(c) ?? c;
    const b = en.of(c) ?? c;
    return [c, a === b ? a : `${a} / ${b}`];
  }));
}

let cache: { frequentes: Pais[]; todos: Pais[] } | null = null;

export function listaPaises(): { frequentes: Pais[]; todos: Pais[] } {
  if (!cache) {
    const n = nomes();
    cache = {
      frequentes: FREQUENTES.map((codigo) => ({ codigo, nome: n.get(codigo)! })),
      todos: CODIGOS.map((codigo) => ({ codigo, nome: n.get(codigo)! })).sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    };
  }
  return cache;
}

export const paisValido = (c: string) => CODIGOS.includes(c);
