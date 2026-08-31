# 내보내기·공유·저장

- FRD: ../../specs/frd/export-and-share.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/src/app/share.tsx`. v0는 §4 기기 저장까지만 — §3 인스타그램 공유는 4단계(인스타 네이티브 브릿지) 이후.

- **완성 시점 = 인코딩 완료 시점**으로 설계함 (화면 진입 시점이 아님). S8 리뷰에서 나온 "취소하면 보관함에 뭐가 남나" 모호함을 처음부터 이렇게 만들어서 피함 — `renderClip`이 성공적으로 끝난 뒤에만 `addResult`로 보관함에 추가
- 기기 저장은 `expo-media-library`의 `saveToLibraryAsync` 사용. `app.json`에 `NSPhotoLibraryAddUsageDescription`(add-only 권한) 추가

**아직 안 한 것**: 인스타그램 스토리 공유(§3), 인코딩 진행률 표시(§2-3, 공통 규칙 §6 대기 규칙), 취소(§2-3), 실패 시 편집값 유지(§2-4 — v0는 편집 자체가 없어 해당 없음).

## 어긋남 기록

(아직 없음)
