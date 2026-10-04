import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_BACKGROUNDS } from '@/constants/default-backgrounds';
import type { RoutePreset, StampConfig } from '@/components/route-preview';
import type { EditSnapshot } from './edit-history';
import { normalizeRouteStyle, type RouteStyle } from './editor-style';
import type { SmoothOptions } from './route-smoothing';

export const MAX_MY_STYLES = 20;
export type MyStyle = {
  id: string; name: string; createdAt: string;
  /** null이면 적용 대상의 현재 배경을 유지한다. 개인 사진·영상 참조는 보관하지 않는다. */
  backgroundId: string | null; preset: RoutePreset; routeStyle: RouteStyle; smoothOptions: SmoothOptions;
  stampStyle: Pick<StampConfig, 'enabled' | 'layout' | 'font' | 'textColor'>;
};
const KEY = 'runary.my-styles.v1';
const finitePercent = (v: number) => Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
export function captureMyStyle(snapshot: EditSnapshot, name: string): MyStyle {
  return {
    id: `style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name.trim().slice(0, 20) || '내 스타일', createdAt: new Date().toISOString(),
    backgroundId: snapshot.backgroundPhoto ? null : DEFAULT_BACKGROUNDS.find(bg => snapshot.backgroundImagePath?.endsWith(`/${bg.id}.jpg`))?.id ?? null,
    preset: snapshot.preset, routeStyle: normalizeRouteStyle(snapshot.routeStyle),
    smoothOptions: { smooth: finitePercent(snapshot.smoothOptions.smooth), corner: finitePercent(snapshot.smoothOptions.corner) },
    stampStyle: { enabled: { ...snapshot.stampConfig.enabled }, layout: snapshot.stampConfig.layout,
      font: snapshot.stampConfig.font, textColor: snapshot.stampConfig.textColor },
  };
}
/** 적용하면서 문구·손그림·위치·크기·장소 등 기록별 값은 그대로 둔다. */
export function applyMyStyle(snapshot: EditSnapshot, style: MyStyle, backgroundPath?: string): EditSnapshot {
  return { ...snapshot, ...(backgroundPath ? { backgroundImagePath: backgroundPath, backgroundPhoto: undefined } : {}),
    preset: style.preset, routeStyle: { ...style.routeStyle }, smoothOptions: { ...style.smoothOptions },
    stampConfig: { ...snapshot.stampConfig, ...style.stampStyle, enabled: { ...style.stampStyle.enabled } },
  };
}
let tail: Promise<void> = Promise.resolve();
function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation); tail = result.then(() => undefined, () => undefined); return result;
}
async function read(): Promise<MyStyle[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('style-data');
  return value.filter((style: MyStyle) => style && typeof style.id === 'string' && typeof style.name === 'string'
    && ['default-drawing', 'light-runner', 'segment-lighting'].includes(style.preset) && style.stampStyle?.enabled && style.smoothOptions)
    .slice(0, MAX_MY_STYLES).map((s: MyStyle) => ({ id: s.id, name: s.name.slice(0, 20), createdAt: s.createdAt,
      backgroundId: DEFAULT_BACKGROUNDS.some(bg => bg.id === s.backgroundId) ? s.backgroundId : null,
      preset: s.preset, routeStyle: normalizeRouteStyle(s.routeStyle), smoothOptions: {
        smooth: finitePercent(s.smoothOptions.smooth), corner: finitePercent(s.smoothOptions.corner),
      }, stampStyle: { layout: ['corner', 'glass', 'rail', 'stack', 'bar', 'line', 'row'].includes(s.stampStyle.layout) ? s.stampStyle.layout : 'corner',
        enabled: Object.fromEntries(['distance', 'time', 'pace', 'heartRate', 'date', 'place'].map(k => [k, !!s.stampStyle.enabled[k as keyof StampConfig['enabled']]])) as StampConfig['enabled'],
        font: ['preset', 'pretendard', 'noto'].includes(s.stampStyle.font ?? '') ? s.stampStyle.font : undefined,
        textColor: ['white', 'black'].includes(s.stampStyle.textColor ?? '') ? s.stampStyle.textColor : undefined },
    }));
}
export const listMyStyles = () => inOrder(read);
export async function saveMyStyle(style: MyStyle): Promise<MyStyle[]> {
  // 요청 당시 값으로 저장한다. 늦게 완료된 읽기/쓰기가 다른 저장·삭제를 덮지 않는다.
  const snapshot = JSON.stringify(style);
  return inOrder(async () => {
    const existing = await read(); if (existing.length >= MAX_MY_STYLES) throw new Error('style-limit');
    const next = [JSON.parse(snapshot) as MyStyle, ...existing];
    await AsyncStorage.setItem(KEY, JSON.stringify(next)); return next;
  });
}
export const deleteMyStyle = (id: string) => inOrder(async () => {
  const next = (await read()).filter(s => s.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)); return next;
});
