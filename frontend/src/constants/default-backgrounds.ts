// FRD: docs/specs/frd/background-selection.md §2
// 기본 이미지 6장. 9:16(1080×1920) PNG, 앱에 함께 넣어 배포(서버 다운로드 없음).
//
// 2026-10-21에 3장(아침/점심/저녁 단색 그라디언트)에서 러닝 풍경 6장으로 교체했다.
// 전부 코드로 생성한 이미지라 저작권 문제가 없다(scripts/mockups/gen_run*.py).
// 시간대 라벨이 없다 — 화면에는 썸네일만 보인다. 예전 9장(morning-*/noon-*/evening-*/team-1)은
// frontend/assets/backgrounds/에 보관만 하고 코드에서는 쓰지 않는다.
// 파일명은 ASCII만 쓴다 — Metro 에셋 서버가 한글 경로를 URL 인코딩한 채 디코드하지
// 못해 이미지를 못 불러온다(ENOENT `.%2Fassets%2Fbackgrounds`). 바꾸려면 아래 require만.

export type DefaultBackground = {
  id: string;
  source: number; // require() 결과 (React Native 이미지 소스)
};

export const DEFAULT_BACKGROUNDS: DefaultBackground[] = [
  { id: 'river-dawn', source: require('../../assets/backgrounds/bg-1-river-dawn.png') },
  { id: 'coast-road', source: require('../../assets/backgrounds/bg-2-coast-road.png') },
  { id: 'track', source: require('../../assets/backgrounds/bg-3-track.png') },
  { id: 'bridge', source: require('../../assets/backgrounds/bg-4-bridge.png') },
  { id: 'quail-hill', source: require('../../assets/backgrounds/bg-5-quail-hill.png') },
  { id: 'avenue', source: require('../../assets/backgrounds/bg-6-avenue.png') },
];
