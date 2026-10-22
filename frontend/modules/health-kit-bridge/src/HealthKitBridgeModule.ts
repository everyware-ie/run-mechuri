import { NativeModule, requireNativeModule } from 'expo';

import type { RunRecord, Track } from './HealthKitBridge.types';

declare class HealthKitBridgeModule extends NativeModule<{}> {
  /** 공통 규칙 §1-3: 아직 응답하지 않은 항목만 요청한다. 반환값은 요청 완료 여부이며 읽기 허용 여부가 아니다. */
  requestAuthorization(): Promise<boolean>;
  /** §2-1 실외 달리기만, §2-4 최신순 정렬된 목록. */
  getOutdoorRuns(): Promise<RunRecord[]>;
  /** §5: 고른 기록의 실제 좌표. 목록 화면이 아니라 고른 다음에만 부른다. */
  getRoute(workoutId: string): Promise<Track>;
}

export default requireNativeModule<HealthKitBridgeModule>('HealthKitBridge');
