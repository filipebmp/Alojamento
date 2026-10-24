// Datas "civis" (sem hora) representadas como "YYYY-MM-DD" e manipuladas em UTC
// para evitar problemas com fusos horários e mudanças de hora.

export function parseData(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function formatarData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const d = parseData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return formatarData(d);
}

export function diferencaDias(de: string, ate: string): number {
  return Math.round((parseData(ate).getTime() - parseData(de).getTime()) / 86_400_000);
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return formatarData(new Date(Date.UTC(ano, mes - 1, dia)));
}

// Feriados nacionais obrigatórios (Código do Trabalho, art. 234.º).
export function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano);
  const fixos = ["01-01", "04-25", "05-01", "06-10", "08-15", "10-05", "11-01", "12-01", "12-08", "12-25"];
  return new Set([
    ...fixos.map((md) => `${ano}-${md}`),
    somarDias(p, -2), // Sexta-feira Santa
    p, // Páscoa
    somarDias(p, 60), // Corpo de Deus
  ]);
}

export function eDiaUtil(iso: string): boolean {
  const d = parseData(iso);
  const dia = d.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !feriadosNacionais(d.getUTCFullYear()).has(iso);
}

// Data em que termina um prazo de `n` dias úteis contados a partir do dia seguinte a `iso`.
export function somarDiasUteis(iso: string, n: number): string {
  let atual = iso;
  let contados = 0;
  while (contados < n) {
    atual = somarDias(atual, 1);
    if (eDiaUtil(atual)) contados++;
  }
  return atual;
}

export function idadeEm(dataNascimento: string, data: string): number {
  const n = parseData(dataNascimento);
  const d = parseData(data);
  let idade = d.getUTCFullYear() - n.getUTCFullYear();
  const antesDoAniversario =
    d.getUTCMonth() < n.getUTCMonth() ||
    (d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() < n.getUTCDate());
  if (antesDoAniversario) idade--;
  return idade;
}

// Converte uma data + hora de Lisboa ("HH:MM") para um instante UTC.
export function instanteLisboa(iso: string, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  const [a, mes, d] = iso.split("-").map(Number);
  const palpite = Date.UTC(a, mes - 1, d, h, m);
  return new Date(palpite - deslocamentoLisboa(new Date(palpite)));
}

// Diferença (ms) entre a hora de Lisboa e UTC num dado instante.
function deslocamentoLisboa(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const v = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const comoUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"));
  return comoUtc - Math.floor(instante.getTime() / 60_000) * 60_000;
}

export function hojeLisboa(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(agora);
}
