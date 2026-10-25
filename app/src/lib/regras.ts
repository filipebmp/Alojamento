import { hojeLisboa, instanteLisboa, somarDias, somarDiasUteis } from "./datas";
import { calcularTmt, cobraTmt } from "./tmt";
import type { Config, DeclaracaoTmt, Faturacao, Hospede, RegrasTmt, Reserva } from "./tipos";

const HORA = 3_600_000;

// Prazos legais (confirmar nas fontes oficiais — ver docs/ESPECIFICACAO.md).
export const DIAS_UTEIS_SIBA = 3;
export const DIAS_UTEIS_FATURA = 5;

export function eEstrangeiro(h: Pick<Hospede, "nacionalidade">): boolean {
  return !!h.nacionalidade && h.nacionalidade !== "PT";
}

// Dados necessários para a comunicação SIBA (portugueses só precisam de nome e nascimento).
export function hospedeCompleto(h: Hospede): boolean {
  if (!h.nome || !h.data_nascimento || !h.nacionalidade) return false;
  if (!eEstrangeiro(h)) return true;
  return !!(h.pais_residencia && h.doc_tipo && h.doc_numero && h.doc_pais);
}

// O titular preencheu o que é obrigatório antes de receber o código:
// os seus dados completos, os dados de faturação e nome + nascimento de todos os hóspedes.
export function titularCompleto(r: Reserva, hospedes: Hospede[], fat: Faturacao | null): boolean {
  const titular = hospedes.find((h) => h.titular);
  return !!titular && hospedeCompleto(titular) && !!fat && hospedes.length >= r.n_hospedes;
}

export function inicioCodigo(r: Reserva, cfg: Config): Date {
  return new Date(instanteLisboa(r.checkin, cfg.horaCheckin).getTime() - cfg.horasAntesCodigo * HORA);
}

export function fimCodigo(r: Reserva): Date {
  return instanteLisboa(somarDias(r.checkout, 1), "00:00");
}

export type EstadoCodigo = "formulario_em_falta" | "cedo" | "disponivel" | "expirado";

export function estadoCodigo(
  r: Reserva,
  hospedes: Hospede[],
  fat: Faturacao | null,
  cfg: Config,
  agora: Date,
): EstadoCodigo {
  if (r.cancelada || agora >= fimCodigo(r)) return "expirado";
  if (!titularCompleto(r, hospedes, fat)) return "formulario_em_falta";
  if (agora < inicioCodigo(r, cfg)) return "cedo";
  return "disponivel";
}

export function prazoDadosHospedes(r: Reserva, cfg: Config): Date {
  return new Date(instanteLisboa(r.checkin, cfg.horaCheckin).getTime() + cfg.horasPrazoHospedes * HORA);
}

export type TipoPendente = "formulario" | "dados_hospedes" | "siba" | "fatura" | "tmt_divergente" | "tmt_declarar" | "tmt_pagar";

export interface Pendente {
  tipo: TipoPendente;
  descricao: string;
  prazo: string | null; // YYYY-MM-DD
  reservaId?: number;
  alojamentoId?: number;
  mes?: string;
}

export function pendentesReserva(
  r: Reserva,
  hospedes: Hospede[],
  fat: Faturacao | null,
  cfg: Config,
  agora: Date,
): Pendente[] {
  if (r.cancelada) return [];
  const hoje = hojeLisboa(agora);
  const p: Pendente[] = [];
  const base = { reservaId: r.id, alojamentoId: r.alojamento_id };

  if (!titularCompleto(r, hospedes, fat) && hoje <= r.checkout) {
    p.push({ ...base, tipo: "formulario", descricao: `${r.nome_titular}: formulário de check-in por preencher`, prazo: r.checkin });
  } else if (hospedes.some((h) => !hospedeCompleto(h)) && hoje <= r.checkout) {
    p.push({
      ...base,
      tipo: "dados_hospedes",
      descricao: `${r.nome_titular}: faltam dados de hóspedes`,
      prazo: hojeLisboa(prazoDadosHospedes(r, cfg)),
    });
  }

  if (!r.siba_submetido_em && hoje >= r.checkin && hospedes.some(eEstrangeiro)) {
    p.push({ ...base, tipo: "siba", descricao: `${r.nome_titular}: comunicar hóspedes no SIBA`, prazo: somarDiasUteis(r.checkin, DIAS_UTEIS_SIBA) });
  }

  if (!r.fatura_emitida_em && hoje >= r.checkout) {
    p.push({ ...base, tipo: "fatura", descricao: `${r.nome_titular}: emitir fatura-recibo`, prazo: somarDiasUteis(r.checkout, DIAS_UTEIS_FATURA) });
  }

  if (r.tmt_cobrada_cents != null && hospedes.length >= r.n_hospedes) {
    const devida = calcularTmt(r.checkin, r.checkout, hospedes, cfg.tmt).valorCents;
    if (devida !== r.tmt_cobrada_cents) {
      p.push({
        ...base,
        tipo: "tmt_divergente",
        descricao: `${r.nome_titular}: Booking cobrou ${euros(r.tmt_cobrada_cents)} de taxa turística, devida ${euros(devida)}`,
        prazo: null,
      });
    }
  }
  return p;
}

// Meses (YYYY-MM) desde `inicio` até ao mês anterior ao atual.
export function mesesAteAnterior(inicio: string, agora: Date): string[] {
  const atual = hojeLisboa(agora).slice(0, 7);
  const meses: string[] = [];
  let m = inicio;
  while (m < atual) {
    meses.push(m);
    m = mesSeguinte(m);
  }
  return meses;
}

export function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

export function ultimoDiaMes(mes: string): string {
  return somarDias(`${mesSeguinte(mes)}-01`, -1);
}

// Prazos no mês seguinte; um dia que não existe nesse mês (ex.: 30 de fevereiro) passa para o último dia.
export function prazosTmt(mes: string, regras: Pick<RegrasTmt, "diaDeclaracao" | "diaPagamento">) {
  const seguinte = mesSeguinte(mes);
  const ultimo = ultimoDiaMes(seguinte);
  const dia = (n: number) => {
    const d = `${seguinte}-${String(n).padStart(2, "0")}`;
    return d < ultimo ? d : ultimo;
  };
  return { declarar: dia(regras.diaDeclaracao), pagar: dia(regras.diaPagamento) };
}

export interface AlojamentoTmt {
  id: number;
  concelho: string;
  regras: RegrasTmt;
}

export function pendentesTmt(meses: string[], declaracoes: DeclaracaoTmt[], al: AlojamentoTmt): Pendente[] {
  if (!cobraTmt(al.regras)) return [];
  const porMes = new Map(declaracoes.filter((d) => d.alojamento_id === al.id).map((d) => [d.mes, d]));
  const p: Pendente[] = [];
  for (const mes of meses) {
    const d = porMes.get(mes);
    const prazos = prazosTmt(mes, al.regras);
    const base = { mes, alojamentoId: al.id };
    if (!d?.declarado_em) {
      p.push({ ...base, tipo: "tmt_declarar", descricao: `Taxa turística ${mes}: declarar à CM ${al.concelho}`, prazo: prazos.declarar });
    }
    if (!d?.pago_em) {
      p.push({ ...base, tipo: "tmt_pagar", descricao: `Taxa turística ${mes}: pagar à CM ${al.concelho}`, prazo: prazos.pagar });
    }
  }
  return p;
}

export function ordenarPendentes(p: Pendente[]): Pendente[] {
  return [...p].sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
}

export function euros(cents: number): string {
  return (cents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}
