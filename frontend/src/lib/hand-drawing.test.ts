import { handDrawingBounds, eraseHandStrokes, normalizeHandDrawing, MAX_INK_POINTS, type HandStroke } from './hand-drawing';
const stroke: HandStroke = { id: 'one', brush: 'pen', color: '#FFFFFF', width: 10, points: [{ x: 100, y: 100 }, { x: 400, y: 100 }] };
it('빠른 지우개가 양 끝 사이를 가로질러도 획을 지우고, 먼 획은 보존한다', () => {
  const other = { ...stroke, id: 'two', points: [{ x: 800, y: 700 }] };
  expect(eraseHandStrokes([stroke, other], { x: 250, y: 30 }, { x: 250, y: 170 }, 10)).toEqual([other]);
  const list = [stroke];
  expect(eraseHandStrokes(list, { x: 600, y: 100 }, { x: 800, y: 100 }, 10)).toBe(list);
});
it('점 하나도 지우고 비정상 저장값은 좌표·색·두께 범위로 정리한다', () => {
  expect(eraseHandStrokes([{ ...stroke, points: [stroke.points[0]] }], { x: 100, y: 100 }, { x: 100, y: 100 }, 10)).toEqual([]);
  expect(normalizeHandDrawing(undefined)).toEqual([]);
  const normalized = normalizeHandDrawing([{ ...stroke, color: 'invalid', width: 999,
    points: [{ x: -1, y: 9999 }, { x: NaN, y: 0 }] }, { ...stroke, brush: 'unknown' }]);
  expect(normalized).toHaveLength(1);
  expect(normalized[0]).toMatchObject({ color: '#FFFFFF', width: 48, points: [{ x: 0, y: 1920 }] });
});
it('지나치게 큰 저장 그림은 정해진 점 예산 안에서 읽는다', () => {
  const normalized = normalizeHandDrawing([{ ...stroke, points: Array.from({ length: MAX_INK_POINTS + 10 }, () => ({ x: 1, y: 1 })) }, stroke]);
  expect(normalized.reduce((n, s) => n + s.points.length, 0)).toBe(MAX_INK_POINTS);
});


it('겹치는 저장 ID는 서로 다른 키로 복구한다', () => {
  const stroke = { id: 'same', brush: 'pen', color: '#FFFFFF', width: 12, points: [{ x: 50, y: 50 }] };
  const read = normalizeHandDrawing([stroke, stroke]);
  expect(new Set(read.map(s => s.id)).size).toBe(2);
});
it('구석의 네온 손그림은 빛 번짐까지 썸네일 범위에 포함한다', () => {
  const box = handDrawingBounds([{ id: 'ink', brush: 'neon', color: '#FFFFFF', width: 24, points: [{ x: 1060, y: 1900 }] }])[0];
  expect(box.x + box.width).toBeGreaterThan(1060);
  expect(box.y + box.height).toBeGreaterThan(1900);
});
