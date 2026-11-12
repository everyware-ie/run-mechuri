import type { RunSummary } from '../../modules/run-tracking/src/RunTracking';

// FRD: diary §2 월 달력, §3 최근 4주, §5 기록 출처. 일요일에 한 주가 시작한다.

export type DayRuns = { count: number; distance: number; longest: number };
export type RunsByDay = Map<string, DayRuns>;
export type CalendarCell = { day: number; key: string } | null;
export type MonthStats = { days: number; distance: number; longest: number };
export type WeekDayState = 'run' | 'rest' | 'today' | 'future';
export type RecentWeek = { label: string; distance: number; days: { key: string; state: WeekDayState; date: Date }[] };

const pad = (value: number) => String(value).padStart(2, '0');
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 측정을 시작한 시각을 기기의 현재 시간대의 날짜로 바꿔 모은다. 완료된 기록만 센다. */
export function groupRunsByDay(records: Pick<RunSummary, 'started' | 'distance' | 'status'>[]): RunsByDay {
  const days: RunsByDay = new Map();
  for (const record of records) {
    if (record.status !== 'completed' || !Number.isFinite(record.started) || !Number.isFinite(record.distance)) continue;
    const key = dayKey(new Date(record.started * 1000));
    const meters = Math.max(0, record.distance);
    const current = days.get(key) ?? { count: 0, distance: 0, longest: 0 };
    days.set(key, { count: current.count + 1, distance: current.distance + meters, longest: Math.max(current.longest, meters) });
  }
  return days;
}

/** 일요일 시작 달력. 첫 줄 앞의 빈 칸은 null이다. month는 0부터 시작한다. */
export function monthCells(year: number, month: number): CalendarCell[] {
  const lead = new Date(year, month, 1).getDay();
  const last = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= last; day++) cells.push({ day, key: dayKey(new Date(year, month, day)) });
  return cells;
}

export function monthStats(runs: RunsByDay, year: number, month: number): MonthStats {
  let days = 0, distance = 0, longest = 0;
  for (const cell of monthCells(year, month)) {
    const entry = cell && runs.get(cell.key);
    if (!entry) continue;
    days++; distance += entry.distance; longest = Math.max(longest, entry.longest);
  }
  return { days, distance, longest };
}

export function sundayOf(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

const WEEK_LABELS = ['이번 주', '지난주', '2주 전', '3주 전'];
/** 이번 주부터 3주 전까지. */
export function recentWeeks(runs: RunsByDay, now: Date): RecentWeek[] {
  const today = dayKey(now);
  const thisSunday = sundayOf(now);
  return WEEK_LABELS.map((label, back) => {
    const sunday = new Date(thisSunday.getFullYear(), thisSunday.getMonth(), thisSunday.getDate() - back * 7);
    let distance = 0;
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + index);
      const key = dayKey(date);
      const entry = runs.get(key);
      if (entry) distance += entry.distance;
      const state: WeekDayState = entry ? 'run' : key === today ? 'today' : key > today ? 'future' : 'rest';
      return { key, state, date };
    });
    return { label, distance, days };
  });
}

export function formatKm(meters: number): string {
  return `${(Math.round(meters / 10) / 100).toFixed(1)}km`;
}
