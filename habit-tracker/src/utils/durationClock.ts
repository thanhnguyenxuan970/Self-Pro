export type DurationClock = { hours: number; minutes: number };

export function clockMinutes({ hours, minutes }: DurationClock): number {
  return hours * 60 + minutes;
}

export function clockFromMinutes(minutes: number): DurationClock {
  const safeMinutes = Math.min(1440, Math.max(0, Math.floor(minutes)));
  return { hours: Math.floor(safeMinutes / 60), minutes: safeMinutes % 60 };
}
