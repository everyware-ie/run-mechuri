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

### 인코딩 퍼센트가 오르내리던 문제 (2026-09-08, 실기기 피드백)

"동영상 만들 때 퍼센트가 늘었다 줄었다한다"는 신고. 프레임 루프(`writeClip`)는
`progress = frameIndex / totalFrames`로 한 호출 안에서는 절대 거꾸로 가지 않으므로,
계산 문제가 아니라 **렌더가 두 개 동시에 도는 문제**라고 먼저 추론했다.

원인: 인코딩 중 뒤로 가서 편집 화면에서 "다음"을 다시 누르면 `share.tsx`가
`router.push('/share')`로 새 인스턴스를 쌓는데(§2-3 "화면을 벗어나도 계속"이 의도된
동작이라 이전 인스턴스는 언마운트되지 않고 그대로 스택에 남는다), 이전 `renderClip`
호출을 멈출 방법이 없어서 새 `renderClip`이 하나 더 시작돼 두 개가 동시에 프레임을
그렸다. `isCancelled` 플래그는 모듈 인스턴스 하나에 하나뿐이라(위 §2-3 노트의
"한 번에 렌더 하나만 돈다는 전제") 취소 버튼 용도로만 쓸 수 있고 이 케이스는
구분하지 못했다. 새 화면의 `onRenderProgress` 리스너는 두 렌더의 이벤트를 구분 없이
받아, 최신 렌더(낮은 값)와 이전 렌더(더 진행된 값)가 번갈아 도착해 퍼센트가
오르내리는 것처럼 보인 것.

고침 (둘 다 필요, 하나만으로는 불충분):

- **네이티브**: `RouteRendererModule.swift`에 `currentGeneration` 카운터 추가.
  `renderClip` 호출마다 증가시키고 프레임 루프·버퍼 대기 루프 양쪽에서 자기 세대와
  비교 — 더 새 요청이 시작되면 이전 세대는 다음 프레임에서 스스로 멈추고
  `RouteRendererError.cancelled`를 던진다(취소 버튼과 같은 처리 — 조용히 멈추고
  미완성 파일 삭제)
- **JS**: 네이티브가 멈춰도 이전 `share.tsx` 인스턴스의 `.then`/`.catch` 클로저는
  여전히 살아있어서(언마운트되지 않았으므로) 그 결과가 도착하면 이미 최신 화면이
  떠 있는데 `router.back()`이나 "결과물을 만들지 못했어요" `Alert`가 튀어나올 수
  있었다. `share.tsx`에 모듈 스코프 `activeShareGeneration` 카운터를 두고, `.then`·
  `.catch` 진입 시 자기 세대가 최신이 아니면 아무것도 안 하고 조용히 리턴하게 함

### 완성 화면 다듬기 (§4, 목업 구현 5/6)

- `share.tsx`의 완성 화면을 "3안" 시안 S8b(공유 카드)에 맞췄다: 파일 경로 텍스트(개발용)를 빼고, 배경 위에 완주 시점 경로·각인을 얹은 카드(`RouteThumbnail`, 300px) + 거리 + 러닝한 날을 둔다. 보관함 상세(`result/[id].tsx`)와 같은 구성 — "완성됐고 이게 보관함에 이렇게 남는다"가 바로 읽힌다
- 동작(§2 인코딩·§4 기기 저장·§2-4 실패·F1·F2)은 그대로. 표시만 바꿈
- **"인스타그램 스토리" 버튼**은 §3 착수(아래 절)에서 완성 카드에 추가했다

### 인스타그램 스토리 공유 착수 (§3, 2026-09-08)

`JiEung2/feature/instagram-story-share` 브랜치에서 시작. FRD §3-1이 "공식 공유 API"로만 열어둔
구현 세부를 이번에 정했다.

- ~~**막힌 전제조건**~~ → **해소됨 (2026-09-08).** §3-1 `[확인 필요]`였던 Facebook App ID를
  Meta for Developers 앱 등록으로 받았다(`1057312323881185`, PRD 502행 스토어 제출물 트랙
  항목과 동일 건). `InstagramStoryShareModule.swift`의 `facebookAppID` 상수에 반영
- **실기기 검증 1차 실패 → 경로 형식 버그 발견 (2026-09-08).** "인스타그램으로 보내지 못했어요"로
  항상 실패. 원인은 `RouteRenderer.renderClip`이 돌려주는 `outputPath`가 순수 파일 경로가 아니라
  `outputURL.absoluteString`("file:///..." URI 문자열)인데, `shareToStory`가 이걸
  `URL(fileURLWithPath:)`에 그대로 넣어서 "file://"까지 경로의 일부로 오인해 깨진 경로가 됐다 —
  `Data(contentsOf:)`가 항상 실패해 App ID·인스타 설치 여부와 무관하게 매번 `videoNotFound`가
  떨어진 것. `URL(string: videoPath)`로 고침(이미 완전한 URI 문자열이므로 파싱만 하면 됨)
- **실기기 검증 2차 실패 → "이 앱은 현재 스토리에 공유하는 기능을 지원하지 않습니다"가 계속 뜸
  (2026-09-08).** 위 경로 버그를 고친 뒤에도 인스타그램이 URL 스킴은 받되(화면 전환은 됨)
  pasteboard 내용을 계속 거부했다. Meta 대시보드에서 iOS 플랫폼(번들 ID)을 등록하고, 앱이
  개발 모드라 "Instagram 테스터"로 자기 계정을 초대·수락까지 했는데도 한 시간 넘게 동일 증상 —
  계정·등록 설정 문제가 아니라 **`com.instagram.sharedSticker.backgroundVideo` 키 자체가 이
  경로로는 안 먹히는 것으로 의심됨**(Meta가 이 키를 계속 지원하는지 확인할 공식 근거를 갖고
  있지 못함 — `[확인 필요]`). 진단 겸 폴백으로 `shareToStory`에 `backgroundImagePath` 매개변수를
  추가해 정적 배경 사진도 같이 pasteboard에 실어 보내게 함(`com.instagram.sharedSticker.backgroundImage`)
  — 이미지 키는 Meta가 오래 지원해온 경로라, 이것도 안 뜨면 계정 설정을, 이미지는 뜨는데 영상만
  안 뜨면 `backgroundVideo` 키 자체를 의심하는 쪽으로 좁힌다. **재검증 필요.** 영상 공유가
  끝내 안 되면 최후 대안은 "완주 시점 정지 이미지 공유"로 스코프를 줄이는 것(§4-1이 "클립만
  저장"을 원칙으로 하지만, 인스타 공유 한정으로는 재검토 여지 있음 — phs00 논의 필요)
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
  추가(canOpenURL이 스킴을 인식하려면 사전 선언이 있어야 함). **`FacebookAppID` Info.plist 키는
  안 넣는다** — 그건 FBSDKCoreKit(Facebook 로그인·앱 이벤트)을 쓸 때 필요한 키인데, 우리는 그
  SDK 자체를 안 쓴다. App ID는 pasteboard 페이로드(`com.instagram.sharedSticker.appID`)에만
  실려 나가고, 그 값은 Swift 상수에서 직접 읽는다

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
