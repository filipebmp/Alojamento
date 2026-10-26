// Aviso diário por email: as tarefas com prazo até amanhã, agrupadas por tipo, prazo e alojamento.
// Só seguem para a plataforma tipos e quantidades (nunca nomes de hóspedes).

import type { ItemAviso, PrazoAviso, TipoAviso } from "../../../comum/licenca";
import { TIPOS_AVISO } from "../../../comum/licenca";
import { somarDias } from "./datas";
import type { Pendente } from "./regras";

export function itensAviso(pendentes: Pendente[], hoje: string, nomes: Map<number, string>): ItemAviso[] {
  const amanha = somarDias(hoje, 1);
  const grupos = new Map<string, ItemAviso>();
  for (const p of pendentes) {
    if (!p.prazo || p.prazo > amanha || !(TIPOS_AVISO as readonly string[]).includes(p.tipo)) continue;
    const prazo: PrazoAviso = p.prazo < hoje ? "atrasado" : p.prazo === hoje ? "hoje" : "amanha";
    const alojamento = nomes.size > 1 && p.alojamentoId != null ? nomes.get(p.alojamentoId) ?? null : null;
    const chave = `${prazo}|${p.tipo}|${alojamento ?? ""}`;
    const g = grupos.get(chave);
    if (g) g.quantidade++;
    else grupos.set(chave, { tipo: p.tipo as TipoAviso, prazo, quantidade: 1, alojamento: alojamento?.slice(0, 60) ?? null });
  }
  const ordem: PrazoAviso[] = ["atrasado", "hoje", "amanha"];
  return [...grupos.values()].sort((a, b) => ordem.indexOf(a.prazo) - ordem.indexOf(b.prazo));
}

// Hora em Lisboa (0–23).
export function horaLisboa(agora: Date): number {
  return Number(new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "numeric", hourCycle: "h23" }).format(agora));
}
