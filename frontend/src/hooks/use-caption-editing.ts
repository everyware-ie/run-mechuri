import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StampConfig } from '@/components/route-preview';
import { limitFreeCaptionInput } from '@/lib/caption-layout';
import { captionItems, newCaptionId } from '@/lib/stamp-caption';

type EditingCaption = { id: string; text: string; scale: number; isNew: boolean; limited: boolean };

// 저장용 초안과 완료 시 같은 합성을 쓴다. 입력 중에는 확정값과 기록을 바꾸지 않는다.
function applyEditing(config: StampConfig, editing: EditingCaption | null): StampConfig {
  if (!editing) return config;
  const { id, text, scale, isNew } = editing;
  const empty = !text.trim();
  if (isNew && empty) return config;
  const items = captionItems(config);
  const existing = items.some(c => c.id === id);
  const captions = empty ? items.filter(c => c.id !== id)
    : existing ? items.map(c => c.id === id ? { ...c, text, scale } : c)
      : isNew ? [...items, { id, text, scale, offset: { x: 0, y: 0 } }] : items;
  return { ...config, captions };
}

export function useCaptionEditing(config: StampConfig, commit: (config: StampConfig) => void, committedConfig = config) {
  const [editing, setEditing] = useState<EditingCaption | null>(null);
  // PanResponder가 처음 받은 함수를 계속 호출해도 최신 문구·위치와 확정 함수를 쓴다.
  // 렌더 중 ref를 덮지 않고, 터치를 받기 전 레이아웃 효과에서 갱신한다.
  const currentRef = useRef({ config, commit });
  useLayoutEffect(() => { currentRef.current = { config, commit }; }, [config, commit]);
  // 같은 React 갱신 안에서 마지막 입력과 완료가 호출돼도 최신값을 읽는다.
  const editingRef = useRef<EditingCaption | null>(null);
  const replaceEditing = (next: EditingCaption | null) => {
    editingRef.current = next;
    setEditing(next);
  };
  const startNew = () => replaceEditing({ id: newCaptionId(), text: '', scale: 1, isNew: true, limited: false });
  const startEdit = (id: string) => {
    const item = captionItems(currentRef.current.config).find(c => c.id === id);
    if (item) replaceEditing({ id, text: item.text, scale: item.scale, isNew: false, limited: false });
  };
  const changeText = (text: string) => {
    const prev = editingRef.current;
    if (!prev) return;
    const constrained = limitFreeCaptionInput(text, prev.text, prev.scale);
    replaceEditing({ ...prev, ...constrained });
  };
  const changeScale = (scale: number) => {
    const prev = editingRef.current;
    if (prev) replaceEditing({ ...prev, scale });
  };
  const finish = () => {
    const current = editingRef.current;
    if (!current) return;
    replaceEditing(null);
    const latest = currentRef.current;
    const next = applyEditing(latest.config, current);
    if (next !== latest.config) latest.commit(next);
  };
  // 문구 입력만 저장에 덧붙인다. 다른 제스처의 화면용 중간값까지 자동 저장하지 않는다.
  const stampForSave = useMemo(() => applyEditing(committedConfig, editing), [committedConfig, editing]);
  return { editing, stampForSave, startNew, startEdit, changeText, changeScale, finish };
}
