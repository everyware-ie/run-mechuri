# 내보내기·공유·저장

- FRD: ../../specs/frd/export-and-share.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/src/app/share.tsx`. v0는 §4 기기 저장까지만 — §3 인스타그램 공유는 4단계(인스타 네이티브 브릿지) 이후.

- **완성 시점 = 인코딩 완료 시점**으로 설계함 (화면 진입 시점이 아님). S8 리뷰에서 나온 "취소하면 보관함에 뭐가 남나" 모호함을 처음부터 이렇게 만들어서 피함 — `renderClip`이 성공적으로 끝난 뒤에만 `addResult`로 보관함에 추가
- 기기 저장은 `expo-media-library`의 `saveToLibraryAsync` 사용. `app.json`에 `NSPhotoLibraryAddUsageDescription`(add-only 권한) 추가

### 인코딩 진행률 + 취소 (§2-3, 목업 구현 4/6)

- **대기 표시 타이밍**(common-rules §6): 0.3초 뒤 스피너, 한 번 뜨면 최소 0.5초 유지, 2초 넘기면 진행률·취소로 전환. `share.tsx`의 `uiPhase`(hidden/spinner/progress) + `shownAtRef`(최소 유지 시간 계산)로 구현. 인코딩이 0.3초 안에 끝나면 아무 표시도 없이 바로 완성 화면으로 넘어간다
- **진행률 이벤트**: `RouteRendererModule.swift`의 `writeClip` 프레임 루프에서 `Events("onRenderProgress")`로 6프레임(30fps 기준 초당 5회)마다 `sendEvent`. JS는 `RouteRenderer.addListener('onRenderProgress', ...)`로 구독(Expo Modules API `NativeModule<TEventsMap>` 패턴, [모듈 이벤트 문서](https://docs.expo.dev/modules/module-api/) 확인 후 이식 — `AGENTS.md`가 요구하는 버전 문서 확인 절차)
- **취소**: `Function("cancelRender")`가 모듈 인스턴스의 `isCancelled` 플래그를 세우고, 프레임 루프가 매 프레임 이 플래그를 확인해 `writer.cancelWriting()` + 미완성 파일 삭제 후 `RouteRendererError.cancelled`를 던진다. 이 앱은 한 번에 렌더 하나만 돈다는 전제라 작업별 취소 토큰 없이 인스턴스 플래그 하나로 충분하다고 판단함
- **F1·F2 (취소·실패 시 편집값 유지)**: 둘 다 `router.back()`으로 편집 화면으로 돌아간다. `edit.tsx`가 진입·변경마다 초안을 계속 저장해두므로(1단계에서 만든 구조) 별도 복원 로직 없이 그대로 유지된다. 취소는 사용자가 직접 누른 거라 안내 없이 조용히 돌아가고, 실패는 `Alert.alert`로 이유를 알린 뒤 돌아간다(F3 재시도는 별도 버튼 없이 편집 화면의 "다음"을 다시 누르는 것으로 충분하다고 판단)
- **v0 근사**: 실패 원인은 세분화하지 않는다(§2-4가 구분하는 "저장 공간 부족" 등은 Swift `RouteRendererError`의 일반 메시지로 뭉뚱그려짐). 인코딩 소요 시간 자체가 `[확인 필요]`(FRD 명시)라 0.3/0.5/2초 수치는 실기기 확인 전 제안값 그대로 씀

### 완성 화면 다듬기 (§4, 목업 구현 5/6)

- `share.tsx`의 완성 화면을 "3안" 시안 S8b(공유 카드)에 맞췄다: 파일 경로 텍스트(개발용)를 빼고, 배경 위에 완주 시점 경로·각인을 얹은 카드(`RouteThumbnail`, 300px) + 거리 + 러닝한 날을 둔다. 보관함 상세(`result/[id].tsx`)와 같은 구성 — "완성됐고 이게 보관함에 이렇게 남는다"가 바로 읽힌다
- 동작(§2 인코딩·§4 기기 저장·§2-4 실패·F1·F2)은 그대로. 표시만 바꿈
- **"인스타그램 스토리" 버튼은 아직 안 넣었다** — 브릿지(4단계) 없이 누를 데가 없어서, §3이 붙을 때 카드 아래 버튼 행으로 추가한다

### `[확인 필요]` 한 줄 문구(캡션)

"3안" 시안 S8b·S6에는 결과물에 얹는 **자유 텍스트 한 줄("한 줄 문구")**이 있는데, export-and-share FRD에도 result-editing FRD에도 이 항목이 없다. PRD [§11 미결](../../specs/prd/running-drawing-mvp.md)의 "재방문 유인" 절은 "결과물에 누적 거리 한 줄 새기기" 같은 텍스트 후보를 오히려 약하게 봤다(각인이 그 자리를 이미 맡음). 시안에 있다는 이유만으로 코드에 넣으면 스펙이 조용히 제품 정의를 바꾸는 게 된다(CLAUDE.md 정합성 규칙 2). **phs00가 export-and-share FRD에 올릴지 결정한 뒤 구현한다.** 결정되면 각인과 나란한 렌더 파라미터로 붙이면 된다(`RouteRendererModule` `caption` 필드 + `route-preview.tsx` CaptionLayer + `edit.tsx` 입력 + draft/results 저장).

## 어긋남 기록

- **시안 S9 "설정" 화면이 approved FRD에 없다.** 연결·기본값·전체 삭제를 담은 화면인데 어느 FRD에도 설정 화면 정의가 없다. 6단계로 넘어가기 전에 phs00 확인 필요
- **시안 S8a "인코딩 실패 → 다시 시도" 버튼.** 현재 구현은 실패 시 `Alert` 후 편집 화면으로 돌아가 "다음"을 다시 누르는 것으로 재시도(§2-4 F3). 시안은 별도 "다시 시도" 버튼을 뒀다 — 어느 쪽이 맞는지 확인 필요
