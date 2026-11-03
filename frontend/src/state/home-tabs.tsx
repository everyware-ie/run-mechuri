import { createContext, useContext } from 'react';
import type { RunSummary } from '../../modules/run-tracking/src/RunTracking';

export type HomeRunStatus = RunSummary['status'] | null;

// A screen reports only freshly read native state. This never starts sensors.
export const HomeTabsContext = createContext<{ reportRunStatus: (status: HomeRunStatus) => void }>({ reportRunStatus: () => {} });
export const useHomeTabs = () => useContext(HomeTabsContext);
