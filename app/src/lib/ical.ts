// Leitura dos calendários iCal (.ics) exportados pelo Booking, pelo Airbnb e outras plataformas.
// Só o necessário: UID, datas (dia de chegada e de partida), resumo e descrição.

export interface EventoCalendario {
  uid: string;
  checkin: string; // YYYY-MM-DD
  checkout: string;
  resumo: string;
  descricao: string;
}

// Linhas "dobradas" (RFC 5545): uma linha que começa por espaço ou tab continua a anterior.
function desdobrar(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

const desescapar = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function dataIcal(valor: string): string | null {
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function lerCalendario(ics: string): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];
  let atual: Record<string, string> | null = null;
  for (const linha of desdobrar(ics)) {
    if (linha === "BEGIN:VEVENT") atual = {};
    else if (linha === "END:VEVENT" && atual) {
      const checkin = dataIcal(atual.DTSTART ?? "");
      const checkout = dataIcal(atual.DTEND ?? "");
      if (atual.UID && checkin && checkout && checkout > checkin) {
        eventos.push({ uid: atual.UID, checkin, checkout, resumo: desescapar(atual.SUMMARY ?? ""), descricao: desescapar(atual.DESCRIPTION ?? "") });
      }
      atual = null;
    } else if (atual) {
      const i = linha.indexOf(":");
      if (i > 0) atual[linha.slice(0, i).split(";")[0].toUpperCase()] = linha.slice(i + 1).trim();
    }
  }
  return eventos;
}

export type Plataforma = "booking" | "airbnb" | "outra";

// O Airbnb marca as reservas como "Reserved" e as datas bloqueadas como "Airbnb (Not available)".
// O Booking marca tudo como "CLOSED - Not available": não distingue reservas de datas fechadas à mão.
export function eReserva(e: EventoCalendario, plataforma: Plataforma): boolean {
  if (plataforma === "airbnb") return /reserved/i.test(e.resumo) || /reservations\/details/i.test(e.descricao);
  return true;
}

// Código da reserva do Airbnb (HM…), a partir do link na descrição.
export function referencia(e: EventoCalendario): string | null {
  return e.descricao.match(/reservations\/details\/([A-Z0-9]+)/i)?.[1] ?? null;
}
