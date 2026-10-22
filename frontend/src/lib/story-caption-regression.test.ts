import { Children, isValidElement } from 'react';
import { StampLayerSvg, computeCaptionHitRects, IDENTITY_STAMP, migrateLegacyCaption, type StampConfig, type StampLayout } from '@/components/route-preview';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// 네이티브 렌더링은 실행하지 않고 실제 배치·이관 함수를 검증한다.
jest.mock('@shopify/react-native-skia', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-worklets', () => ({}));
jest.mock('expo-router', () => ({}));

const run: RunRecord = {
  id: 'caption-qa', date: '2026-10-04T00:00:00Z', distanceMeters: 6010,
  durationSeconds: 2516, averagePaceSecPerKm: 418, averageHeartRate: 156, hasRoute: true,
};
const layouts: StampLayout[] = ['row', 'stack', 'bar', 'corner', 'glass', 'rail', 'line'];
const legacy = (overrides: Partial<StampConfig> = {}): StampConfig => ({
  ...IDENTITY_STAMP, captions: undefined, caption: '한강 아침 달리기',
  placeName: '신대방동', ...overrides,
});

describe('문구 표시와 옛 저장분 재편집', () => {
  it.each(['always', 'after', 'hidden'] as const)('새 문구는 러닝 데이터 %s 모드에서도 표시한다', (mode) => {
    const config: StampConfig = { ...IDENTITY_STAMP, mode, hidden: true,
      captions: [{ id: 'a', text: '오늘의 달리기', scale: 1, offset: { x: 37, y: -80 } }] };
    expect(computeCaptionHitRects(run, config)).toHaveLength(1);
    // 완성 상태의 터치 영역만으로는 after의 지연을 놓치므로 재생 시작도 확인한다.
    for (const progressFraction of [0, 0.5, 1]) {
      const layer = StampLayerSvg({ run, config, progressFraction });
      const children = layer ? Children.toArray(layer.props.children) : [];
      const texts = children.flatMap(child => isValidElement<{ texts?: { text: string }[] }>(child)
        ? child.props.texts ?? [] : []);
      expect(texts.map(node => node.text)).toEqual(['오늘의 달리기']);
    }
  });

  it.each(layouts)('%s 프리셋의 숨겨진 옛 문구도 내용·자리·크기를 보존한다', (layout) => {
    const visible = migrateLegacyCaption(run, legacy({ layout }));
    const hidden = migrateLegacyCaption(run, legacy({ layout, mode: 'hidden' }));
    expect(hidden.captions).toEqual(visible.captions);
    expect(hidden.captions?.[0].text).toBe('한강 아침 달리기');
    expect(hidden.mode).toBe('hidden');
  });

  it.each(layouts)('%s 옛 문구를 한 번만 전환하고 저장 원본은 바꾸지 않는다', (layout) => {
    const source = legacy({ layout, position: { x: 120, y: -50 }, scale: 1.4 });
    const copy = JSON.parse(JSON.stringify(source));
    const migrated = migrateLegacyCaption(run, source);
    expect(migrated.captions).toHaveLength(1);
    expect(migrateLegacyCaption(run, migrated)).toBe(migrated);
    expect(JSON.parse(JSON.stringify(source))).toEqual(copy);
    expect(migrated.position).toEqual(source.position);
    const before = computeCaptionHitRects(run, source)[0].rect;
    const after = computeCaptionHitRects(run, migrated)[0].rect;
    expect(Math.abs((before.x + before.width / 2) - (after.x + after.width / 2))).toBeLessThan(32);
    expect(Math.abs((before.y + before.height / 2) - (after.y + after.height / 2))).toBeLessThan(32);
    expect(migrated.scale).toBe(source.scale);
  });
});


describe('문구 줄과 위치', () => {
  it('러닝 데이터 숨김·위치·크기에 영향받지 않고 여러 줄을 같은 자리에서 그린다', () => {
    const captions = [
      { id: 'first', text: '첫 줄\n\n셋째 줄', scale: 1.5, offset: { x: -100, y: 80 } },
      { id: 'second', text: '나중 문구', scale: 0.5, offset: { x: 200, y: -120 } },
    ];
    const nodesOf = (config: StampConfig) => {
      const layer = StampLayerSvg({ run, config, progressFraction: 0 });
      return Children.toArray(layer?.props.children).flatMap(child =>
        isValidElement<{ texts?: { text: string; x: number; y: number; size: number }[] }>(child)
          ? child.props.texts ?? [] : []);
    };
    const nodes = nodesOf({ ...IDENTITY_STAMP, captions, hidden: true });
    expect(nodes.map(node => node.text)).toEqual(['첫 줄', '', '셋째 줄', '나중 문구']);
    expect(nodes[0].x).toBe(440);
    expect(nodes[0].size).toBe(96);
    expect(nodes[2].y - nodes[0].y).toBeCloseTo(96 * 1.3 * 2);
    expect(nodes[3].x).toBe(740);
    expect(nodes).toEqual(nodesOf({ ...IDENTITY_STAMP, captions, hidden: true,
      mode: 'hidden', scale: 3, position: { x: 800, y: -900 } }));
  });
});


describe('보관함에서 옛 저장분의 모습 유지', () => {
  it.each(['after', 'hidden'] as const)('전환 전 %s 모드의 표시 규칙은 유지한다', (mode) => {
    const config = legacy({ mode });
    expect(StampLayerSvg({ run, config, progressFraction: 0 })).toBeNull();
    if (mode === 'after') expect(computeCaptionHitRects(run, config)).toHaveLength(1);
    else expect(computeCaptionHitRects(run, config)).toEqual([]);
  });
});
