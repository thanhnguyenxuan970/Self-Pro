export function parseDurationMinutes(input: string, unit: 'min' | 'hr'): number | null {
  const value = Number(input.trim());
  const minutes = unit === 'hr' ? value * 60 : value;
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
}
