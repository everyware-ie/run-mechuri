import { handDrawingBounds, handStrokePoints, hitHandStroke, constrainHandStroke, eraseHandStrokes, normalizeHandDrawing, MAX_INK_POINTS, type HandStroke } from './hand-drawing';
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

it('획의 빈 사각형은 잡지 않고 실제 선 가까이에서 위쪽 획을 선택한다', () => {
  const diagonal = { ...stroke, id: 'diagonal', points: [{ x: 100, y: 100 }, { x: 400, y: 400 }] };
  expect(hitHandStroke([diagonal], { x: 100, y: 400 }, 10)).toBeNull();
  expect(hitHandStroke([stroke, diagonal], { x: 105, y: 100 }, 10)).toBe('diagonal');
  expect(hitHandStroke([{ ...stroke, points: [{ x: 100, y: 100 }] }], { x: 100, y: 102 }, 10)).toBe('one');
});
it('이동·크기 편집은 원본 점을 보존하고 선택·지우개·썸네일에 같은 자리를 쓴다', () => {
  const moved = constrainHandStroke(stroke, { x: 150, y: 300 }, 2);
  expect(moved.points).toBe(stroke.points);
  expect(handStrokePoints(moved)).toEqual([{ x: 100, y: 400 }, { x: 700, y: 400 }]);
  expect(hitHandStroke([moved], { x: 400, y: 400 }, 10)).toBe('one');
  expect(hitHandStroke([moved], { x: 250, y: 100 }, 10)).toBeNull();
  expect(eraseHandStrokes([moved], { x: 400, y: 350 }, { x: 400, y: 450 }, 10)).toEqual([]);
  expect(handDrawingBounds([moved])[0]).toEqual({ x: 90, y: 390, width: 620, height: 20 });
  const restored = constrainHandStroke(moved, { x: 0, y: 0 }, 1);
  expect(handStrokePoints(restored)).toEqual(stroke.points);
  expect(normalizeHandDrawing(JSON.parse(JSON.stringify([moved])))).toEqual([moved]);
});
it('크기 범위와 화면 바깥 이동을 제한하되 개별 점을 잘라 찌그러뜨리지 않는다', () => {
  const moved = constrainHandStroke(stroke, { x: 99999, y: -99999 }, 999);
  expect(moved.scale).toBe(3);
  const points = handStrokePoints(moved);
  expect(points[1].x - points[0].x).toBe(900);
  expect(points[0].x).toBeLessThan(1080);
  expect(points[0].y).toBe(32);
  expect(normalizeHandDrawing([{ ...stroke, scale: -99, offset: { x: NaN, y: Infinity } }])[0])
    .toMatchObject({ scale: 1 / 3, offset: { x: 0, y: 0 } });
});
