import { dayKey, formatKm, groupRunsByDay, mondayOf, monthCells, monthStats, recentWeeks } from './diary';

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

test('calendar starts on Monday: Nov 2026 begins on a Sunday so six blanks come first', () => {
  const cells = monthCells(2026, 10);
  expect(cells.slice(0, 6)).toEqual(Array(6).fill(null));
  expect(cells[6]).toEqual({ day: 1, key: '2026-11-01' });
  expect(cells.filter(Boolean)).toHaveLength(30);
});

test('a month starting on Monday has no blanks and February handles 28 and 29 days', () => {
  expect(monthCells(2026, 5)[0]).toEqual({ day: 1, key: '2026-06-01' });
  expect(monthCells(2026, 1).filter(Boolean)).toHaveLength(28);
  expect(monthCells(2028, 1).filter(Boolean)).toHaveLength(29);
});

test('month stats use only that month and the longest is a single run', () => {
  const runs = groupRunsByDay([run(at(2026, 11, 1), 5200), run(at(2026, 11, 6), 10000), run(at(2026, 11, 6, 20), 2000), run(at(2026, 10, 31), 9000)]);
  expect(monthStats(runs, 2026, 10)).toEqual({ days: 2, distance: 17200, longest: 10000 });
  expect(monthStats(runs, 2026, 11)).toEqual({ days: 0, distance: 0, longest: 0 });
});

test('weeks start on Monday and mark run, today, future and rest', () => {
  expect(dayKey(mondayOf(new Date(2026, 10, 15)))).toBe('2026-11-09');
  const now = new Date(2026, 10, 11, 12);
  const runs = groupRunsByDay([run(at(2026, 11, 10), 5800), run(at(2026, 11, 8), 4500)]);
  const weeks = recentWeeks(runs, now);
  expect(weeks.map(w => w.label)).toEqual(['이번 주', '지난주', '2주 전', '3주 전']);
  expect(weeks[0].days.map(d => d.state)).toEqual(['rest', 'run', 'today', 'future', 'future', 'future', 'future']);
  expect(weeks[0].distance).toBe(5800);
  expect(weeks[1].days[6].state).toBe('run');
  expect(weeks[1].distance).toBe(4500);
});

test('distance is shown in km with one decimal', () => {
  expect(formatKm(35000)).toBe('35.0km');
  expect(formatKm(0)).toBe('0.0km');
  expect(formatKm(5840)).toBe('5.8km');
});
