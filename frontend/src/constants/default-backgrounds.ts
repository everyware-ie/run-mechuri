// FRD: docs/specs/frd/background-selection.md §2
// MVP 기본 이미지 3장. 9:16(1080×1920) PNG, 앱에 함께 넣어 배포(서버 다운로드 없음).
//
// phs00가 만든 후보 9장(docs/product/features/background-images.md) 중 시간대별로 하나씩
// 골랐다 — morning-1(빛없음)/noon-3(맑은한낮)/evening-3(맑은노을). 파일 자체는
// frontend/assets/backgrounds/. 생성 스크립트는 scripts/generate-backgrounds.py.
// 파일명은 ASCII만 쓴다 — Metro 에셋 서버가 한글 경로를 URL 인코딩한 채 디코드하지
// 못해 이미지를 못 불러온다(ENOENT `.%2Fassets%2Fbackgrounds`). 바꾸려면 아래 require만.

export type DefaultBackground = {
  id: string;
  label: string;
  source: number; // require() 결과 (React Native 이미지 소스)
};

export const DEFAULT_BACKGROUNDS: DefaultBackground[] = [
  {
    id: 'morning',
    label: '아침',
    source: require('../../assets/backgrounds/morning-1.png'),
  },
  {
    id: 'noon',
    label: '점심',
    source: require('../../assets/backgrounds/noon-3.png'),
  },
  {
    id: 'evening',
    label: '저녁',
    source: require('../../assets/backgrounds/evening-3.png'),
  },
];
