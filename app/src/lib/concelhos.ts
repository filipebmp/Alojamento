import type { Alojamento, Config, RegrasTmt } from "./tipos";

export interface PredefinicaoConcelho {
  nome: string;
  tmt: RegrasTmt;
  portal: string | null;
}

// Regras pré-preenchidas ao criar um alojamento (o gestor pode ajustá-las).
// Só entram concelhos com regulamento confirmado na fonte oficial.
export const CONCELHOS: PredefinicaoConcelho[] = [
  {
    // Regulamento n.º 125/2026. Confirmar a idade mínima junto da CM Almada (">12 anos" vs "13 ou mais").
    nome: "Almada",
    tmt: { valorPorNoiteCents: 200, maxNoites: 5, idadeMinima: 13, diaDeclaracao: 15, diaPagamento: 30 },
    portal: "https://www.cm-almada.pt/inscricao-de-estabelecimentos",
  },
];

export function regrasTmt(a: Alojamento): RegrasTmt {
  return {
    valorPorNoiteCents: a.tmt_valor_cents,
    maxNoites: a.tmt_max_noites,
    idadeMinima: a.tmt_idade_minima,
    diaDeclaracao: a.tmt_dia_declaracao,
    diaPagamento: a.tmt_dia_pagamento,
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
