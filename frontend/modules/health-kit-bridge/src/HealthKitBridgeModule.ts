import { NativeModule, requireNativeModule } from 'expo';

import type { RunRecord, Track } from './HealthKitBridge.types';

declare class HealthKitBridgeModule extends NativeModule<{}> {
  /** 공통 규칙 §1-2: 목록을 열려 할 때 묻는다. 앱을 열자마자가 아니다. */
  requestAuthorization(): Promise<boolean>;
  /** §2-1 실외 달리기만, §2-4 최신순 정렬된 목록. */
  getOutdoorRuns(): Promise<RunRecord[]>;
  /** §5: 고른 기록의 실제 좌표. 목록 화면이 아니라 고른 다음에만 부른다. */
  getRoute(workoutId: string): Promise<Track>;
}

export default requireNativeModule<HealthKitBridgeModule>('HealthKitBridge');
