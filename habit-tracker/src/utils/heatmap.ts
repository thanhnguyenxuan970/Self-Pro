import type { AppColors } from '../config/theme';

export type HeatmapDay = { local_date: string; total_points: number; stars?: number };

export type HeatmapCell = { date: string; level: number; month?: string };

export function heatmapShades(colors: AppColors) {
  return [colors.surface2, colors.heatmapGold1, colors.heatmapGold2, colors.heatmapGold3, colors.heatmapGold4];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function heatmapLevel(stars: number): number {
  if (stars <= 0) return 0;
  if (stars <= 5) return 1;
  if (stars <= 10) return 2;
  if (stars <= 20) return 3;
  return 4;
}

export function buildHeatmapWeeks(days: HeatmapDay[], today = new Date()): HeatmapCell[][] {
  const levels = new Map(days.map(day => [day.local_date, heatmapLevel(day.stars ?? 0)]));
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end.getTime() - 364 * DAY_MS);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const cells: HeatmapCell[] = Array.from({ length: Math.ceil((end.getTime() - start.getTime()) / DAY_MS) + 1 }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    const key = toLocalDate(date);
    return { date: key, level: levels.get(key) ?? 0, month: date.getDate() === 1 ? MONTH_LABELS[date.getMonth()] : undefined };
  });
  while (cells.length % 7) cells.push({ date: '', level: 0 });
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
