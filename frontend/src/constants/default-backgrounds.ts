// FRD: docs/specs/frd/background-selection.md §2
// 기본 이미지 6장. 9:16(1080×1920) PNG, 앱에 함께 넣어 배포(서버 다운로드 없음).
//
// 2026-10-21에 3장(아침/점심/저녁 단색 그라디언트)에서 러닝 풍경 6장으로 교체했다.
// 전부 코드로 생성한 이미지라 저작권 문제가 없다(scripts/mockups/gen_run*.py).
// label은 편집 화면의 배경 칸과 내 스타일 시트에 보인다.
// 기존 배포 배경 3장은 저장한 결과물·내 스타일을 복원할 때만 사용한다.
// 파일명은 ASCII만 쓴다 — Metro 에셋 서버가 한글 경로를 URL 인코딩한 채 디코드하지
// 못해 이미지를 못 불러온다(ENOENT `.%2Fassets%2Fbackgrounds`). 바꾸려면 아래 require만.

export type DefaultBackground = {
  id: string;
  label: string;
  source: number; // require() 결과 (React Native 이미지 소스)
};

export const DEFAULT_BACKGROUNDS: DefaultBackground[] = [
  { id: 'river-dawn', label: '새벽 강변', source: require('../../assets/backgrounds/bg-1-river-dawn.png') },
  { id: 'coast-road', label: '해안 도로', source: require('../../assets/backgrounds/bg-2-coast-road.png') },
  { id: 'track', label: '트랙', source: require('../../assets/backgrounds/bg-3-track.png') },
  { id: 'bridge', label: '다리', source: require('../../assets/backgrounds/bg-4-bridge.png') },
  { id: 'quail-hill', label: '메추리 언덕', source: require('../../assets/backgrounds/bg-5-quail-hill.png') },
  { id: 'avenue', label: '가로수길', source: require('../../assets/backgrounds/bg-6-avenue.png') },
];

// Keep the IDs and original asset mapping from the releases before build 42.
// These are deliberately excluded from the new-background picker.
const LEGACY_BACKGROUNDS: DefaultBackground[] = [
  { id: 'morning', label: '아침', source: require('../../assets/backgrounds/morning-1.png') },
  { id: 'noon', label: '점심', source: require('../../assets/backgrounds/noon-3.png') },
  { id: 'evening', label: '저녁', source: require('../../assets/backgrounds/evening-3.png') },
];
const RESTORABLE_BACKGROUNDS = [...DEFAULT_BACKGROUNDS, ...LEGACY_BACKGROUNDS];
export function findDefaultBackground(id?: string | null): DefaultBackground | undefined {
  return RESTORABLE_BACKGROUNDS.find(bg => bg.id === id);
}
export function defaultBackgroundForPath(path?: string | null): DefaultBackground | undefined {
  return RESTORABLE_BACKGROUNDS.find(bg => path?.endsWith(`/backgrounds/${bg.id}.jpg`));
}
