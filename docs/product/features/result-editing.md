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
- **각인 프리셋**(2026-09-01 추가, 2026-09-02 라벨 정정, 2026-09-02 hero 가운데 정렬로 재조정): `StampConfig.layout` — `'row'`(가운데 한 줄, 간결) / `'hero'`(큰 거리 + 문구 + 메타, 가운데 정렬). 처음엔 각인 시트에 "배치"라는 라벨을 썼는데, 이게 위치 배치가 아니라 표현 스타일을 고르는 프리셋이라는 피드백을 받아 드로잉 프리셋과 같은 라벨 패턴("각인 프리셋 · PRESET")으로 바꿨다. 기본 'hero'. `hero`의 히어로 숫자는 거리 → 시간 → 페이스 순으로 켜진 첫 항목. TS(`StampLayerSvg`)·Swift(`drawStamps`) 양쪽 분기. `StampLayout`은 확장 가능한 유니온이라 프리셋이 늘어도 이 자리만 늘리면 됨
  - **가운데 정렬 + 숫자·단위 크기 분리**(2026-09-02): 원래 시안 S8b는 왼쪽 아래 정렬이었는데, 실물 사진 참고("비 오는 날의 한강" 캡션 + 큰 "5.23 km" + 작은 메타 줄, 전부 가운데 정렬)를 보고 그쪽으로 바꿨다. 히어로 숫자도 "5.23km"를 하나의 크기로 그리던 걸 큰 숫자("5.23") + 작은 단위(" km")로 나눠 그린다 — TS는 `splitHeroValue` + `<TSpan>`으로 한 줄 안에서 크기를 나누고, Swift는 같은 이름의 클로저로 두 크기의 폭을 각각 재서 가운데 정렬 위치를 계산한다. 정규식으로 끝의 알파벳(옵션으로 앞에 `/`)을 단위로 떼어내는 방식이라 "28:14"·"08.21"처럼 단위가 없는 값은 그대로 한 크기로 그려짐
- 값은 `StampConfig`(caption·placeName·enabled.date·enabled.place)에 담아 draft/store/preview/thumbnail/renderer로 흐른다. 기존 저장분은 렌더 시 `?? ''` / `?? false`로 방어

**아직 안 한 것**: 속도·색(§6).

### 각인 시트를 컨트롤 시트와 같은 구조로 (2026-09-02)

실기기 피드백: 각인 시트가 손잡이 없는 고정 `View`라 접을 수 없어 "화면의 반을 차지해서 각인 프리셋(간결/크게)을 눌러도 미리보기가 바뀌는 게 안 보인다"는 문제와, 항목들이 감싸는 뷰 없이 나란히 있어 "글씨가 다닥다닥 붙어있다"는 문제가 같이 있었다.

- **드래그로 접기**: 각인 시트를 컨트롤(드로잉) 시트와 똑같이 `Animated.View` + 손잡이(`sheetPanResponder`)로 바꿨다. `sheetTranslateY`·`sheetPanResponder`·`animateSheetTo`는 두 시트가 상태를 그대로 공유한다 — 컨트롤 시트가 열려 있을 때(`!stampSheetOpen`)와 각인 시트가 열려 있을 때(`stampSheetOpen`)가 배타적이라 안전하다. 이제 각인 시트도 끌어 내려 미리보기를 보면서 프리셋을 고를 수 있다
- **간격**: 각인 시트 본문을 컨트롤 시트와 같은 `sheetContent`(`paddingHorizontal:24, gap:12`)로 감쌌다. 원래 제목 행(`sheetHead`)만 따로 패딩을 갖고 나머지는 패딩·gap 없이 나란했던 걸 정리
- **인스타 스토리 영역 토글**: 오른쪽 위 고정이던 걸 가로 중앙(`alignSelf:'center'`)으로, 높이를 텍스트 패딩 대신 고정값(`height:32`)으로 바꿔 다른 버튼들과 통일

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

## 어긋남 기록

- **각인 표시 모드(§7-3 "완성 후만" 포함) 선택 UI가 없어졌다** (2026-09-01). 시안 S6에 그 UI가 없어서 뺐다. `StampConfig.mode`는 데이터에 남아 'always' 고정으로 동작. FRD §7-3을 지키려면 UI를 다시 넣거나(시안의 "자리·없음"이 hidden을 겸하는 구조로 재해석) FRD를 시안에 맞춰 개정해야 함
- **한 줄 문구·날짜·장소가 approved FRD에 없다** — route-rendering §7·result-editing §7은 각인을 넷으로 정의. 시안 S6 기준으로 구현했으니 phs00가 FRD에 반영 여부 결정
- **미리보기(Skia/SVG)와 최종 mp4(CoreGraphics)의 한 줄 문구 폰트가 다르다** — 미리보기 Space Grotesk, Swift는 시스템 폰트(번들 폰트 파이프라인 없음). 각인 항목 폰트 불일치와 같은 종류
- **각인에 크기 조정이 생겼다** (2026-09-02). approved FRD §4-2는 "각인은 끌기(위치)만 반응, 크기·회전 없음"으로 정의돼 있는데, 실기기 피드백으로 크기(scale)를 추가했다(회전은 그대로 없음). phs00가 FRD §4-2를 "위치·크기, 회전 없음"으로 개정할지 결정 필요
