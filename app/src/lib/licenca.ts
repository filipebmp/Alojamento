import {
  CAMINHO_API_EMAIL_RECUPERACAO,
  CAMINHO_API_LICENCA,
  type PedidoEmailRecuperacao,
  type PedidoLicenca,
  type RespostaLicenca,
} from "../../../comum/licenca";
import { dataPt } from "../views/layout";

export const URL_LICENCAS_PREDEFINIDO = "https://bookgest.pt";

export interface EstadoGuardado extends RespostaLicenca {
  verificadoEm: string;
}

// Pergunta ao servidor de licenças pelo estado da chave. Envia só chave, versão e n.º de alojamentos ativos.
// `servico`: ligação direta à plataforma quando a instalação está na mesma conta Cloudflare
// (aí o Cloudflare não deixa um Worker chamar outro pelo endereço workers.dev).
export async function consultarLicenca(urlBase: string, pedido: PedidoLicenca, servico?: Fetcher): Promise<RespostaLicenca> {
  const pedidoHttp = new Request(new URL(CAMINHO_API_LICENCA, urlBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  });
  const res = await (servico ? servico.fetch(pedidoHttp) : fetch(pedidoHttp));
  if (!res.ok) throw new Error(`Servidor de licenças respondeu ${res.status}`);
  return res.json<RespostaLicenca>();
}

const DIAS_SEM_RESPOSTA = 7;

// Aviso a mostrar no painel (null = tudo em ordem). Nunca bloqueia o acesso aos dados.
export function avisoLicenca(chave: string | null, estado: EstadoGuardado | null, ativos: number, agora: Date): string | null {
  if (!chave) return "Sem chave de licença: introduza-a em Definições.";
  if (!estado) return null; // ainda não verificada
  if (agora.getTime() - Date.parse(estado.verificadoEm) > DIAS_SEM_RESPOSTA * 86_400_000) {
    return `Não foi possível confirmar a licença desde ${dataPt(estado.verificadoEm)}.`;
  }
  switch (estado.estado) {
    case "desconhecida":
      return "A chave de licença não é reconhecida: confirme-a em Definições.";
    case "inativa":
      return "A licença está inativa. Os seus dados continuam disponíveis; renove a assinatura em bookgest.pt.";
    case "pagamento_em_atraso":
      return "Pagamento da licença em atraso: atualize o método de pagamento em bookgest.pt.";
  }
  if (ativos > estado.alojamentosPagos) {
    return `Tem ${ativos} alojamentos ativos e a licença cobre ${estado.alojamentosPagos}. Atualize a assinatura ou arquive alojamentos.`;
  }
  return null;
}

// Pede à plataforma que envie o email de recuperação (a instalação não tem como enviar emails).
export async function pedirEmailRecuperacao(urlBase: string, pedido: PedidoEmailRecuperacao, servico?: Fetcher): Promise<void> {
  const pedidoHttp = new Request(new URL(CAMINHO_API_EMAIL_RECUPERACAO, urlBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pedido),
  });
  const res = await (servico ? servico.fetch(pedidoHttp) : fetch(pedidoHttp));
  if (!res.ok) {
    const { erro } = await res.json<{ erro?: string }>().catch(() => ({ erro: undefined }));
    throw new Error(erro ?? `A plataforma respondeu ${res.status}`);
  }
}
