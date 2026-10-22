const CRM_TIME_ZONE = "Asia/Kolkata";

const kolkataParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function kolkataDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    kolkataParts.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function kolkataTodayKey(now = new Date()): string {
  return kolkataDateKey(now);
}

export function isKolkataToday(value?: string, now = new Date()): boolean {
  return Boolean(value && kolkataDateKey(value) === kolkataTodayKey(now));
}

export function shiftKolkataDateKey(dateKey: string, days: number): string {
  const instant = new Date(`${dateKey}T00:00:00+05:30`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return kolkataDateKey(instant);
}
