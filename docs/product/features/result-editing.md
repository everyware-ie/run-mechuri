# 결과물 편집

- FRD: ../../specs/frd/result-editing.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/src/app/edit.tsx`. 프리셋 선택(§3), 드로잉 크기·위치·회전 제스처+초기화(§4), 미리보기 재생 규칙(§2-1), 다듬기 세기(§5), 각인 편집(§7)까지 구현(목업 구현 3/6). 속도·색(§6, 여유 시)은 이후.

### 다듬기 세기 (§5)

`frontend/src/lib/route-smoothing.ts` — 중복 제거 → 이동평균(직선 다듬기) → RDP 단순화 → 모서리 라운딩(2차 베지어) 파이프라인. 값은 0~100 두 축(`smooth`=직선, `corner`=모서리).

- **UI는 두 축을 바로 노출**: "직접 다듬기(SMOOTH)"·"코너 반경(CORNER)" 슬라이더 둘을 편집 화면에 바로 둔다. **§5 "기본은 한 축이다"와 다르다** — "3안" 시안 S7이 두 슬라이더를 직접 노출하고 있어(2026-08-31 시안 반영) 그쪽에 맞췄다. `[확인 필요]` 한 축(간단) vs 두 축(시안) — phs00가 §5를 시안에 맞춰 개정할지 결정. 이전 구현의 "고급 설정 열기" 토글은 제거됨
- **각인 편집은 시트로**: 시안 S7엔 드로잉/각인 토글이 없다 — [각인] 버튼이 하단 시트(S6)를 열고, 시트가 열려 있는 동안만 미리보기에서 각인 묶음을 끌어 옮길 수 있다. 시트는 미리보기를 가리지 않도록 하단 패널로 띄운다
- **슬라이더**: 의존성 추가 없이 `frontend/src/components/slider.tsx`(PanResponder 직접 구현, edit.tsx의 드로잉 제스처와 같은 패턴)
- **적용 위치**: 그룹 변형(scale/rotate/translate) *이전*, 캔버스 좌표계에서 적용 — 미리보기는 `route-preview.tsx`가 SVG `<G transform>`으로 변형을 씌우기 전에 다듬기를 먼저 적용하고, Swift도 `projectPoints` → `applySmoothing` → `applyTransform` 순서를 그대로 맞췄다(순서가 어긋나면 확대할 때 "다듬기 세기"가 화면상에서 달라 보인다)
- **거리 재계산**: 다듬기가 점 개수·위치를 바꾸므로 원본 위경도 기반 누적 거리(§5-4 진행률 계산용)와 대응이 깨진다. 캔버스 유클리드 거리로 다시 계산하는 `cumulativeCanvasDistances`(TS)/`cumulativeCanvasDistances`(Swift)를 새로 두었다. §5-4 진행률은 항상 `total * fraction` 비율로만 쓰이므로 균일 변형(스케일 포함)에도 비율이 보존돼 문제없다
- **안전 구간**(§5 "슬라이더 범위 자체가 안전 구간이다"): RDP·라운딩 둘 다 원래 점 사이의 형태만 바꿀 뿐 지나온 영역 밖으로 크게 벗어나지 않는 성질이 자연히 유지된다 — 경고·차단 UI 없음
- **값 저장**: `CreationDraft`·`Draft`(draft-store)·`SavedResult`(results-store) 모두에 `smoothOptions` 추가. 기존(v1/v2) 저장분엔 없는 필드라 읽을 때 `IDENTITY_SMOOTH`(0/0)로 기본값을 채운다
- **초기화(§4-3) 대상 아님**: "되돌리는 단위는 드로잉 조작뿐"이라 `handleReset`은 `transform`만 되돌리고 `smoothOptions`는 건드리지 않는다

### 왜 렌더러와 별개의 미리보기 경로가 필요한가

§2-2 "모든 조작은 즉시 미리보기에 반영된다"는 걸, AVFoundation으로 mp4를 통째로 굽는 지금 렌더러로는 만족할 수 없다(제스처마다 재인코딩은 불가능). 그래서 두 경로로 나눴다.

- **최종 출력**: `frontend/modules/route-renderer`(Swift, AVAssetWriter) — 그대로 유지
- **실시간 미리보기**: `frontend/src/components/route-preview.tsx`(react-native-svg) — RN 쪽에서 직접 그림

두 경로가 같은 투영 공식을 쓰도록 `frontend/src/lib/route-projection.ts`(TS)와 Swift의 `projectPoints`가 동일한 로직(cos(위도) 보정, 8% 여백, 캔버스 1080x1920)을 각자 구현했다. **로직이 두 언어에 중복돼 있다** — 한쪽만 고치면 미리보기와 결과물이 어긋난다. 어긋남 발견 시 아래 "어긋남 기록"에 남길 것.

### 제스처

`PanResponder`(React Native 코어, `react-native-gesture-handler`/Reanimated worklet 안 씀)로 끌기(이동)·두 손가락(핀치=크기, 비틀기=회전)을 한 핸들러에서 처리. §4-2 제스처 매핑 그대로.

### 변형값 전달

편집에서 만든 `RouteTransform`(x/y/scale/rotationDeg)을 `share.tsx`가 최종 `renderClip` 호출에 그대로 넘긴다. 렌더러 초기값(§4 회전0·화면맞춤·가운데) 위에 사용자 변형을 곱하는 방식 — 미리보기 SVG의 변형 순서(스케일→회전→이동)와 Swift `applyTransform`을 동일하게 맞춤.

### 프리셋 3개 — 2026-08-04 목업 그대로 이식

`docs/ideation/JiEung2/2026-08-04-route-overlay-mockup.html`(캔버스 기반 프리셋 5개 비교 목업)의 실제 드로잉 로직·색상을 그대로 옮겼다. 처음엔 임의로 흰색 단순 버전으로 짰다가(2026-08-31), "기존 UI를 안 따라간다"는 피드백을 받고 목업을 다시 확인해 정정했다.

- **팔레트**: 옅은 흰색(`rgba(255,255,255,.2)`, 다듬지 않은 전체 경로용) · 따뜻한 흰색 `#FFF3EC`(그려진 선) · 주황 글로우 `#FF6B4A`(발광)
- **기본 드로잉**(§6-1): `#FFF3EC` + 옅은 흰 글로우
- **불빛 러너**(§6-2): 옅은 전체 경로 + 지나온 길(중간 밝기) + 최근 10%(거리 기준) 핫 트레일 + 머리 위 발광 점. 완주 시 전체 경로가 밝아짐
- **구간 점등**(§6-3): 옅은 전체 경로 위에 구간별로 쌓아 그림 — 완료된 구간은 밝고(+짧은 반짝임 감쇠), 그리는 중인 구간은 중간 밝기. 목업은 구간 수를 `ceil(총 km)`로 단순 계산했지만, 우리는 FRD §6-3 제안 표(`segmentUnitMeters`, 점등 5~8회 목표)를 그대로 씀 — 목업보다 더 정밀한 부분
- SVG는 `filter`(`feGaussianBlur`+`feMerge`)로 글로우 근사, Swift는 `CGContext.setShadow`로 동일 효과. 둘 다 같은 반경·색을 쓰도록 맞춤

**v0 남은 근사**: 구간 점등의 완료 반짝임 감쇠 계수(14)는 목업 값을 그대로 가져온 것으로 3주차 실측 후 조정 가능

### 각인 편집 (§7)

값 계산·표기는 `frontend/src/lib/stamp-format.ts`(TS)에 common-rules FRD §7 표기 규칙(거리 소수 둘째 자리 km, 분'초"/km 페이스, mm:ss/h:mm:ss 시간, bpm 심박) 그대로 구현. Swift는 `RouteRendererModule.swift`의 `formatDistanceKm`/`formatDuration`/`formatPace`/`formatHeartRate`에 같은 규칙을 이식.

- **하나의 묶음**(§4-1 "각인 넷은 하나의 묶음"): 위치는 `StampConfig.position` 하나뿐. 항목별 개별 배치는 로드맵
- **편집 대상 고르기**(§4-1): 처음엔 각인 시트가 열려 있는 동안만 각인이 대상이 되는 방식이었다(사실상 [각인]/[완료] 버튼이 토글 역할). **2026-09-02부터는 화면에서 직접 탭한 지점으로 대상을 고른다** — 탭 지점이 각인의 대략적 영역 안이면 각인을, 아니면 드로잉을 움직인다(아래 "각인 탭-선택 + 크기 조정" 참고). §4-1 "화면에서 직접 탭해서도 고를 수 있게 한다"를 이제 만족한다
- **표시 모드**(§7-2): 항상(기본) / 완성 후만 / 숨김. 항목별 켜고 끄기(§7-4)는 칩 4개, 심박은 `averageHeartRate`가 없는 기록이면 칩 자체가 안 뜬다(§2-3 빈 자리를 안 남김)
- **값의 움직임**(§7-3): "항상" 모드는 `progressFraction`(0~1)에 따라 거리·시간이 0에서 최종값까지 카운트업. 거리는 그려진 선 길이가 아니라 `run.distanceMeters`를 씀 — 다듬기 세기를 바꿔도 표시 거리가 안 흔들림
- **페이스·심박의 근사**: FRD는 "그 구간 값"/"그 시점 bpm"을 요구하지만, `RunRecord`가 평균값(`averagePaceSecPerKm`/`averageHeartRate`)만 갖고 있어(HealthKit 브릿지가 시계열을 안 읽어옴) 두 값 다 진행 내내 평균값으로 고정 표시한다. 시계열 데이터를 나중에 붙이면 이 근사를 없앨 수 있다
- **안전 영역 가이드**(§7-1): `route-preview.tsx`의 `SafeAreaGuide` — 상단 14%·하단 20%(제안값, `[확인 필요]`) 띠를 편집 중에만 보여준다(`showSafeAreaGuide` prop, `edit.tsx`에서만 켬). 결과물(Swift 렌더러)에는 안 그림. 드로잉에도 같은 가이드가 적용됨(같은 Svg 안이라 자연히 함께 보임)
- **레이아웃**: 가로 한 줄, 하단 안전 영역 위 기본 자리(§7-5 제안 그대로)에서 사용자가 끌어서 옮긴 오프셋을 더함. 모노스페이스 가정으로 문자 수×고정폭 너비를 추정해 가운데 정렬 — TS(`route-preview.tsx` StampLayer)·Swift(`drawStamps`) 양쪽 동일 수식
- **폰트 불일치(v0 근사)**: 미리보기는 로드된 JetBrains Mono, Swift 최종 렌더러는 시스템 모노스페이스(`UIFont.monospacedSystemFont`) — 폰트 파일을 네이티브 자산으로 번들링하는 파이프라인이 아직 없어서. 프리셋 글로우 반경 근사와 같은 종류의 타협
- **값 저장**: `CreationDraft`·`Draft`·`SavedResult`에 `stampConfig` 추가, 기존 저장분은 `IDENTITY_STAMP`(항상·넷 다 켜짐·오프셋 0)로 기본값을 채움. 보관함 썸네일(`RouteThumbnail`)·결과물 상세에도 완주 시점(`progressFraction=1`) 상태로 함께 그림

### 각인 시트 재구성 + 한 줄 문구·날짜·장소 (2026-09-01, 시안 S6)

시안 S6에 맞춰 각인 시트를 다시 짰다. **이 항목들은 approved FRD(route-rendering §7·result-editing §7)에
없다 — phs00가 FRD에 반영할지 검토 요망.**

- **넣을 것 칩에 값을 함께 표시**: "거리 5.23km" "시간 28:14" "페이스 5'42"" "날짜 08.21" "장소 한강" "심박 152bpm". 켜면 accent 채움
- **날짜(date)**: `run.date`(ISO) → `formatStampDate` "MM.dd". TS·Swift 양쪽 구현
- **장소(place)**: `edit.tsx`에서 트랙 가운데 좌표를 `expo-location`의 `reverseGeocodeAsync`로 한 번 역지오코딩해 `StampConfig.placeName`에 채운다(district→city→subregion→name 순). 실패하면 빈 문자열 — 칩은 "장소"로만 보이고 켜도 안 그려진다. `expo-location` 의존성 추가(prebuild+재빌드 필요), `NSLocationWhenInUseUsageDescription` 추가
- **한 줄 문구(caption)**: `StampConfig.caption` 자유 텍스트 40자. 미리보기·썸네일·최종 mp4 모두 항목 줄 위에 Space Grotesk로 가운데 그림(Swift는 폰트 없어 시스템 폰트 대체). 빈 문자열이면 안 그림
- **표시 모드(항상/완성후만/숨김) UI 제거**: 시안 S6에 없어서 뺐다 — `mode`는 데이터엔 남아 'always' 고정. §7-3 "완성 후만"이 UI에서 사라짐 (아래 어긋남 기록)
- **"자리(위/아래/없음)" 선택기**: 시안엔 있지만 이번엔 안 만듦("자리만 빼고" 요청). 기존 자유 드래그 위치가 그대로 남음
- **각인 프리셋**(2026-09-01 추가, 2026-09-02 라벨 정정, 2026-09-02 hero 가운데 정렬로 재조정, 2026-09-02 hero 삭제): `StampConfig.layout` — 기본 `'row'`(가운데 한 줄, 간결). 처음엔 각인 시트에 "배치"라는 라벨을 썼는데, 이게 위치 배치가 아니라 표현 스타일을 고르는 프리셋이라는 피드백을 받아 드로잉 프리셋과 같은 라벨 패턴("각인 프리셋 · PRESET")으로 바꿨다. `'hero'`(큰 거리+문구+메타, 가운데 정렬)는 한동안 기본값이었으나 실기기 피드백으로 삭제됐다("크게 삭제해줘") — 옛 저장분에 `layout:'hero'`가 남아 있어도 TS(`stampLayoutDescriptors`)·Swift(`drawStamps`) 둘 다 자연히 `'row'`로 떨어진다(더 이상 분기가 없어서). `StampLayout`은 확장 가능한 유니온이라 프리셋이 늘어도 이 자리만 늘리면 됨
  - **가운데 정렬 + 숫자·단위 크기 분리**(2026-09-02): 원래 시안 S8b는 왼쪽 아래 정렬이었는데, 실물 사진 참고("비 오는 날의 한강" 캡션 + 큰 "5.23 km" + 작은 메타 줄, 전부 가운데 정렬)를 보고 그쪽으로 바꿨다. 히어로 숫자도 "5.23km"를 하나의 크기로 그리던 걸 큰 숫자("5.23") + 작은 단위(" km")로 나눠 그린다 — TS는 `splitHeroValue` + `<TSpan>`으로 한 줄 안에서 크기를 나누고, Swift는 같은 이름의 클로저로 두 크기의 폭을 각각 재서 가운데 정렬 위치를 계산한다. 정규식으로 끝의 알파벳(옵션으로 앞에 `/`)을 단위로 떼어내는 방식이라 "28:14"·"08.21"처럼 단위가 없는 값은 그대로 한 크기로 그려짐
- 값은 `StampConfig`(caption·placeName·enabled.date·enabled.place)에 담아 draft/store/preview/thumbnail/renderer로 흐른다. 기존 저장분은 렌더 시 `?? ''` / `?? false`로 방어

**아직 안 한 것**: 속도·색(§6).

### 각인 시트를 컨트롤 시트와 같은 구조로 (2026-09-02)

실기기 피드백: 각인 시트가 손잡이 없는 고정 `View`라 접을 수 없어 "화면의 반을 차지해서 각인 프리셋(간결/크게)을 눌러도 미리보기가 바뀌는 게 안 보인다"는 문제와, 항목들이 감싸는 뷰 없이 나란히 있어 "글씨가 다닥다닥 붙어있다"는 문제가 같이 있었다.

- **드래그로 접기**: 각인 시트를 컨트롤(드로잉) 시트와 똑같이 `Animated.View` + 손잡이(`sheetPanResponder`)로 바꿨다. `sheetTranslateY`·`sheetPanResponder`·`animateSheetTo`는 두 시트가 상태를 그대로 공유한다 — 컨트롤 시트가 열려 있을 때(`!stampSheetOpen`)와 각인 시트가 열려 있을 때(`stampSheetOpen`)가 배타적이라 안전하다. 이제 각인 시트도 끌어 내려 미리보기를 보면서 프리셋을 고를 수 있다
- **간격**: 각인 시트 본문을 컨트롤 시트와 같은 `sheetContent`(`paddingHorizontal:24, gap:12`)로 감쌌다. 원래 제목 행(`sheetHead`)만 따로 패딩을 갖고 나머지는 패딩·gap 없이 나란했던 걸 정리
- **인스타 스토리 영역 토글**: 오른쪽 위 고정이던 걸 가로 중앙(`alignSelf:'center'`)으로, 높이를 텍스트 패딩 대신 고정값(`height:32`)으로 바꿔 다른 버튼들과 통일

### 바텀시트를 접으면 손잡이까지 완전히 숨김 (2026-09-02)

실기기 피드백: 손잡이(위 항목의 `SHEET_PEEK_HEIGHT`)만 남기고 접는 방식은 그 손잡이 자체가 여전히 편집 화면 아래쪽을 가려서 "제대로 된 편집화면을 못 보겠다"는 문제가 있었다 — 아예 화면 밖으로 완전히 숨기고 버튼으로 다시 불러오는 쪽으로 바꿔달라는 요청.

- `sheetCollapseDistance`(끌어 내렸을 때 이동 거리)를 `SHEET_EXPANDED_HEIGHT`(고정 추정치) 대신 `max(SHEET_EXPANDED_HEIGHT, previewSize.height) + insets.bottom + 60`으로 바꿨다 — 각인 시트는 프리셋이 8개로 늘어 줄바꿈되는 등 실제 높이가 내용에 따라 달라지는데, 고정 추정치만큼만 내리면 키 큰 시트는 다 안 내려가서 살짝 보일 수 있다. `previewSize.height`(화면에서 이 시트보다 항상 큰 값)만큼 내리면 내용이 얼마나 길어지든 항상 화면 밖으로 완전히 나간다
- 접힌 동안(`sheetExpanded === false`)에만 화면 맨 아래 가운데에 "편집 도구 열기" 버튼(`sheetReopenButton`)을 띄운다 — 누르면 `animateSheetTo(true)`로 원래 상태(직전에 열려 있던 시트가 컨트롤이든 각인이든)로 되돌아온다
- `sheetExpandedRef`(제스처 핸들러용 ref)와 별개로 `sheetExpanded` state를 새로 둬서 이 버튼의 표시 여부를 리렌더에 반영한다 — ref는 렌더 중에 읽으면 안 되므로(react-hooks/refs) JSX 조건은 항상 state로 판단
- 끌어서 접고 펴는 기존 제스처(40px 임계값)는 그대로 — "접는다"의 의미만 "손잡이만 남기고 살짝"에서 "완전히 숨김"으로 바뀐 것

### 각인 시트에 키보드가 뜨면 그만큼 같이 밀어올림 (2026-09-02)

"한 줄 문구" `TextInput`에 키보드가 뜨면 입력창 자체를 가려서 뭘 쓰는지 안 보인다는 피드백. `Keyboard.addListener('keyboardWillShow'/'keyboardWillHide', ...)`(iOS 전용 — 키보드가 실제로 뜨기 *전에* 미리 알려줘서 같은 duration으로 동시에 움직일 수 있다. `keyboardDidShow`/`Did Hide`는 다 뜬 뒤에야 불려서 한 박자 늦게 따라가는 느낌이 났을 것)로 키보드 높이를 `keyboardOffset`(별도 `Animated.Value`)에 반영한다. 최종 `translateY`는 `Animated.subtract(sheetTranslateY, keyboardOffset)`(`sheetY`) — 끌기로 접고 펴는 축과 키보드로 밀어올리는 축을 분리해 두면 서로 간섭하지 않는다(끌던 도중 키보드가 뜨거나, 반대 순서로 일어나도 두 값이 각자 애니메이션되다 합쳐질 뿐이다).

### 미리보기 탭하면 바텀시트 접기 (2026-09-02)

"바텀시트 외의 화면(미리보기) 클릭하면 시트를 가려달라"는 요청. 미리보기 영역의 기존 `panResponder`(드로잉 이동·확대·회전·각인 탭-선택을 처리하는 그것)의 `onPanResponderRelease`에서, 움직인 거리가 거의 0(`|dx|<6 && |dy|<6`)인 경우만 "탭"으로 보고 `animateSheetTo(false)`를 부른다 — 실제로 끌거나 확대·회전한 제스처는 그대로 두고, 순수 탭일 때만 반응한다. 이 responder가 `previewArea`에만 붙어 있어서 자연히 "시트 바깥"의 뜻 그대로 동작한다. 위 "완전히 숨김"·"편집 도구 열기" 버튼과 같은 `sheetExpandedRef`/`animateSheetTo`를 그대로 써서 두 방식(탭·버튼)이 항상 같은 상태를 공유한다.

### 재생을 버튼으로 — 자동 반복재생 폐지 (2026-09-02)

**approved FRD §2-1 "재생"과 어긋난다 — 아래 "어긋남 기록"에도 남김.** §2-1은 "평소엔 클립을 반복 재생하고 손을 대면 멈춘다"를 요구하는데, 실기기 피드백: 재생 "중"에는 손을 안 대고 있어도 — 즉 §2-1이 "정지"로 치는 상태에서도 — 경로·각인 조작(드래그 시작 자체)이 계속 느렸다. 프리셋 3개(기본 드로잉·구간 점등·불빛 러너) 다 개선했는데도 여전했던 건, 이 느림의 근본 원인이 "손을 댔는지"가 아니라 "애니메이션이 돌고 있는지" 자체였기 때문 — Shadow 블러 등 매 프레임 다시 계산하는 비용이 터치를 받는 스레드까지 잡아먹는다(2026-09-02 앞선 blurScale 조정 항목과 같은 원인). §2-1의 "손을 대면 멈춘다"만으로는 이 비용을 못 없앤다 — 재생 자체가 조작과 자주 겹치기 때문이다.

그래서 재생을 사용자가 명시적으로 트리거하는 것으로 바꿨다 — 재생과 편집이 같이 일어나는 상황 자체를 줄이는 방향.

- `RoutePreview`에 `playing?: boolean`(기본 `true`, 안 넘기면 기존 화면은 원래 동작 그대로) prop 추가. `false`면 진행률을 강제로 1(완성 상태)로 취급하고 elapsed 타이머 자체가 안 돈다 — 보관함 썸네일이 "완성된 순간"만 보여주는 것과 같은 원칙
- `edit.tsx`는 `isPlaying` 기본 `false`(정지=완성된 모습)로 두고, 미리보기 오른쪽 아래 재생 버튼(▶/❚❚)을 눌러야 재생한다. 누르면 처음부터 한 사이클(`CYCLE_SECONDS`)만 재생하고 자동으로 다시 정지 상태로 돌아온다(타이머로 근사 — 몇 ms 어긋나도 안 보이는 용도라 RoutePreview에 별도 "재생 끝났다" 콜백을 안 늘렸다)
- light-runner는 진행률을 JS state가 아니라 `LightRunnerLayer` 내부 Reanimated `SharedValue`가 UI 스레드에서 들고 있어서, 재생을 다시 누를 때마다 `key={playToken}`으로 그 컴포넌트를 통째로 새로 마운트시켜 리셋한다(프리셋이 바뀔 때 자연히 새로 마운트되며 리셋되는 것과 같은 방식). 정지로 바뀔 때는 마운트가 유지되므로 `elapsed.value`를 완주 지점으로 직접 옮겨 다른 두 프리셋과 같은 "정지=완성" 을 맞춘다
- **알려진 린트 소음**: `elapsed.value = DRAW_SECONDS`(JS `useEffect`에서 Reanimated SharedValue에 값을 쓰는, 문서화된 정상 패턴)를 `react-hooks/immutability` 규칙이 오탐한다 — `useFrameCallback`(워클릿) 안의 같은 종류 대입은 안 걸리는 것으로 봐서 워클릿 바깥에서의 SharedValue 대입을 인식 못 하는 도구 한계로 보인다. 이 세션에서 이미 허용 중인 `react-hooks/refs` 오탐과 같은 종류

### 기본 드로잉·구간 점등도 UI 스레드로 — light-runner처럼 (2026-09-02)

재생 버튼으로 바꾼 뒤에도 "재생이 뚝뚝 끊겨 보인다"는 피드백. light-runner만 2026-09-01에 Reanimated(UI 스레드)로 옮겨져 있었고, 나머지 둘(기본 드로잉·구간 점등)은 여전히 진행률(`elapsed`)을 React state로 두고 매 프레임 `setState` → 리렌더 → Skia가 새 트리를 받는 왕복을 거치고 있었다. "왜 기본 드로잉이 더 느리다고 느꼈는지"는 코드상 셋 중 가장 가벼운데도(블러조차 없음) 이상했는데, 이 JS 왕복 자체의 프레임 드랍이 블러 없는 얇은 선에서 오히려 더 도드라져 보였을 가능성이 크다 — 재생 버튼을 눌러 놓고 계속 지켜보는 상황이 되면서 이 자잘한 끊김이 더 잘 보이게 된 것도 있을 것.

- `useUIThreadProgress(isInteracting, playing, onProgressSample)` 훅을 새로 뽑아 light-runner가 쓰던 것과 같은 패턴(`useSharedValue` + `useFrameCallback` + `useDerivedValue`)을 `DefaultDrawingLayer`·`SegmentLayer`가 공통으로 쓰게 했다(light-runner 자신은 targetDistance·잔광 등 자기만의 파생값이 많아 손대지 않고 그대로 둠). 재생을 다시 누르면(`playing`이 `false→true`) 이 훅이 직접 `elapsed.value`를 0으로 되돌린다 — light-runner처럼 `key`로 컴포넌트를 다시 마운트시키지 않아도 됨
- `SegmentLayer`가 셋 중 제일 무거웠던 이유는 매 프레임 이 함수 자체가 다시 불려 구간(Path·Circle) 배열을 통째로 새로 만들었기 때문 — 구간 하나하나의 `end`/`opacity`/`strokeWidth`/`blur`를 각자의 `useDerivedValue`로 만들어서, 진행률이 바뀌어도 네이티브 쪽에서만 값이 갱신되고 이 컴포넌트 자체는 다시 렌더링될 필요가 없게 했다
- **구간 개수는 경로마다 다른데 훅은 개수만큼 반복 호출할 수 없다**(React 훅 규칙 — 매 렌더 호출 수가 같아야 함, `.map` 안에서 훅을 부르면 안 됨). `MAX_SEGMENTS = 12`(FRD §6-3 목표 5~8회를 웃도는 여유값)만큼 항상 훅을 부르고, 실제 구간 수를 넘는 칸은 `active=false`로 표시만 안 되게 한다(끝쪽 몇 칸은 매 프레임 계산은 하지만 안 그려짐 — 안전과 성능의 절충)
- 진행률(`elapsed`)이 세 프리셋 다 이제 UI 스레드에 있어서, `RoutePreview`의 옛 JS tick 루프(`elapsed`/`frameRef`/`lastTsRef`/`accumulatedRef`, requestAnimationFrame + 30fps 스로틀)는 완전히 죽은 코드가 됐다 — 통째로 지웠다. 각인 카운트업 숫자용 진행률만 `uiStampProgress` 하나로 남았고, 세 레이어 전부 같은 `onProgressSample` 콜백으로 이 값을 채운다(어차피 한 번에 하나만 마운트되니 공유해도 안전)

### 프리셋을 고르면 한 번 자동 재생 (2026-09-02)

재생이 기본 정지로 바뀐 뒤로 "프리셋을 눌러도 뭐가 달라지는지(불빛이 달리는지, 구간이 켜지는지) 안 보인다"는 지적 — 프리셋을 고르는 순간만큼은 한 번 자동으로 재생해서 보여주기로 했다. `handlePresetSelect`에서 `commitPreset` 다음에 `setIsPlaying(true)`만 부르면 끝 — 재생 버튼을 누른 것과 똑같이 한 사이클 후 자동으로 다시 정지한다. 방금 세 프리셋 다 네이티브(UI 스레드) 렌더링으로 옮겨서, 이 자동 재생도 최대한 부드럽게 나온다.

### 재생·안내 버튼이 화면 맨 아래에 잘려 보이던 문제 (2026-09-02)

`cardHint`(끌기 안내 문구)·`playToggle`(재생 버튼)이 `previewArea` 기준 `bottom: 14`/`bottom: 8`(고정값)로 떠 있었는데, `previewArea`를 감싼 `SafeAreaView`가 `edges={['top','left','right']}`라 bottom 세이프에어리어를 안 챙긴다 — 평소엔 바텀시트가 이 자리를 덮고 있어서 안 보였지만, 시트를 접거나 완전히 숨기면(위 "완전히 숨김"·"미리보기 탭하면 접기" 항목) 이 두 요소가 화면 맨 아래(홈 인디케이터 근처)에 그대로 노출돼 기종에 따라 잘려 보였다. `sheetReopenButton`이 이미 하던 대로 `insets.bottom`을 더해 안전 영역 위로 올렸다.

### 직접 다듬기 슬라이더가 자꾸 0%로 튀던 문제 (2026-09-02)

슬라이더를 끌고 있으면 값이 자꾸 0% 쪽으로 튀었다 왔다갔다 했다는 피드백. `Slider`(slider.tsx)가 `onPanResponderMove`마다 `evt.nativeEvent.locationX`(터치가 잡힌 뷰 기준 좌표)로 값을 계산했는데, 이 슬라이더가 들어있는 바텀시트가 애니메이션 `transform`(끌어서 접고 펴기 + 키보드가 뜨면 밀어올리기, 둘 다 `translateY`)이 걸린 조상 뷰라 `locationX`가 프레임마다 다시 계산되며 값이 튀는, RN에서 알려진 문제였다. 처음 눌렀을 때 그 자리로 "점프"하는 것만 `locationX`를 쓰고, 그 이후 끄는 동안은 `gestureState.dx`(제스처 시작점부터의 누적 이동 거리 — 조상 뷰의 transform과 무관하게 항상 안정적으로 계산됨, `edit.tsx`의 경로 드래그와 같은 방식)로만 값을 계산하도록 바꿨다.

### 경로 이동·확대·회전도 네이티브(Skia Group transform)로 (2026-09-02)

"이동하는 게 뚝뚝 끊기는 건 어쩔 수 없냐"는 질문 — 그림 재생 애니메이션(위 항목들)과 달리 경로를 끌기·핀치로 움직이는 건 여전히 손가락이 움직일 때마다 `updateTransform`(React state) → `RoutePreview` 전체 리렌더 → Skia가 새 `transform` 값을 받는 왕복을 거치고 있었다. `RoutePreview`에 `transformShared?: RouteTransformShared`(x/y/scale/rotationDeg 각각 Reanimated `SharedValue`) prop을 추가해서, `edit.tsx`가 드래그 중엔 `updateTransform`을 아예 안 부르고 이 `SharedValue`들에 직접 쓴다. `RoutePreview`는 Skia `Group`의 `transform` 배열 전체를 `useDerivedValue`로 감싸 이 `SharedValue`들의 `.value`만 읽게 했다(원래 있던 pivot 보존 수식 `translate(cx+tx,cy+ty) rotate scale translate(-cx,-cy)`은 그대로, 값의 출처만 React state에서 SharedValue로 바뀜) — 리렌더 없이 네이티브 쪽에서만 갱신된다(재생 애니메이션과 같은 경로). 손을 뗄 때 그 `SharedValue`들의 마지막 값을 `transform`(state)에 한 번만 커밋한다. `transformShared`를 안 넘기는 화면(background-selection.tsx 등, 드래그 없음)을 위해 `RoutePreview` 내부에도 SharedValue를 만들어 두고 `transform` prop이 바뀔 때 거기로 동기화 — 둘 중 뭘 쓰든 파생값 계산은 하나의 코드 경로.

**알려진 린트 소음 추가분**: `transformXShared.value = ...`(JS 스레드 이벤트 핸들러에서 SharedValue에 값을 쓰는, 역시 정상 패턴)도 위 `elapsed.value = ...`와 같은 이유로 `react-hooks/immutability`가 오탐한다 — 이번 변경으로 8건 늘었다.

### 각인 드래그도 프레임당 한 번으로 묶음 (2026-09-02)

"각인(거리·정보) 옮기고 배치할 때 많이 느리다"는 별개의 피드백 — 위 재생 관련 항목과 원인이 다르다. 각인을 끌 때 손가락이 움직일 때마다(raw 터치 이벤트, 화면 프레임보다 훨씬 잦다) `updateStampConfig`를 그대로 불러서, `RoutePreview`가 매번 다시 렌더되며 `stampLayoutDescriptors`(포맷팅 함수들 + 8개 레이아웃 분기 계산)를 그때마다 다시 돌고 있었다 — §5 "직접 다듬기" 슬라이더 때(위 항목) 겪은 것과 같은 종류의 문제라 같은 해법을 그대로 적용: ref에 최신값은 즉시 반영해 다음 프레임에 쓰고, 실제 state 반영(`updateStampConfig` 호출)은 `requestAnimationFrame`으로 프레임당 한 번만 묶는다(`scheduleStampConfigUpdate`/`flushPendingStampConfig`). 손을 뗄 때는 예약된 값까지 확실히 반영한 뒤 커밋해 마지막 프레임 분이 씹히지 않게 한다.

### 각인 한 손가락 드래그를 네이티브(Animated.Value)로 (2026-09-02)

위 RAF 스로틀로도 "각인 옮기는 게 여전히 렉이 걸린다"는 후속 피드백 — `requestAnimationFrame`은 화면 프레임당 한 번으로는 묶어 줬지만, 매 프레임 여전히 `stampConfig`(React state) → `RoutePreview` 리렌더 → `stampLayoutDescriptors` 재계산이라는 왕복 자체는 남아 있었다. "이것도 네이티브로 할 수 있나?"는 질문에 — 각인은 Skia가 아니라 `react-native-svg`라 진행률 애니메이션처럼 Reanimated `SharedValue`를 프레임마다 바로 읽는 길이 없다. 대신 **바텀시트를 끌 때 이미 쓰던 것과 같은 방식**(클래식 RN `Animated.Value` + `useNativeDriver: true`, `onPanResponderMove`에서 `.setValue()` 직접 호출)을 각인에도 적용했다.

- 각인 텍스트(+선택 박스)를 안전 영역 가이드와 **별도의 `Svg`**로 뗐다 — 필터(`stampGlow`)도 그 Svg 안에 따로 둠. SVG 필터는 같은 SVG 문서 안에서만 참조되기 때문
- 이 Svg를 `stampDragOffset`(x/y 각각 `Animated.Value`) 만큼 `translateX`/`translateY`하는 `Animated.View`로 감쌌다(`RoutePreview`의 새 prop)
- `edit.tsx`는 **한 손가락 드래그(위치만)** 중엔 `stampConfig`를 아예 안 건드리고 `stampDragX/Y.setValue(...)`만 부른다 — 리렌더 자체가 없다. 손을 뗄 때만 최종 위치를 계산해 `stampConfig`에 한 번 커밋하고 오프셋을 0으로 되돌린다
- **두 손가락(핀치, 크기 조정)은 그대로 RAF 스로틀 경로**를 쓴다 — 크기까지 이 방식으로 감당하려면 폰트 재계산과 결합해야 해서 복잡도가 크고, 핀치는 위치 드래그보다 짧고 드문 제스처라 우선순위를 낮췄다. 한 손가락 드래그 도중 두 번째 손가락이 닿아 핀치로 넘어가는 순간엔 오프셋을 0으로 되돌려 이중으로 안 겹치게 함
- **알려진 린트 소음 추가분**: `stampDragX`/`Y`(`useRef(new Animated.Value(0)).current`, `sheetTranslateY`와 같은 패턴)와 그 `.setValue()` 호출이 이번 변경으로 `react-hooks/refs`·`react-hooks/immutability` 오탐을 9건 늘렸다 — 전부 이미 허용 중이던 것과 같은 두 범주

### 편집 중 미리보기 크롭을 안전 영역 기준으로 (2026-09-02)

편집 화면 미리보기(`fit="cover"`)가 9:16 캔버스 전체를 기준으로 화면을 채우다 보니, 편집 화면 뷰 비율이 9:16보다 납작해서 위아래가 꽤 잘려 나가 보인다는 피드백이 있었다. 캔버스 전체 대신 인스타 안전 영역(`SAFE_AREA_TOP/BOTTOM_RATIO` — 어차피 스토리에 올리면 프로필·답장창에 가려지는 부분)만 기준으로 화면을 채우는 `fit="cover-safe"`를 추가해 `edit.tsx`에서 씀. 잘려 나가는 부분이 "어차피 안 보이는 영역"이라 체감상 원본 그대로에 가깝다. `route-preview.tsx`의 Skia `Group transform`과 SVG `viewBox` 양쪽 다 안전 영역 기준으로 맞춰야 각인·경로가 어긋나지 않는다. 결과물(mp4)은 이 크롭과 무관하게 항상 캔버스 전체를 그린다(화면 표시 방식일 뿐).

- **가이드 토글과의 충돌 수정**(2026-09-02 추가): `SafeAreaGuide`는 캔버스 전체 기준으로 인스타 UI가 덮는 위·아래 자리(아바타·답장창 모양)까지 보여주는 건데, cover-safe는 애초에 그 부분을 화면 밖으로 잘라내 버려서 가이드를 켜도 경계선만 화면 끝에 걸치고 아바타·답장창 모양은 안 보였다("이상하게 나온다"는 피드백의 원인). 가이드가 켜져 있는 동안만 `fit`을 `'cover'`로 바꿔(끄면 다시 `'cover-safe'`) 캔버스 전체가 보이는 상태에서 가이드를 확인할 수 있게 했다. 각인 탭 히트테스트(`computeFitTransform` 호출)도 같은 상태(`showSafeGuideRef`)를 보고 fit을 맞춰야 탭 좌표가 어긋나지 않는다

### 배경 스와치 비율 (2026-09-02)

배경 선택 화면의 스와치가 가로로 납작해서(`height:64`) 9:16 세로 사진을 cover로 채우면 사진의 좁은 가로 띠만 보였다. 스와치를 사진과 같은 `aspectRatio: 9/16`으로 바꿔 cover를 유지한 채로 사진 전체 구도가 보이게 했다.

### 안전 영역 가이드 대비 강화 (2026-09-02)

밝은 배경 사진 위에서 안전 영역 가이드 점선이 흐려 보인다는 피드백 — 각인 텍스트(`glowText`)와 같은 방식으로, 굵은 검정 아웃라인을 먼저 깔고 그 위에 밝은 주황 점선을 겹치는 이중 스트로크로 바꿨다(`SafeAreaGuide`).

### 각인 탭-선택 + 크기 조정 (2026-09-02)

"각인 시트를 열어야만 위치를 옮길 수 있다"가 불편하다는 피드백과, 드로잉처럼 각인도 화면에서 직접 탭해 고르고 끌기·핀치로 위치·크기를 바꿀 수 있게 해달라는 요청.

- **탭 히트테스트**: `route-preview.tsx`에 `computeStampBounds(run, config)`를 새로 뒀다 — 각인 텍스트 레이아웃 계산(`stampLayoutDescriptors`, 그리기·바운즈 계산이 따로 놀면 어긋나서 하나로 합침)에서 대략적인 바운딩 박스를 뽑는다. `computeFitTransform(viewWidth, viewHeight, fit, bottomInset)`도 함께 분리해 `edit.tsx`가 RoutePreview와 똑같은 좌표 변환으로 탭 지점(뷰 픽셀) → 캔버스 좌표를 계산한다. `edit.tsx`의 `panResponder`가 `onPanResponderGrant`에서 이 바운즈 안인지로 그 제스처의 대상(`editTargetRef`)을 정한다 — 예전처럼 `stampSheetOpen`으로 정하지 않는다. 각인 시트는 이제 프리셋·넣을 것·한 줄 문구 같은 "값"만 편집하는 곳으로 역할이 좁혀졌다
- **선택 표시**: 탭한 지점이 각인이면 `stampTargeted` state를 켜서 `RoutePreview`의 `stampSelected` prop으로 넘긴다 — 점선 박스(주황, `computeStampBounds` 그대로)를 각인 둘레에 그려 "지금 이걸 쥐고 있다"를 보여준다. 손을 떼면 꺼짐(계속 선택 상태를 유지하는 게 아니라, 쥐고 있는 동안만)
- **크기 조정**: `StampConfig.scale`(기본 1) 추가 — 자리(`position`)는 그대로 두고 글자 크기·내부 간격에만 곱한다. 두 손가락 핀치의 거리 비율로 계산, 범위 0.5~3. **회전은 없음** — §4-2가 원래 "각인은 끌기만, 크기·회전 없음"이었는데 크기는 이번에 풀었고 회전은 그대로 안 풂(요청에 없었음) — 아래 "어긋남 기록"에 남김
- **결과물(Swift) 반영**: `RouteRendererModule.swift`의 `RenderClipOptionsInput.stampScale`(기본 1)을 추가해 `drawStamps`가 TS와 같은 배율 수식을 쓴다. `share.tsx`가 `draft.stampConfig.scale ?? 1`을 넘김 — 미리보기에서 키운 크기가 결과물에도 그대로 나옴

### 각인 프리셋 6종 추가 — 디자인 프로젝트 2a~2f 포팅 (2026-09-02)

phs00의 Claude Design 프로젝트("런 기록 카드 프리셋", `DesignSync` MCP로 읽음) TURN 02 "PHOTO OVERLAY ELEMENTS" 2a~2f를 그대로 옮겼다. row/hero는 기존 자체 제작 그대로 두고, `StampLayout`에 6개를 더해 총 8개: `stack`(2a 좌하단 스택) · `bar`(2b 하단 스탯 바) · `corner`(2c 코너 분산) · `glass`(2d 글래스 플레이트) · `rail`(2e 사이드 레일) · `line`(2f 원 라인).

- **좌표 변환**: 디자인 목업은 300x533 캔버스(9:16과 정확히 같은 비율)로 그려져 있어, 우리 캔버스(1080x1920)로 옮길 때 배율 `M = 3.6`(=1080/300)을 곱한다. 여백·자리처럼 "고정 길이"는 M만, 글자 크기·내부 간격처럼 "커지고 작아져야 하는 값"은 `M * StampConfig.scale`을 곱했다 — TS(`stampLayoutDescriptors`)·Swift(`drawStamps`) 양쪽 동일
- **세로 앵커는 시안과 다르게**: 디자인 목업은 범용 컨셉 보드라 인스타 UI가 뭘 가리는지 고려하지 않았다(예: 2a는 캔버스 맨 밑에서 26px). 우리는 §7-1 안전 영역 기준으로 다시 앵커했다(캔버스 맨 아래/맨 위 기준이 아니라 `SAFE_AREA_TOP/BOTTOM_RATIO` 선 기준) — 내부 비율·타이포는 시안 그대로, 세로 위치만 우리 쪽 제약에 맞게 조정
- **정확한 폰트 메트릭이 아니라 근사치**: 각 줄의 baseline 간격을 실제 폰트 ascent/descent 대신 근사 배수(0.85/0.92/1.05 등)로 쌓았다 — 실기기에서 보고 미세 조정이 필요할 수 있다
- **도형 추가**: `StampRectDescriptor`에 `stroke`·`fill` 옵션을 더해 `glass`의 반투명 유리판(테두리 포함, backdrop-filter blur는 SVG/CoreGraphics 둘 다 못 써서 반투명 채우기로 근사), `bar`/`line`의 구분선, `rail`의 네온 세로선을 표현
- **로고 색은 앱 팔레트로**: 시안의 라임그린(`#c9f27a`) 포인트 대신 앱 고유 accent(`GLOW`, `#FF5A2B`)를 `rail`의 세로선에 썼다 — 시안은 그 도구의 기본 팔레트일 뿐, 우리 "1a 야간 네온" 컨셉과는 별개라 브랜드 색을 그대로 유지
- **라벨 톤 구분**(`muted`): "TIME"·"DATE" 같은 라벨/날짜는 값보다 흐리게 — `StampTextDescriptor.muted`로 구분(row/hero/stack엔 없음, 이 6개 프리셋에만 있음)
- **칩 UI**: 프리셋이 2개→8개로 늘어 `edit.tsx`의 각인 프리셋 칩 줄을 `flex:1` 균등분할(`presetChip`)에서 내용만큼만 차지하고 줄바꿈되는 칩(`layoutChip`)으로 바꿨다

### 각인 텍스트 효과를 프리셋군별로 분리 (2026-09-02)

2a~2f를 포팅한 직후 실기기 피드백: "글씨 안쪽만 빛나고 겉은 새까맣게 되어 구리다, 원본처럼 해달라." row/hero는 밝은 배경 사진 위에서 흐려 보인다는 이전 실기기 피드백(2026-09)으로 어두운 굵은 외곽선(stroke, `strokeWidth: size*0.24`) + 별도 블러 사본(`stampGlow` 필터)을 겹치는 강한 처리를 쓰는데, 2a~2f 포팅 6개(stack~line)에도 그대로 씌운 게 문제였다 — 디자인 원본은 옅은 `text-shadow: 0 1px 12px rgba(0,0,0,.45)` 하나뿐이라 그 강한 외곽선과는 느낌이 완전히 다르다.

`StampLayerSvg`에서 `config.layout`이 row/hero가 아니면(`softShadow`) 굵은 외곽선 없이, 흐릿한 검정 그림자 사본(`stampGlow` 필터를 그대로 재사용하되 `fill="rgba(0,0,0,0.55)"`로 색만 바꿈) + 또렷한 글씨 두 겹만 그리도록 나눴다 — 원본의 가벼운 그림자 느낌에 더 가깝다. row/hero는 기존 강한 처리 그대로 유지(그쪽은 애초에 그 처리가 필요해서 넣은 거라).

### 드래그가 손가락 이동량보다 짧게 반영되던 문제 — 뷰 픽셀 vs 캔버스 좌표 (2026-09-02)

네이티브 드래그(경로 Skia Group transform, 각인 Animated.Value 둘 다) 실기기 피드백: "빨라지긴 했는데 내가 놓은 위치에 정확히 안 놓인다." 드래그 중 미리보기는 `gestureState.dx`/`dy`(PanResponder가 주는, **뷰 픽셀** 단위의 제스처 시작점 대비 이동량)를 그대로 오프셋으로 썼는데, 커밋 대상인 `RouteTransform.x/y`·`StampConfig.position`은 **캔버스 좌표**(1080x1920)다. 화면(뷰)이 캔버스보다 작은 비율(`fitScale`, `computeFitTransform`이 계산 — 보통 1보다 많이 작다, 화면은 point 단위인데 캔버스는 내보내기 해상도라)만큼, 뷰 픽셀을 그대로 더하면 실제로 필요한 캔버스 상 이동량보다 훨씬 적게 반영돼 손가락이 간 만큼 못 미치는 자리에 놓였다.

미리보기 자체(네이티브 오프셋)는 뷰 좌표계에서 1:1로 손가락을 따라가므로 드래그 "느낌"은 문제없었고, 그래서 손을 떼는 순간의 **최종 커밋값 계산**에서만 단위 변환이 빠져 있던 게 원인 — 아래 네 지점 모두 `gestureState.dx / fitScale`(캔버스 좌표로 환산)로 고쳤다:

- 각인 한 손가락 드래그 release 커밋
- 각인 두 손가락(핀치) 드래그 중 위치 계산(`scheduleStampConfigUpdate`)
- 경로 한 손가락 드래그 중 SharedValue 쓰기
- 경로 두 손가락(핀치+회전) 드래그 중 SharedValue 쓰기

`fitScale`은 제스처 시작(`onPanResponderGrant`)에서 각인 탭 히트테스트용으로 이미 한 번 계산하던 값이라, 같은 제스처 동안(`gestureFitScaleRef`) 재사용하도록 했다 — `previewSize`·`showSafeGuide`는 드래그 도중 안 바뀌므로 매 `move`마다 다시 계산할 필요가 없다.

### 각인을 놓은 뒤 원래 자리로 갔다가 다시 튀는 문제 (2026-09-02)

위 좌표 변환 수정 직후 실기기 피드백: "이제 놓이는 위치는 잘 나오는데, 놓고 나서 한 번 원래 자리로 갔다가 다시 놓은 자리로 이동한다." 한 손가락 각인 드래그 release 커밋 순서가 `updateStampConfig(next)`(React state, 렌더를 거쳐야 각인 Svg의 position prop에 반영) → `stampDragX/Y.setValue(0)`(Animated.Value, `useNativeDriver`라 네이티브에 즉시 반영) 순이었는데, 뒤엣것이 훨씬 빨리 화면에 반영돼 앞엣것보다 먼저 끝나 버렸다. 그 사이 한두 프레임 동안 "오프셋 0 + 아직 렌더 전인 옛 position" 조합이 잠깐 보여(=드래그 시작 전 자리), 그다음 프레임에 새 position이 실제로 렌더되면서 다시 최종(드래그로 놓은) 자리로 튀는 순서로 보인 것.

오프셋 리셋(`stampDragX/Y.setValue(0)`)을 `requestAnimationFrame`을 두 번 감싸 다음다음 프레임으로 미뤄, state 쪽 렌더가 먼저 자리 잡은 뒤에 오프셋을 지우도록 순서를 바꿨다. 한 번만 미루는 것으로도 대체로 충분하지만, 커밋이 실제 페인트까지 안 끝나는 기기가 있을 수 있어 여유를 뒀다.

### "인스타 스토리 영역" 가이드를 켜면 경로·각인이 아래로 훅 이동하던 문제 (2026-09-02)

실기기 피드백: "인스타 스토리 영역 버튼을 누르면(가이드 on) 기존 배치(경로·각인)가 아래로 내려간다, 없어도 될 것 같다." 처음엔 이걸 "미리보기 아무 데나 탭하면 시트가 접히는" 동작(§ 아래 별도 섹션)으로 잘못 짚어 그쪽을 건드렸다가, 사용자 재확인으로 바로잡았다 — 실제 원인은 `computeFitTransform`(route-preview.tsx)에 있었다.

가이드 on/off가 `fit`을 `'cover-safe'`(시트를 뺀 화면 기준) ↔ `'cover'`(가이드의 아바타·닫기·답장창을 다 보여줘야 해서 캔버스 전체 기준)로 바꾸는데, `usableHeight`(바텀시트가 가리는 만큼 뺀 높이)를 `'cover-safe'`에서만 반영하고 `'cover'`에서는 반영하지 않고 있었다. `SAFE_AREA_TOP_RATIO`와 `BOTTOM_RATIO`가 같은 값(0.17)이라 그 usableHeight 차이만 없으면 두 fit의 `offsetY` 공식이 대수적으로 같아지는데(직접 전개해서 확인), 그 차이 때문에 가이드를 켜는 순간 "시트를 뺀 화면" → "시트까지 포함한 화면 전체"로 기준 높이 자체가 갑자기 커지면서 큰 폭(체감상 수백 px)의 하향 이동으로 보였다. `'cover'`도 `'cover-safe'`와 같은 `usableHeight`를 쓰도록 맞춰서 없앴다 — `'contain'`(다른 화면들, bottomInset 안 씀)은 그대로 둬서 영향 없음. 미리보기 탭-시트-접기 기능은 원래대로 유지한다(제거하지 않음).

### 재생 버튼·안내 문구를 위로 (2026-09-02)

"끌기·이동/두 손가락" 안내 문구와 재생 버튼이 `previewArea` 기준 `bottom` 근처에 있었는데, 바텀시트(`position:absolute, bottom:0`)가 시트가 펼쳐진 대부분의 시간 동안 그 자리를 그대로 덮고 있어서 "다른 레이어랑 겹쳐서 잘 안 보인다"는 문제가 있었다 — 시트를 접어야만 보이는 상태였던 것. `guideToggle`(인스타 스토리 영역 버튼)과 같은 높이(top:14)로 올리되, 안전 영역 가이드를 켰을 때 오른쪽 위에 뜨는 "X 닫기" 자리(`SafeAreaGuide`의 `closeCx/closeCy`)와 안 겹치도록 왼쪽에 몰아 한 줄(`topLeftGroup`)로 묶었다. 가운데(guideToggle)·오른쪽 위(가이드 X 자리)는 비워 둔 채로, 시트 상태와 무관하게 항상 보인다

## 어긋남 기록

- **각인 표시 모드(§7-3 "완성 후만" 포함) 선택 UI가 없어졌다** (2026-09-01). 시안 S6에 그 UI가 없어서 뺐다. `StampConfig.mode`는 데이터에 남아 'always' 고정으로 동작. FRD §7-3을 지키려면 UI를 다시 넣거나(시안의 "자리·없음"이 hidden을 겸하는 구조로 재해석) FRD를 시안에 맞춰 개정해야 함
- **한 줄 문구·날짜·장소가 approved FRD에 없다** — route-rendering §7·result-editing §7은 각인을 넷으로 정의. 시안 S6 기준으로 구현했으니 phs00가 FRD에 반영 여부 결정
- **미리보기(Skia/SVG)와 최종 mp4(CoreGraphics)의 한 줄 문구 폰트가 다르다** — 미리보기 Space Grotesk, Swift는 시스템 폰트(번들 폰트 파이프라인 없음). 각인 항목 폰트 불일치와 같은 종류
- **각인에 크기 조정이 생겼다** (2026-09-02). approved FRD §4-2는 "각인은 끌기(위치)만 반응, 크기·회전 없음"으로 정의돼 있는데, 실기기 피드백으로 크기(scale)를 추가했다(회전은 그대로 없음). phs00가 FRD §4-2를 "위치·크기, 회전 없음"으로 개정할지 결정 필요
- **자동 반복재생이 없어지고 재생 버튼으로 바뀌었다** (2026-09-02). approved FRD §2-1 "재생"은 "평소엔 클립을 반복 재생하고 손을 대면 멈춘다"를 요구하는데, 실기기 성능 문제(재생 자체가 편집 조작과 자주 겹쳐 느려짐)로 기본을 정지(완성된 모습)로, 재생은 버튼을 눌러야만 한 사이클 도는 것으로 바꿨다. §2-1의 "다듬기는 정지 상태여야 판단이 선다"는 목적은 오히려 더 잘 지켜지지만(항상 정지가 기본이라), "평소엔 반복 재생"이라는 문구와는 정면으로 어긋난다. phs00가 FRD §2-1을 이 방식(기본 정지·재생 버튼)에 맞춰 개정할지, 성능 문제를 다른 방식(더 가벼운 렌더링 등)으로 풀어서 원래 규칙을 지킬지 결정 필요
