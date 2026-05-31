import { getRangeLabel } from '../src/logic/formatters';

describe('getRangeLabel', () => {
  // 2026-06-01 is a Monday
  const monday = new Date('2026-06-01T12:00:00');

  it('D returns dd/mm/yyyy', () => {
    expect(getRangeLabel('D', monday)).toBe('1/6/2026');
  });

  it('W returns Mon–Sun range for the week', () => {
    // Week of Mon 2026-06-01 → Sun 2026-06-07
    expect(getRangeLabel('W', monday)).toBe('1/6 – 7/6');
  });

  it('M returns Vietnamese month name and year', () => {
    expect(getRangeLabel('M', monday)).toBe('Tháng 6 2026');
  });

  it('Y returns 4-digit year', () => {
    expect(getRangeLabel('Y', monday)).toBe('2026');
  });
});
