// Dados extraídos de um email de reserva (Booking, Airbnb), enviados pela plataforma à instalação.

export type PlataformaEmail = "booking" | "airbnb" | "desconhecida";
export type TipoEmail = "nova" | "alterada" | "cancelada" | "confirmacao_reencaminhamento" | "desconhecido";

export interface DadosEmailReserva {
  plataforma: PlataformaEmail;
  tipo: TipoEmail;
  assunto: string;
  codigo?: string; // HM… (Airbnb) ou n.º da reserva (Booking)
  nome?: string;
  checkin?: string; // YYYY-MM-DD
  checkout?: string;
  hospedes?: number;
  totalCents?: number;
  comissaoCents?: number;
  propriedade?: string;
  confirmacao?: { codigo?: string; link?: string }; // confirmação do reencaminhamento (Gmail)
  texto?: string; // só quando não se reconheceu o essencial: ajuda o gestor a associar
}
