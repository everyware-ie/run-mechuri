import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { IDENTITY_TRANSFORM, type RoutePreset, type RouteTransform } from '@/components/route-preview';

import type { RunRecord, Track } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// 코어 루프 진행 중 화면 사이에서 공유하는 상태.
// PRD §6 코어 루프: [러닝 기록 선택] → [배경 선택] → [편집] → [공유]

type CreationDraft = {
  selectedRun: RunRecord | null;
  track: Track | null;
  backgroundImagePath: string | null;
  preset: RoutePreset;
  transform: RouteTransform;
};

type CreationFlowContextValue = {
  draft: CreationDraft;
  setSelectedRun: (run: RunRecord, track: Track) => void;
  setBackground: (path: string) => void;
  setPreset: (preset: RoutePreset) => void;
  setTransform: (transform: RouteTransform) => void;
  /** result-editing FRD §4-3: 프리셋·각인은 그대로 두고 드로잉 조작값만 되돌린다. */
  resetTransform: () => void;
  /** 초안 이어서 만들기·결과물 다시 편집 등, 여러 값을 한 번에 채워 넣을 때. */
  loadDraft: (partial: Partial<CreationDraft>) => void;
  reset: () => void;
};

const emptyDraft: CreationDraft = {
  selectedRun: null,
  track: null,
  backgroundImagePath: null,
  preset: 'default-drawing',
  transform: IDENTITY_TRANSFORM,
};

const CreationFlowContext = createContext<CreationFlowContextValue | null>(null);

export function CreationFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CreationDraft>(emptyDraft);

  const value = useMemo<CreationFlowContextValue>(
    () => ({
      draft,
      setSelectedRun: (run, track) => setDraft((prev) => ({ ...prev, selectedRun: run, track })),
      setBackground: (path) => setDraft((prev) => ({ ...prev, backgroundImagePath: path })),
      setPreset: (preset) => setDraft((prev) => ({ ...prev, preset })),
      setTransform: (transform) => setDraft((prev) => ({ ...prev, transform })),
      resetTransform: () => setDraft((prev) => ({ ...prev, transform: IDENTITY_TRANSFORM })),
      loadDraft: (partial) => setDraft((prev) => ({ ...prev, ...partial })),
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
