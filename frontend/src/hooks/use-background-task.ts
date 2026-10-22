import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

type Task = { cancelled: boolean; started: number; timers: ReturnType<typeof setTimeout>[] };

/** 취소·화면 이탈 후 늦게 끝난 사진 처리 결과가 새 선택을 덮어쓰지 않게 한다. */
export function useBackgroundTask() {
  const current = useRef<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [indicator, setIndicator] = useState<'hidden' | 'spinner' | 'long'>('hidden');
  const [label, setLabel] = useState('');
  useEffect(() => () => {
    const task = current.current;
    if (task) { task.cancelled = true; task.timers.forEach(clearTimeout); }
  }, []);

  const cancel = () => {
    const task = current.current;
    if (task) { task.cancelled = true; task.timers.forEach(clearTimeout); }
    current.current = null;
    setBusy(false);
    setIndicator('hidden');
  };

  async function run<T>(message: string, work: (isActive: () => boolean) => Promise<T>, commit: (result: T) => void,
    discard?: (result: T) => Promise<void>) {
    if (current.current) return;
    const task: Task = { cancelled: false, started: Date.now(), timers: [] };
    current.current = task;
    setBusy(true); setLabel(message); setIndicator('hidden');
    task.timers.push(setTimeout(() => setIndicator('spinner'), 300));
    task.timers.push(setTimeout(() => setIndicator('long'), 2000));
    try {
      const result = await work(() => !task.cancelled);
      const elapsed = Date.now() - task.started;
      if (!task.cancelled && elapsed >= 300 && elapsed < 800) {
        await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
      }
      if (task.cancelled) await discard?.(result);
      else commit(result);
    } catch (error) {
      console.warn('[background-photo] 작업 실패:', error instanceof Error ? error.message : 'Unknown error');
      if (!task.cancelled) Alert.alert('사진을 준비하지 못했어요', '선택한 배경은 그대로 유지했어요. 다시 시도하거나 다른 사진을 골라주세요.');
    } finally {
      task.timers.forEach(clearTimeout);
      if (current.current === task && !task.cancelled) {
        current.current = null; setBusy(false); setIndicator('hidden');
      }
    }
  }
  return { busy, indicator, label, cancel, run };
}
