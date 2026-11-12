import { dayKey, formatKm, groupRunsByDay, sundayOf, monthCells, monthStats, recentWeeks } from './diary';

const at = (y: number, m: number, d: number, h = 7) => new Date(y, m - 1, d, h).getTime() / 1000;
const run = (started: number, distance: number, status: 'completed' | 'saving' = 'completed') => ({ started, distance, status });

test('only completed runs count and two runs on one day become one day', () => {
  const days = groupRunsByDay([run(at(2026, 11, 10), 5000), run(at(2026, 11, 10, 20), 3000), run(at(2026, 11, 9), 4000, 'saving')]);
  expect(days.size).toBe(1);
  expect(days.get('2026-11-10')).toEqual({ count: 2, distance: 8000, longest: 5000 });
});

test('a run past midnight counts on the day it started', () => {
  expect(groupRunsByDay([run(at(2026, 11, 10, 23.9), 5000)]).has('2026-11-10')).toBe(true);
});

test('calendar starts on Sunday: Nov 2026 begins on a Sunday so there are no blanks', () => {
  const cells = monthCells(2026, 10);
  expect(cells[0]).toEqual({ day: 1, key: '2026-11-01' });
  expect(cells.filter(Boolean)).toHaveLength(30);
});

test('blanks fill the days before the first day and February handles 28 and 29 days', () => {
  // 2026-06-01 is a Monday, so one blank (Sunday) comes first.
  const june = monthCells(2026, 5);
  expect(june[0]).toBeNull();
  expect(june[1]).toEqual({ day: 1, key: '2026-06-01' });
  expect(monthCells(2026, 1).filter(Boolean)).toHaveLength(28);
  expect(monthCells(2028, 1).filter(Boolean)).toHaveLength(29);
});

test('month stats use only that month and the longest is a single run', () => {
  const runs = groupRunsByDay([run(at(2026, 11, 1), 5200), run(at(2026, 11, 6), 10000), run(at(2026, 11, 6, 20), 2000), run(at(2026, 10, 31), 9000)]);
  expect(monthStats(runs, 2026, 10)).toEqual({ days: 2, distance: 17200, longest: 10000 });
  expect(monthStats(runs, 2026, 11)).toEqual({ days: 0, distance: 0, longest: 0 });
});

test('weeks start on Sunday and mark run, today, future and rest', () => {
  expect(dayKey(sundayOf(new Date(2026, 10, 14)))).toBe('2026-11-08');
  const now = new Date(2026, 10, 11, 12);
  const runs = groupRunsByDay([run(at(2026, 11, 10), 5800), run(at(2026, 11, 8), 4500), run(at(2026, 11, 7), 3000)]);
  const weeks = recentWeeks(runs, now);
  expect(weeks.map(w => w.label)).toEqual(['이번 주', '지난주', '2주 전', '3주 전']);
  expect(weeks[0].days.map(d => d.state)).toEqual(['run', 'rest', 'run', 'today', 'future', 'future', 'future']);
  expect(weeks[0].distance).toBe(10300);
  expect(weeks[1].days[6].state).toBe('run');
  expect(weeks[1].distance).toBe(3000);
});

test('distance is shown in km with one decimal', () => {
  expect(formatKm(35000)).toBe('35.0km');
  expect(formatKm(0)).toBe('0.0km');
  expect(formatKm(5840)).toBe('5.8km');
});
