import { useMemo, useRef, useState } from 'react';
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

export function useCaptionEditing(config: StampConfig, commit: (config: StampConfig) => void) {
  const [editing, setEditing] = useState<EditingCaption | null>(null);
  // 같은 React 갱신 안에서 마지막 입력과 완료가 호출돼도 최신값을 읽는다.
  const editingRef = useRef<EditingCaption | null>(null);
  const replaceEditing = (next: EditingCaption | null) => {
    editingRef.current = next;
    setEditing(next);
  };
  const startNew = () => replaceEditing({ id: newCaptionId(), text: '', scale: 1, isNew: true, limited: false });
  const startEdit = (id: string) => {
    const item = captionItems(config).find(c => c.id === id);
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
    const next = applyEditing(config, current);
    if (next !== config) commit(next);
  };
  const stampForSave = useMemo(() => applyEditing(config, editing), [config, editing]);
  return { editing, stampForSave, startNew, startEdit, changeText, changeScale, finish };
}
