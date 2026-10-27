// FRD: docs/specs/frd/run-record-selection.md

/** §2-3 목록 항목. 모든 출처(건강 앱과 Runary)가 줄 수 있는 것으로 한정한다. */
export type RunRecord = {
  id: string;
  runaryRunID?: string;
  source?: 'healthkit' | 'runary';
  /** 러닝한 날 (ISO 8601). 만든 날이 아니다. */
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  averagePaceSecPerKm: number | null;
  /** §2-3: 데이터가 있을 때만. 없으면 undefined — 빈 자리를 남기지 않는다. */
  averageHeartRate?: number;
  /** §2-2: 워크아웃은 있어도 좌표가 없을 수 있다. false면 목록에서 제외하고 건수를 알린다. */
  hasRoute: boolean;
};

export type Coordinate = {
  latitude: number;
  longitude: number;
  timestamp: string;
  segment?: number;
};

/** §5: 고른 기록의 트랙. 앱이 복사해 보관한다. */
export type Track = {
  coordinates: Coordinate[];
};
