export const nowIso = (): string => new Date().toISOString();

const parts = (iso: string, tz: string): Record<string, string> => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
};

/** Calendar date (YYYY-MM-DD) of a timestamp in the user's timezone. */
export function localDate(iso: string, tz: string): string {
  const p = parts(iso, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localHour(iso: string, tz: string): number {
  return Number(parts(iso, tz).hour);
}

/** Minutes since local midnight. */
export function localMinutes(iso: string, tz: string): number {
  const p = parts(iso, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysAgoIso = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
