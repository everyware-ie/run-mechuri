# 내보내기·공유·저장

- FRD: ../../specs/frd/export-and-share.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/src/app/share.tsx`. §3 인스타그램 공유 착수(2026-09-08, 아래 절 참고).

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

### 인스타그램 스토리 공유 착수 (§3, 2026-09-08)

`JiEung2/feature/instagram-story-share` 브랜치에서 시작. FRD §3-1이 "공식 공유 API"로만 열어둔
구현 세부를 이번에 정했다.

- **막힌 전제조건**: §3-1 `[확인 필요]` 그대로 — Instagram Sharing to Stories(pasteboard 방식)는
  Meta for Developers에 앱을 등록해 얻는 **Facebook App ID**가 있어야 한다(PRD 502행에도 스토어
  제출물 트랙 항목으로 이미 적혀 있음). **등록 절차 진행 중**이라 App ID 실값이 나오기 전까지는
  브릿지의 실제 `instagram-stories://share` 호출부는 구현만 해두고 실기기 검증은 값이 나온 뒤로
  미룬다
- **배경 영상으로 넣는다** (스티커가 아니라). pasteboard의 `com.instagram.sharedSticker.backgroundVideo`
  키로 mp4 원본을 그대로 얹는다 — 결과물(mp4) 전체가 스토리 화면을 채우는 것이 목표("우와")에
  맞고, 스티커로 얹으면 사용자가 배경을 또 골라야 해서 §3-1 "원클릭" 취지와 어긋난다
- **복귀 감지는 안 한다.** 공유 API는 사용자가 실제로 게시했는지 콜백을 주지 않는다. `instagram-
  stories://share` 호출 직후를 "공유했다"로 간주하고 바로 홈(보관함)으로 보낸다(§3-3). 실제
  게시 여부와 무관하게 이 시점을 완료로 치는 근사값 — `applicationDidBecomeActive` 기반 복귀
  감지보다 구현이 단순하고, 사용자가 인스타에서 뒤로 가도 우리 쪽에서 붙잡을 방법이 어차피 없다
- **버튼 위치**: `share.tsx` 완성 카드(§4 목업 구현 5/6에서 만든 그 카드) 아래 버튼 행에
  "인스타그램 스토리로 공유"를 추가. 기기 저장 버튼과 나란히 둔다(§4-2: 저장은 곁다리가 아니라
  인스타가 있어도 쓰는 기능이므로 우선순위를 매기지 않음)
- **미설치 안내(§3-2)**: `Linking.canOpenURL('instagram-stories://share')`로 사전 확인. `false`면
  "인스타그램이 없습니다" 안내 후 기기 저장으로 유도(이미 있는 저장 버튼을 그대로 가리킴 — 별도
  화면 안 만듦)
- Info.plist(`app.json`의 `ios.infoPlist`)에 `LSApplicationQueriesSchemes: ["instagram-stories"]`
  추가 필요(canOpenURL이 스킴을 인식하려면 사전 선언이 있어야 함) + App ID 나오면 `FacebookAppID`
  키 추가

### ~~`[확인 필요]`~~ 한 줄 문구 — 넣기로 했다 (2026-09-07)

**FRD에 올렸다.** [경로 렌더링](../../specs/frd/route-rendering.md) §7-6 한 줄 문구, [결과물 편집](../../specs/frd/result-editing.md) §7 각인과 문구가 정본이다.

**넣기로 한 이유는 왕복이 번거롭기 때문이다.** 인스타 스토리 편집기에서도 글자를 얹을 수 있지만, 그러려면 우리 앱에서 다 만든 뒤 인스타에서 또 편집해야 한다. 우리 앱에서 완성해서 내보낸다.

구현할 때 볼 것 셋.

| | |
|---|---|
| 길이 | 글자 수가 아니라 **최대 3줄**로 제한한다. 크기를 줄이면 더 들어간다 |
| 위치 | **프리셋이 초기 자리를 정한다**([경로 렌더링](../../specs/frd/route-rendering.md) §6). 그 배치는 아직 `[확인 필요]`이고 그전까지는 §7-5 공통 기본값을 쓴다 |
| 폰트 | `[확인 필요]` **한글 글리프가 없다.** 디자인 시스템에 한글 폰트를 추가해야 한다 |

붙이는 자리는 앞서 적어둔 그대로다. `RouteRendererModule` `caption` 필드 + `route-preview.tsx` CaptionLayer + `edit.tsx` 입력 + draft/results 저장.

## 시안과 FRD가 어긋났던 것 — 정해졌다 (2026-09-07)

- ~~**시안 S9 "설정" 화면**~~ → **범위 제외.** 2026-09-01 회의에서 정했고 PRD §5 제외 목록에 들어갔다
- ~~**시안 S8a "인코딩 실패 → 다시 시도" 버튼**~~ → **실패 알림에서 바로 재시도한다.**

  화면을 새로 만들지도, 편집으로 돌려보내지도 않는다. 알림에 `[다시 시도] [편집으로]` 둘을 둔다.

  **실패의 대부분은 사용자 잘못이 아니다.** 메모리 부족으로 인코딩이 죽는 것이 대표적인데, 그때 편집 화면으로 던져지면 "내가 뭘 잘못 만졌나" 싶어진다. 한 번 더 누르면 되는 일에 화면을 옮기지 않는다.

  **FRD는 안 고쳤다.** §2-4가 "다시 시도하는 길을 준다"까지만 정하고 방법은 열어뒀으므로 이 구현이 그 안에 들어간다.
- ~~**시안 S0 온보딩 화면**~~ → **새로 만들 것이 없다.** [홈과 보관함](../../specs/frd/home-and-library.md) §4 "첫 실행 쇼케이스"가 그 자리다. 이름이 달라서 없는 것처럼 보였다. 범위는 여유 시
- ~~**시안 S2 연결 화면**~~ → **만들지 않는다.** [공통 규칙](../../specs/frd/common-rules.md) §1-3이 "앱을 열자마자 묻지 않는다"이고, §1-4 때문에 연결 상태를 표시할 수도 없다. HealthKit이 거부 여부를 앱에 알려주지 않기 때문이다. 빈 상태(§2-1)가 그 역할을 대신하고, **설정에서 켜고 돌아오면 자동으로 다시 조회한다**

## 어긋남 기록

- **[기기에 저장] 권한 요청이 plist와 안 맞았다** (2026-08-31, 실기기에서 발견). `share.tsx`가
  전체 접근(`requestPermissionsAsync()`)을 요청하는데 `app.json`은 add-only 문구만 넣어서 조용히
  실패. `requestPermissionsAsync(true)`(writeOnly)로 고침 — §4-3이 요구하는 "사진 쓰기"와도 일치.
  재빌드 후 검증 필요
