export type DurationClock = { hours: number; minutes: number };

export function clampClockValue(value: string | number, max: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(max, Math.max(0, Math.floor(numericValue))) : 0;
}

export function wheelValueAtOffset(offsetY: number, rowHeight: number, max: number): number {
  return clampClockValue(Math.round(offsetY / rowHeight), max);
}

export function clockMinutes({ hours, minutes }: DurationClock): number {
  return hours * 60 + minutes;
}

export function clockFromMinutes(minutes: number): DurationClock {
  const safeMinutes = Math.min(1440, Math.max(0, Math.floor(minutes)));
  return { hours: Math.floor(safeMinutes / 60), minutes: safeMinutes % 60 };
}
