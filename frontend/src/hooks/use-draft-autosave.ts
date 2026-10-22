import { useCallback, useEffect } from 'react';
import { saveDraft, type Draft } from '@/lib/draft-store';

// home-and-library FRD §3, result-editing FRD §1: 마지막 편집값을 남긴다.
// 공유 화면 뒤에 남은 편집 화면은 완성 후 지운 초안을 다시 저장하지 않는다.
export function useDraftAutosave(draft: Omit<Draft, 'lastEditedAt'> | null, enabled: boolean) {
  const save = useCallback((value: Omit<Draft, 'lastEditedAt'>) => {
    void saveDraft(value).catch((error) => console.warn('Draft save failed', error));
  }, []);
  useEffect(() => { if (enabled && draft) save(draft); }, [draft, enabled, save]);
  // 나가기 직전에는 React 갱신·포커스 전환을 기다리지 않고 마지막 값을 명시적으로 남긴다.
  return save;
}
