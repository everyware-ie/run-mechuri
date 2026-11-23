import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { getSavedToken, uploadRecord } from '@/lib/account';
import { Tracking, type RunPoint, type RunSummary } from '../../modules/run-tracking/src/RunTracking';

// 로그인 FRD §5-1 첫 가입 시 일괄 업로드, §5-4 실패와 재시도, §5-5 올리는 것.
// 앱을 열 때와 가입·로그인 직후에 아직 올라가지 않은 Runary 측정 기록을 올린다.
// 건강 앱 기록, 편집 상태, 영상은 올리지 않는다.

// 올린 기록 ID. 계정과 상관없이 한 번 올라간 기록은 다시 올리지 않는다.
// 같은 기기에서 다른 계정으로 로그인해도 이전 계정의 기록이 섞이지 않게 하기 위해서다(§5-1)
const UPLOADED_KEY = 'backup.uploadedRecordIds';
const LAST_BACKUP_KEY = 'backup.lastBackupAt';

export type BackupState = {
  /** 올리는 중이면 진행 상황 */
  progress: { done: number; total: number } | null;
  /** 올리지 못하고 남은 기록 수 */
  remaining: number;
  /** 마지막으로 모두 올린 시각(ms) */
  lastBackupAt: number | null;
};

let state: BackupState = { progress: null, remaining: 0, lastBackupAt: null };
const listeners = new Set<() => void>();
const setState = (next: Partial<BackupState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export function useBackupState(): BackupState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

/** 완료된 기록 중 아직 어느 계정에도 올리지 않은 것. */
export function recordsToUpload(records: RunSummary[], uploaded: ReadonlySet<string>): RunSummary[] {
  return records.filter((r) => r.status === 'completed' && !uploaded.has(r.id));
}

/** §5-5 올리는 것만 담는다. 배터리, GPS 공백, 오류 같은 진단 정보는 넣지 않는다. */
export function toUpload(summary: RunSummary, points: RunPoint[], heartChart: { time: number; bpm: number }[] = []) {
  return {
    startedAt: summary.started,
    endedAt: summary.started + summary.elapsed,
    durationSeconds: summary.duration,
    distanceMeters: summary.distance,
    averagePaceSecPerKm: summary.averagePace ?? null,
    averageHeartRate: summary.averageHeartRate ?? null,
    maxHeartRate: summary.maxHeartRate ?? null,
    steps: summary.steps,
    averageCadence: summary.averageCadence ?? null,
    points: points.map(({ latitude, longitude, time, segment }) => ({ latitude, longitude, time, segment })),
    heartRates: heartChart,
  };
}

async function readUploaded(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(UPLOADED_KEY)) ?? '[]'));
  } catch {
    return new Set();
  }
}

let running: Promise<void> | null = null;

/** 이미 올리는 중이면 그 작업을 기다린다. 실패는 남은 기록 수로만 남기고 앱을 막지 않는다(§5-2, §5-4). */
export function startBackup(): Promise<void> {
  running ??= runBackup().finally(() => { running = null; });
  return running;
}

async function runBackup() {
  const last = await AsyncStorage.getItem(LAST_BACKUP_KEY);
  setState({ lastBackupAt: last ? Number(last) : null });
  const token = await getSavedToken();
  // 측정 기능이 없는 빌드에는 올릴 Runary 기록이 없다
  if (!token || !Tracking) return;

  const uploaded = await readUploaded();
  const { records } = await Tracking.records();
  const pending = recordsToUpload(records, uploaded);
  let done = 0;
  let failed = 0;
  setState({ progress: pending.length ? { done, total: pending.length } : null, remaining: pending.length });

  // ponytail: 한 건씩 차례로 올린다. 기록이 수백 건이 되면 몇 건씩 동시에 올리기
  for (const summary of pending) {
    try {
      const detail = await Tracking.detail(summary.id);
      await uploadRecord(token, summary.id, toUpload(detail.summary, detail.points, detail.heartChart));
      uploaded.add(summary.id);
      // 한 건마다 저장해 두어야 앱이 닫혀도 다음 실행 때 남은 것부터 이어서 올린다
      await AsyncStorage.setItem(UPLOADED_KEY, JSON.stringify([...uploaded]));
    } catch (e) {
      console.warn('[backup] upload failed', summary.id, e);
      failed++;
    }
    done++;
    setState({ progress: { done, total: pending.length }, remaining: pending.length - done + failed });
  }

  // 올린 것이 있을 때만 시각을 바꾼다. 올릴 게 없던 실행까지 "백업"으로 세지 않는다
  if (pending.length > 0 && failed === 0) {
    const now = Date.now();
    await AsyncStorage.setItem(LAST_BACKUP_KEY, String(now));
    setState({ lastBackupAt: now });
  }
  setState({ progress: null, remaining: failed });
}
