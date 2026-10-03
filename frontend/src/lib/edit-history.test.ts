import { MAX_HISTORY, pushHistory, type EditSnapshot } from './edit-history';

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
