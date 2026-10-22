import { useCallback, useEffect, useRef, useState } from 'react';
import type { DefaultBackground } from '@/constants/default-backgrounds';

type Options = {
  prepare: (background: DefaultBackground) => Promise<string>;
  onApply: (path: string) => void;
  onError: () => void;
};

// result-editing FRD §1: 마지막 편집값으로 결과물을 만든다. 화면을 떠났거나 다른 선택을
// 시작한 뒤에는 이전 파일 준비의 완료·오류가 현재 배경을 바꾸거나 안내를 띄우지 않아야 한다.
export function useBackgroundApply({ prepare, onApply, onError }: Options) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const operationRef = useRef(0);
  const pendingRef = useRef(false);
  const cancel = useCallback(() => {
    operationRef.current += 1;
    pendingRef.current = false;
    setPendingId(null);
  }, []);
  useEffect(() => () => {
    operationRef.current += 1;
    pendingRef.current = false;
  }, []);

  const apply = useCallback(async (background: DefaultBackground) => {
    // 상태가 화면에 반영되기 전의 연속 탭도 한 작업으로 제한한다.
    if (pendingRef.current) return;
    pendingRef.current = true;
    const operation = ++operationRef.current;
    setPendingId(background.id);
    try {
      const path = await prepare(background);
      if (operation === operationRef.current) onApply(path);
    } catch {
      if (operation === operationRef.current) onError();
    } finally {
      if (operation === operationRef.current) {
        pendingRef.current = false;
        setPendingId(null);
      }
    }
  }, [prepare, onApply, onError]);

  const isPending = useCallback(() => pendingRef.current, []);
  return { pendingId, apply, cancel, isPending };
}
