import { estimateOneLineTextWidth, estimateStampTextWidth, fitStampColumns } from './stamp-columns';

describe('estimateStampTextWidth', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateStampTextWidth('', 20)) .toBe(0);
  });

  it('scales linearly with font size', () => {
    const small = estimateStampTextWidth('DIST', 10);
    const big = estimateStampTextWidth('DIST', 20);
    expect(big).toBeCloseTo(small * 2);
  });

  it('is positive for any non-empty text', () => {
    expect(estimateStampTextWidth('5.23km', 20)).toBeGreaterThan(0);
  });
});

describe('estimateOneLineTextWidth', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateOneLineTextWidth('', 20)).toBe(0);
  });

  it('treats ASCII text as narrower per-character than wide CJK/emoji text', () => {
    const ascii = estimateOneLineTextWidth('AAAA', 20);
    const wide = estimateOneLineTextWidth('가가가가', 20);
    expect(wide).toBeGreaterThan(ascii);
  });
});

describe('fitStampColumns', () => {
  it('spreads columns evenly to fill the available width when they fit', () => {
    const { scale, columns } = fitStampColumns([10, 10, 10], 100, 5);
    expect(scale).toBe(1);
    expect(columns[0].x).toBe(0);
    const gap1 = columns[1].x - (columns[0].x + columns[0].width);
    const gap2 = columns[2].x - (columns[1].x + columns[1].width);
    expect(gap1).toBeCloseTo(gap2);
    expect(gap1).toBeGreaterThanOrEqual(5); // never below the requested minGap
    const last = columns[columns.length - 1];
    expect(last.x + last.width).toBeCloseTo(100); // fills the available width exactly
  });

  it('shrinks columns (scale < 1) when they do not fit the available width', () => {
    const { scale, columns } = fitStampColumns([50, 50, 50], 100, 10);
    expect(scale).toBeLessThan(1);
    const last = columns[columns.length - 1];
    // The last column must still end within (or very near) the available width.
    expect(last.x + last.width).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('returns a single column with no gap for one item', () => {
    const { columns } = fitStampColumns([40], 100, 10);
    expect(columns).toEqual([{ x: 0, width: 40 }]);
  });

  it('handles an empty column list without dividing by zero', () => {
    const { scale, columns } = fitStampColumns([], 100, 10);
    expect(Number.isFinite(scale)).toBe(true);
    expect(columns).toEqual([]);
  });
});
