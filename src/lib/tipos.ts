export interface Reserva {
  id: number;
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
  mes: string;
  declarado_em: string | null;
  pago_em: string | null;
}

export interface Config {
  horasAntesCodigo: number;
  horaCheckin: string;
  horasPrazoHospedes: number;
}
