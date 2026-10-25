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
