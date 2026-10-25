// Protocolo entre cada instalação (app/) e o servidor de licenças (plataforma/).
// A instalação só envia a chave, a versão e o número de alojamentos ativos: nunca dados de reservas ou hóspedes.

export const CAMINHO_API_LICENCA = "/api/v1/licenca";

export interface PedidoLicenca {
  chave: string;
  versao: string;
  alojamentos: number;
}

export type EstadoLicenca = "ativa" | "pagamento_em_atraso" | "inativa" | "desconhecida";

export interface RespostaLicenca {
  estado: EstadoLicenca;
  alojamentosPagos: number;
  versaoAtual?: string | null; // versão mais recente publicada (atualização automática)
  fimTeste?: string | null; // fim do período experimental (licenças de teste)
  emailReservas?: string | null; // endereço para reencaminhar os emails de reserva (se ativo)
}

export function pedidoValido(p: unknown): p is PedidoLicenca {
  const x = p as PedidoLicenca;
  return (
    typeof x === "object" && x !== null &&
    typeof x.chave === "string" && /^[A-Za-z0-9-]{8,64}$/.test(x.chave) &&
    typeof x.versao === "string" && x.versao.length <= 32 &&
    Number.isInteger(x.alojamentos) && x.alojamentos >= 0 && x.alojamentos <= 10_000
  );
}

// ---------- Email de recuperação (enviado pela plataforma em nome da instalação) ----------
// A plataforma só envia links para /recuperar/<token> e o link só funciona no browser onde a
// recuperação foi pedida (segunda parte secreta num cookie): quem envia o email não o consegue usar.

export const CAMINHO_API_EMAIL_RECUPERACAO = "/api/v1/email/recuperacao";

export interface PedidoEmailRecuperacao {
  chave: string;
  para: string;
  link: string;
}

export function linkRecuperacaoValido(link: string): boolean {
  try {
    const u = new URL(link);
    return (u.protocol === "https:" || u.hostname === "localhost") && /^\/recuperar\/[A-Za-z0-9_-]{32,}$/.test(u.pathname) && !u.search && !u.hash;
  } catch {
    return false;
  }
}

export function pedidoEmailValido(p: unknown): p is PedidoEmailRecuperacao {
  const x = p as PedidoEmailRecuperacao;
  return (
    typeof x === "object" && x !== null &&
    typeof x.chave === "string" && /^[A-Za-z0-9-]{8,64}$/.test(x.chave) &&
    typeof x.para === "string" && x.para.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.para) &&
    typeof x.link === "string" && x.link.length <= 512 && linkRecuperacaoValido(x.link)
  );
}

// ---------- Emails de reserva (Booking, Airbnb) reencaminhados para reservas-<código>@bookgest.pt ----------

export const CAMINHO_API_EMAILS_RESERVAS = "/api/v1/emails-reservas";

export interface EmailReservaEntregue {
  id: number;
  recebidoEm: string;
  dados: unknown; // DadosEmailReserva (plataforma/src/emails-reservas.ts)
}
