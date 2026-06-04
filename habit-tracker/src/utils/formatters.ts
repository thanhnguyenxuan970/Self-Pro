export function getLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format any Date as YYYY-MM-DD using device local timezone (same logic as getLocalDate) */
export function getLocalDateFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getWeekStart(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? 6 : dow - 1; // Monday=0
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for day that is `dayOffset` days from today */
export function getLocalDateOffset(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM for month that is `monthOffset` months from today */
export function getMonthOffset(monthOffset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** YYYY for year that is `yearOffset` years from today */
export function getYearOffset(yearOffset: number): string {
  return String(new Date().getFullYear() + yearOffset);
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}
