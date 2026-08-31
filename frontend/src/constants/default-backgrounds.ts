// FRD: docs/specs/frd/background-selection.md §2
// MVP 기본 이미지 3장. 9:16, 1080x1920 이상, 앱에 함께 넣어 배포(서버 다운로드 없음).
//
// 지금은 자리표시자다 — phs00이 디자인 시스템 나온 뒤 실제 사진/일러스트로 고른다(§2-2).
// 교체 방법: 아래 세 `source`가 가리키는 파일을 실제 배경 이미지로 바꾸고,
// 파일명이 다르면 require 경로만 바꾸면 된다. 이 파일 밖의 코드는 안 건드려도 됨.

export type DefaultBackground = {
  id: string;
  label: string;
  source: number; // require() 결과 (React Native 이미지 소스)
};

// 단색 1080x1920 이미지. 로고·아이콘 파일을 배경으로 억지로 늘리면(cover)
// 형태가 이상하게 깨져서(2026-08-31 확인) 순수 단색 자리표시자로 바꿨다.
export const DEFAULT_BACKGROUNDS: DefaultBackground[] = [
  {
    id: 'placeholder-1',
    label: '기본 1 (자리표시자)',
    source: require('../../assets/images/placeholder-bg-1.png'),
  },
  {
    id: 'placeholder-2',
    label: '기본 2 (자리표시자)',
    source: require('../../assets/images/placeholder-bg-2.png'),
  },
  {
    id: 'placeholder-3',
    label: '기본 3 (자리표시자)',
    source: require('../../assets/images/placeholder-bg-3.png'),
  },
];
