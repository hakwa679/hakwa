function toFijiTime(now: Date): Date {
  const FIJI_OFFSET_MS = 12 * 60 * 60 * 1000;
  return new Date(now.getTime() + FIJI_OFFSET_MS);
}

function fromFijiTime(fijiDate: Date): Date {
  const FIJI_OFFSET_MS = 12 * 60 * 60 * 1000;
  return new Date(fijiDate.getTime() - FIJI_OFFSET_MS);
}

export function nextPayoutDate(now: Date): Date {
  const fijiNow = toFijiTime(now);
  const day = fijiNow.getUTCDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;

  const nextMonday = new Date(fijiNow);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);

  return fromFijiTime(nextMonday);
}

export function mondayWeekStartFor(date: Date): string {
  const fijiDate = toFijiTime(date);
  const day = fijiDate.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(fijiDate);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  monday.setUTCHours(0, 0, 0, 0);

  return monday.toISOString().slice(0, 10);
}
