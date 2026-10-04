import { useCallback, useEffect, useRef, useState } from 'react';

import { hasEditChanges, pushHistory, type EditSnapshot } from '@/lib/edit-history';

/** 결과물 편집 FRD §4-3: 실제 사용자 편집만 한 단계씩 기록한다. */
export function useEditHistory(snapshot: EditSnapshot) {
  const [history, setHistory] = useState<EditSnapshot[]>([]);
  const previousRef = useRef<EditSnapshot | null>(null);
  const skipRef = useRef(false);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = snapshot;
    if (!previous) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    // 장소 자동 채우기가 사용자 편집과 겹쳐도 편집 자체는 기록한다.
    if (hasEditChanges(previous, snapshot)) setHistory(h => pushHistory(h, previous));
  }, [snapshot]);

  // 옛 문구의 최초 전환과 되돌리기 자체는 새 편집으로 쌓지 않는다.
  const skipNextChange = useCallback(() => { skipRef.current = true; }, []);
  const popHistory = useCallback(() => setHistory(h => h.slice(0, -1)), []);
  return { history, skipNextChange, popHistory };
}
