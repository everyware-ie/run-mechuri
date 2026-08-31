import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { RunRecord, Track } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// 코어 루프 진행 중 화면 사이에서 공유하는 상태.
// PRD §6 코어 루프: [러닝 기록 선택] → [배경 선택] → [편집] → [공유]
// v0는 편집을 건너뛰므로 배경 선택 다음이 바로 공유다.

type CreationDraft = {
  selectedRun: RunRecord | null;
  track: Track | null;
  backgroundImagePath: string | null;
};

type CreationFlowContextValue = {
  draft: CreationDraft;
  setSelectedRun: (run: RunRecord, track: Track) => void;
  setBackground: (path: string) => void;
  reset: () => void;
};

const emptyDraft: CreationDraft = {
  selectedRun: null,
  track: null,
  backgroundImagePath: null,
};

const CreationFlowContext = createContext<CreationFlowContextValue | null>(null);

export function CreationFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CreationDraft>(emptyDraft);

  const value = useMemo<CreationFlowContextValue>(
    () => ({
      draft,
      setSelectedRun: (run, track) => setDraft((prev) => ({ ...prev, selectedRun: run, track })),
      setBackground: (path) => setDraft((prev) => ({ ...prev, backgroundImagePath: path })),
      reset: () => setDraft(emptyDraft),
    }),
    [draft]
  );

  return <CreationFlowContext.Provider value={value}>{children}</CreationFlowContext.Provider>;
}

export function useCreationFlow() {
  const context = useContext(CreationFlowContext);
  if (!context) {
    throw new Error('useCreationFlow는 CreationFlowProvider 안에서만 쓸 수 있습니다');
  }
  return context;
}
