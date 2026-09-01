// FRD: docs/specs/frd/background-selection.md §2
// MVP 기본 이미지 3장. 9:16(1080×1920) PNG, 앱에 함께 넣어 배포(서버 다운로드 없음).
//
// phs00가 만든 후보 9장(docs/product/features/background-images.md) 중 시간대별로 하나씩
// 골랐다 — 아침/점심/저녁. 파일 자체는 frontend/assets/backgrounds/. 생성 스크립트는
// scripts/generate-backgrounds.py. 다른 버전으로 바꾸려면 아래 require 경로만 고치면 된다.

export type DefaultBackground = {
  id: string;
  label: string;
  source: number; // require() 결과 (React Native 이미지 소스)
};

export const DEFAULT_BACKGROUNDS: DefaultBackground[] = [
  {
    id: 'morning',
    label: '아침',
    source: require('../../assets/backgrounds/아침-1-빛없음.png'),
  },
  {
    id: 'noon',
    label: '점심',
    source: require('../../assets/backgrounds/점심-3-맑은한낮.png'),
  },
  {
    id: 'evening',
    label: '저녁',
    source: require('../../assets/backgrounds/저녁-3-맑은노을.png'),
  },
];
