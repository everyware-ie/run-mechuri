import { hasEditChanges, MAX_HISTORY, pushHistory, type EditSnapshot } from './edit-history';

function snapshot(overrides: Partial<EditSnapshot> = {}): EditSnapshot {
  return {
    backgroundImagePath: 'bg.jpg',
    preset: 'default-drawing',
    transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 },
    smoothOptions: { smooth: 0, corner: 0 },
    stampConfig: {
      mode: 'always',
      layout: 'corner',
      enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
      caption: '',
      placeName: '',
      position: { x: 0, y: 0 },
      scale: 1,
    },
    ...overrides,
  };
}

describe('pushHistory', () => {
  it('keeps only the most recent steps', () => {
    let history: EditSnapshot[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) history = pushHistory(history, snapshot({ backgroundImagePath: `bg-${i}` }));
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[0].backgroundImagePath).toBe('bg-5');
    expect(history[history.length - 1].backgroundImagePath).toBe(`bg-${MAX_HISTORY + 4}`);
  });
});


describe('실제로 바뀐 편집만 기록', () => {
  it('같은 프리셋 재선택·같은 문구 완료·기본값 초기화는 이력을 만들지 않는다', () => {
    const original = snapshot({ stampConfig: { ...snapshot().stampConfig,
      captions: [{ id: 'a', text: '오늘의 달리기', scale: 1, offset: { x: 0, y: 0 } }] } });
    const equivalent = JSON.parse(JSON.stringify(original)) as EditSnapshot;
    expect(hasEditChanges(original, equivalent)).toBe(false);
    expect(hasEditChanges(original, { ...equivalent, transform: { scale: 1, y: 0, x: 0, rotationDeg: 0 } })).toBe(false);
    expect(hasEditChanges(original, { ...equivalent,
      stampConfig: { ...equivalent.stampConfig, scale: undefined, hidden: false } })).toBe(false);
  });

  it('장소 이름만 자동으로 채워지면 이력을 만들지 않는다', () => {
    const original = snapshot();
    expect(hasEditChanges(original, { ...original,
      stampConfig: { ...original.stampConfig, placeName: '한강' } })).toBe(false);
  });

  it('장소 자동 채우기와 사용자 편집이 겹쳐도 편집은 기록한다', () => {
    const original = snapshot();
    expect(hasEditChanges(original, { ...original,
      transform: { ...original.transform, x: 140 },
      stampConfig: { ...original.stampConfig, placeName: '한강' } })).toBe(true);
  });

  it('문구·숨김·항목·위치·크기·다듬기·프리셋은 모두 편집으로 기록한다', () => {
    const original = snapshot();
    const updates: Partial<EditSnapshot>[] = [
      { stampConfig: { ...original.stampConfig, captions: [{ id: 'a', text: '새 문구', offset: { x: 0, y: 0 }, scale: 1 }] } },
      { stampConfig: { ...original.stampConfig, hidden: true } },
      { stampConfig: { ...original.stampConfig, enabled: { ...original.stampConfig.enabled, distance: false } } },
      { stampConfig: { ...original.stampConfig, position: { x: 10, y: 20 } } },
      { stampConfig: { ...original.stampConfig, scale: 1.5 } },
      { smoothOptions: { smooth: 30, corner: 50 } },
      { preset: 'light-runner' },
    ];
    for (const update of updates) expect(hasEditChanges(original, { ...original, ...update })).toBe(true);
  });

  it('배경의 구도와 사진·영상 소재 변경도 기록한다', () => {
    const original = snapshot({ backgroundPhoto: {
      sourceUri: 'source.jpg', width: 1080, height: 1920, origin: 'gallery',
      crop: { zoom: 1, centerX: 0.5, centerY: 0.5 },
    } });
    expect(hasEditChanges(original, { ...original, backgroundImagePath: 'new-bg.jpg' })).toBe(true);
    expect(hasEditChanges(original, { ...original, backgroundPhoto: {
      ...original.backgroundPhoto!, media: 'video', sourceUri: 'source.mov', posterUri: 'poster.jpg', durationSec: 12,
    } })).toBe(true);
    expect(hasEditChanges(original, { ...original, backgroundPhoto: {
      ...original.backgroundPhoto!, crop: { ...original.backgroundPhoto!.crop, zoom: 2 },
    } })).toBe(true);
  });
});


it('스타일 편집은 되돌리기에 포함하고 옛 기본값의 명시적 선택은 제외한다', () => {
  const original = snapshot();
  expect(hasEditChanges(original, { ...original, routeStyle: { color: 'warm', widthScale: 1 },
    stampConfig: { ...original.stampConfig, font: 'preset' } })).toBe(false);
  for (const updated of [
    { ...original, routeStyle: { color: 'mint' as const, widthScale: 1.5 } },
    { ...original, stampConfig: { ...original.stampConfig, font: 'pretendard' as const } },
    { ...original, stampConfig: { ...original.stampConfig, textColor: 'black' as const } },
  ]) expect(hasEditChanges(original, updated)).toBe(true);
});
