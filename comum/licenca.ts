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

// ---------- Aviso diário por email ao gestor (tarefas com prazo a terminar) ----------
// Só seguem tipos e quantidades, nunca nomes de hóspedes: a plataforma escreve o texto do email.

export const CAMINHO_API_EMAIL_AVISOS = "/api/v1/email/avisos";

export const TIPOS_AVISO = ["formulario", "dados_hospedes", "completar", "siba", "fatura", "tmt_declarar", "tmt_pagar", "ine"] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];
export type PrazoAviso = "atrasado" | "hoje" | "amanha";

export interface ItemAviso {
  tipo: TipoAviso;
  prazo: PrazoAviso;
  quantidade: number;
  alojamento: string | null; // nome do alojamento (com mais de um)
}

export interface PedidoEmailAvisos {
  chave: string;
  para: string;
  painel: string | null; // endereço do painel, para o botão do email
  itens: ItemAviso[];
}

export function pedidoAvisosValido(p: unknown): p is PedidoEmailAvisos {
  const x = p as PedidoEmailAvisos;
  return (
    typeof x === "object" && x !== null &&
    typeof x.chave === "string" && /^[A-Za-z0-9-]{8,64}$/.test(x.chave) &&
    typeof x.para === "string" && x.para.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.para) &&
    (x.painel === null || (typeof x.painel === "string" && x.painel.length <= 200)) &&
    Array.isArray(x.itens) && x.itens.length > 0 && x.itens.length <= 50 &&
    x.itens.every((i) =>
      (TIPOS_AVISO as readonly string[]).includes(i?.tipo) &&
      ["atrasado", "hoje", "amanha"].includes(i.prazo) &&
      Number.isInteger(i.quantidade) && i.quantidade > 0 && i.quantidade <= 1000 &&
      (i.alojamento === null || (typeof i.alojamento === "string" && i.alojamento.length <= 60)))
  );
}
