import {
  formatDistanceKm,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatStampDate,
} from './stamp-format';

describe('formatDistanceKm', () => {
  it('formats meters as km with two decimals', () => {
    expect(formatDistanceKm(5234)).toBe('5.23km');
    expect(formatDistanceKm(0)).toBe('0.00km');
  });
});

describe('formatDuration (§7-3: 1시간 미만은 mm:ss, 넘으면 h:mm:ss)', () => {
  it('formats under an hour as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('clamps negative durations to zero instead of going negative', () => {
    expect(formatDuration(-5)).toBe('00:00');
  });
});

describe('formatPace', () => {
  it("formats seconds-per-km as minute'second\"/km", () => {
    expect(formatPace(342)).toBe('5\'42"/km');
    expect(formatPace(60)).toBe('1\'00"/km');
  });
});

describe('formatHeartRate', () => {
  it('rounds and appends bpm by default', () => {
    expect(formatHeartRate(152.4)).toBe('152bpm');
  });

  it('omits the unit when a preset already shows a label', () => {
    expect(formatHeartRate(152, false)).toBe('152');
  });
});

describe('formatStampDate', () => {
  it('formats an ISO date as MM.dd', () => {
    expect(formatStampDate('2026-08-21T10:00:00.000Z')).toBe('08.21');
  });

  it('returns an empty string for an invalid date instead of "Invalid Date"', () => {
    expect(formatStampDate('not-a-date')).toBe('');
  });
});
