function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toYM(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getLocalDate(): string {
  return toYMD(new Date());
}

/** Format any Date as YYYY-MM-DD using device local timezone (same logic as getLocalDate) */
export function getLocalDateFor(date: Date): string {
  return toYMD(date);
}

export function getWeekStart(): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return toYMD(d);
}

export function getRangeLabel(range: 'D' | 'W' | 'M' | 'Y', now: Date = new Date()): string {
  if (range === 'D') {
    return `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
  }
  if (range === 'W') {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${monday.getDate()}/${monday.getMonth() + 1} – ${sunday.getDate()}/${sunday.getMonth() + 1}`;
  }
  if (range === 'M') {
    const months = [
      'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
      'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12',
    ];
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
  }
  return String(now.getFullYear());
}

/** YYYY-MM-DD for Monday that is `weekOffset` weeks from current week (0=current) */
export function getWeekStartOffset(weekOffset: number): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff + weekOffset * 7);
  return toYMD(d);
}

/** YYYY-MM-DD for day that is `dayOffset` days from today */
export function getLocalDateOffset(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return toYMD(d);
}

/** YYYY-MM for month that is `monthOffset` months from today */
export function getMonthOffset(monthOffset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return toYM(d);
}

/** YYYY for year that is `yearOffset` years from today */
export function getYearOffset(yearOffset: number): string {
  return String(new Date().getFullYear() + yearOffset);
}

