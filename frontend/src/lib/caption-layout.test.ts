import { CAPTION_MAX_LINES, captionLines, captionMetrics, limitCaptionInput, normalizeCaption, wrapCaption } from './caption-layout';
import type { StampConfig } from '@/components/route-preview';

// Only the `type` import above is used — importing route-preview.tsx itself would
// pull in Skia/Reanimated, which this plain logic test doesn't need and shouldn't
// have to mock. A minimal literal keeps this test independent of that module.
function config(overrides: Partial<StampConfig> = {}): StampConfig {
  return {
    mode: 'always',
    layout: 'row',
    enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
    caption: '',
    placeName: '',
    position: { x: 0, y: 0 },
    scale: 1,
    ...overrides,
  };
}

describe('normalizeCaption', () => {
  it('normalizes CRLF/CR to LF and tabs to a single space', () => {
    expect(normalizeCaption('a\r\nb\rc\td')).toBe('a\nb\nc d');
  });
});

describe('wrapCaption', () => {
  it('does not wrap when the text fits on one line', () => {
    expect(wrapCaption('짧은 문구', 1000, 20)).toEqual(['짧은 문구']);
  });

  it('preserves explicit newlines, including blank lines', () => {
    const lines = wrapCaption('첫줄\n\n셋째줄', 1000, 20);
    expect(lines).toEqual(['첫줄', '', '셋째줄']);
  });

  it('wraps at word boundaries when a paragraph is too wide', () => {
    const lines = wrapCaption('가나다 라마바 사아자', 10, 20);
    expect(lines.length).toBeGreaterThan(1);
    // Every produced line must itself fit, so re-wrapping is idempotent.
    for (const line of lines) {
      expect(wrapCaption(line, 10, 20).length).toBeLessThanOrEqual(1);
    }
  });

  it('breaks a single word that is wider than the available width on its own', () => {
    const lines = wrapCaption('가나다라마바사아자차카타파하', 10, 20);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('returns an empty array for empty input', () => {
    expect(wrapCaption('', 1000, 20)).toEqual([]);
  });
});

describe('captionMetrics', () => {
  it('gives each card-style layout its own base size (line > bar > default)', () => {
    // 2a~2f 포팅 프리셋들은 전부 13*u가 기본이고 line(26*u)·bar(15*u)만 다르다.
    const line = captionMetrics(config({ layout: 'line' }));
    const bar = captionMetrics(config({ layout: 'bar' }));
    const corner = captionMetrics(config({ layout: 'corner' }));
    expect(line.size).toBeGreaterThan(bar.size);
    expect(bar.size).toBeGreaterThan(corner.size);
  });

  it('scales the caption size with StampConfig.scale', () => {
    const base = captionMetrics(config({ layout: 'bar', scale: 1 }));
    const bigger = captionMetrics(config({ layout: 'bar', scale: 2 }));
    expect(bigger.size).toBeCloseTo(base.size * 2);
  });

  it('narrows available width when a date chip shares the row (bar/corner/glass)', () => {
    const withDate = captionMetrics(config({ layout: 'bar', enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true } }));
    const withoutDate = captionMetrics(config({ layout: 'bar', enabled: { distance: true, time: true, pace: true, heartRate: true, date: false, place: true } }));
    expect(withDate.width).toBeLessThan(withoutDate.width);
  });
});

describe('captionLines', () => {
  it('never exceeds the wrapped line count a caller would compute directly', () => {
    const c = config({ layout: 'line' });
    const longText = '이것은 아주 길게 이어지는 한 줄 문구 테스트입니다 계속 이어집니다';
    expect(captionLines(longText, c)).toEqual(
      wrapCaption(longText, captionMetrics(c).width, captionMetrics(c).size)
    );
  });
});

describe('limitCaptionInput (§ "붙여넣기는 삽입 구간만 줄이고 기존 뒷부분은 보존")', () => {
  const c = config({ layout: 'line' });

  it('accepts input that stays within the max line count', () => {
    const result = limitCaptionInput('짧은 문구', '', c);
    expect(result).toEqual({ text: '짧은 문구', limited: false });
  });

  it('always allows deletions even if the previous text was already over the limit', () => {
    // A pathological previous value beyond the limit; deleting from it must be allowed.
    const hugeText = Array.from({ length: 50 }, (_, i) => `${i}번째 매우 긴 문단입니다`).join('\n');
    const shorter = hugeText.slice(0, hugeText.length - 10);
    const result = limitCaptionInput(shorter, hugeText, c);
    expect(result.limited).toBe(false);
    expect(result.text).toBe(shorter);
  });

  it('caps a paste that would exceed CAPTION_MAX_LINES', () => {
    const hugeText = Array.from({ length: 50 }, (_, i) => `${i}번째 매우 긴 문단입니다`).join('\n');
    const result = limitCaptionInput(hugeText, '', c);
    expect(result.limited).toBe(true);
    expect(captionLines(result.text, c).length).toBeLessThanOrEqual(CAPTION_MAX_LINES);
  });
});
