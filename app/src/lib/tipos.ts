export interface Reserva {
  id: number;
  alojamento_id: number;
  token: string;
  ref_booking: string | null;
  nome_titular: string;
  checkin: string;
  checkout: string;
  n_hospedes: number;
  valor_total_cents: number;
  comissao_cents: number;
  tmt_cobrada_cents: number | null;
  fatura_numero: string | null;
  fatura_emitida_em: string | null;
  siba_submetido_em: string | null;
  cancelada: number;
  criado_em: string;
}

export interface Hospede {
  id: number;
  reserva_id: number;
  titular: number;
  nome: string;
  data_nascimento: string;
  nacionalidade: string | null;
  pais_residencia: string | null;
  doc_tipo: string | null;
  doc_numero: string | null;
  doc_pais: string | null;
}

export interface Faturacao {
  reserva_id: number;
  nome: string;
  nif: string;
  pais: string;
  morada: string | null;
  codigo_postal: string | null;
  cidade: string | null;
  email: string | null;
}

export interface DeclaracaoTmt {
  alojamento_id: number;
  mes: string;
  declarado_em: string | null;
  pago_em: string | null;
}

export interface Alojamento {
  id: number;
  nome: string;
  morada: string | null;
  registo_al: string | null;
  ativo: number;
  codigo_cofre: string | null;
  hora_checkin: string;
  horas_antes_codigo: number;
  horas_prazo_hospedes: number;
  concelho: string;
  tmt_valor_cents: number;
  tmt_max_noites: number;
  tmt_idade_minima: number;
  tmt_dia_declaracao: number;
  tmt_dia_pagamento: number;
  tmt_portal: string | null;
  criado_em: string;
}

// Taxa municipal turística de um concelho (valorPorNoiteCents 0 = não cobra).
export interface RegrasTmt {
  valorPorNoiteCents: number;
  maxNoites: number; // 0 = sem limite
  idadeMinima: number;
  diaDeclaracao: number;
  diaPagamento: number;
}

export interface Config {
  horasAntesCodigo: number;
  horaCheckin: string;
  horasPrazoHospedes: number;
  tmt: RegrasTmt;
}

export interface Passo {
  id: number;
  alojamento_id: number;
  ordem: number;
  texto: string;
  tem_imagem: number;
  atualizado_em: string;
}
