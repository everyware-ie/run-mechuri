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

**아직 안 한 것**: 인스타그램 스토리 공유(§3).

## 어긋남 기록

(아직 없음)
