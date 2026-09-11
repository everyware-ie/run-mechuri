/** 미리보기/Swift의 서로 다른 서체에서도 통계가 겹치지 않도록 여유 있게 잡는다. */
export function estimateStampTextWidth(text: string, size: number): number {
  return Array.from(text).reduce((sum, char) => {
    const em = char.codePointAt(0)! > 127 || 'mMwW@'.includes(char)
      ? 1.05 : ' .,:;\'"/'.includes(char) ? 0.45 : 0.72;
    return sum + size * em;
  }, 0);
}

/** 최소 간격을 먼저 확보하고 글자를 함께 축소한다. 남는 공간은 칸 사이로 배분한다. */
export function fitStampColumns(widths: number[], availableWidth: number, minGap: number) {
  const gaps = Math.max(0, widths.length - 1);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const scale = Math.min(1, Math.max(1, availableWidth - gaps * minGap) / Math.max(1, total));
  const gap = gaps > 0 ? (availableWidth - total * scale) / gaps : 0;
  let cursor = 0;
  return { scale, columns: widths.map(width => {
    const column = { x: cursor, width: width * scale };
    cursor += column.width + gap;
    return column;
  }) };
}
