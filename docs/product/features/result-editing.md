# 결과물 편집

- FRD: ../../specs/frd/result-editing.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/src/app/edit.tsx`. 프리셋 선택(§3), 드로잉 크기·위치·회전 제스처+초기화(§4), 미리보기 재생 규칙(§2-1), 다듬기 세기(§5)까지 구현(목업 구현 2/6). 속도·색·각인(§6·§7, 전부 여유 시)은 이후.

### 다듬기 세기 (§5)

`frontend/src/lib/route-smoothing.ts` — 중복 제거 → 이동평균(직선 다듬기) → RDP 단순화 → 모서리 라운딩(2차 베지어) 파이프라인. 값은 0~100 두 축(`smooth`=직선, `corner`=모서리).

- **기본 UI는 한 축**: "다듬기 세기" 슬라이더 하나(§5 "기본은 한 축이다")가 `smooth`·`corner`를 동시에 같은 값으로 설정. "고급 설정 열기"를 누르면 두 슬라이더로 나뉜다(§5 "고급 설정을 열면 직선과 코너로 나뉘어 두 축을 따로 만진다")
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

**아직 안 한 것**: 속도·색(§6), 각인 모드·항목·위치(§7), 편집 대상 선택 레이어(§4-1, 각인 편집과 함께 붙는 것). 인스타 안전 영역 가이드(§7-1)도 각인과 함께 미착수.

## 어긋남 기록

(아직 없음)
