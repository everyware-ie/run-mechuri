# 편집 화면 손질 (2026-09-16 결정 §4)

- FRD: ../../specs/frd/result-editing.md, ../../specs/frd/route-rendering.md, ../../specs/frd/run-record-selection.md
- 이슈: -
- 구현 상태: 진행 중

## 확인한 근거

[2026-09-16 결정](../../decisions/2026-09-16-release-and-editor-scope.md) §4 "편집 화면"을 확인하고 진행한다.
approved FRD([결과물 편집](../../specs/frd/result-editing.md), [경로 렌더링](../../specs/frd/route-rendering.md))는 이미 이 결정의 §4-2~4-4 개정을 문서에 반영해 두었다 — 이 노트는 그 코드 구현을 담는다.

## 구현 노트

### 4-1. 장소 각인이 빠져 있던 프리셋 넷 (`route-preview.tsx`, `RouteRendererModule.swift`)

`STAT_LABEL`엔 이미 `place: 'PLACE'`가 있었지만 corner·bar·rail·line 네 레이아웃의 필드 목록(`statItems`/`statOrder`/`rows`/`parts`)에 `'place'`가 아예 빠져 있어, `enabled.place`를 켜고 장소가 있어도 그 네 프리셋에서는 절대 그려지지 않았다 — "빠진 것이었다"는 회의 판단 그대로였다. 네 곳 모두 `place`를 목록에 추가했고, TS(`stampLayoutDescriptors`)·Swift(`drawStamps`) 양쪽 동일하게 고쳤다. glass·stack은 `activeItems`(제네릭 필터)를 쓰고 있어 이미 정상 동작이라 손대지 않았다.

`[확인 필요]` 정확한 폰트 크기·자리는 실기기에서 다시 볼 것 — 특히 corner의 place 값(19*u, heartRate와 같은 크기)이 긴 지명에서 얼마나 잘리는지.

### 4-2. 각인 터치 영역 축소 + 경로 그림 점선 표기

**2026-09-20 후속 QA:** 아래의 SVG AnimatedG 구현에서도 위치 이동 후 박스가 분리되는 제보가 있었다. 현재 수정은 선택 박스를 경로와 같은 Skia Group에 그리는 방식이며, [선택 박스 수정 노트](route-selection-bounds.md)에 원인·검증·남은 실기기 확인을 기록한다. 아래는 최초 구현과 당시 피드백 이력이다.

**2026-09-20 터치 영역 후속 QA:** 아래의 거리 기준 연쇄 병합은 코너의 거리와 오른쪽 통계를 다시 하나로 묶었다. 현재는 [항목별 터치 영역](stamp-hit-regions.md)으로 대체했고 글래스의 실제 카드 배경은 유지한다. 아래 설명은 최초 구현 이력이다.

**각인**: `computeStampBounds`(전체를 감싸는 envelope 하나)가 히트테스트·선택 박스에도 그대로 쓰이던 게 문제였다 — corner·rail처럼 항목이 네 귀퉁이에 흩어진 프리셋은 그 사이 빈 공간까지 "각인"으로 잡혔다. `stampNodeBoxes`(항목별 원시 박스 추출)를 공용 함수로 뽑고, `computeStampBounds`는 기존처럼 envelope 하나(썸네일 크롭에 계속 필요)를 반환하되, 새로 만든 `computeStampHitRects`는 `clusterStampBoxes`(gap=36px 이내면 한 덩어리로 묶는 union-find)로 항목을 몇 개의 사각형으로 나눠 반환한다. `edit.tsx`의 히트테스트는 이 중 **하나에라도** 들어가면 각인으로 판정하고(`hitRects.some(...)`), 선택 박스도 클러스터 개수만큼 점선 사각형을 그린다(패딩도 28→16으로 줄임).

**경로 그림**: 이전엔 "각인이 아니면 전부 경로"였고 시각적 표시가 없었다. `computeRouteHitBounds`(신규)가 투영된 점들의 캔버스 바운즈 중심에 현재 transform(위치·회전·스케일)을 Group transform과 같은 순서로 적용하고, `RoutePreview`가 이 박스를 `<G transform="rotate(...)">`로 자기 중심 기준 회전시켜 점선으로 그린다. `drawingSelected` prop(경로 탭이 활성일 때 켬, `edit.tsx`가 `!stampTargeted`로 연결)이 이를 켠다.

- **첫 구현은 축 정렬(min/max) envelope이었다 — 실기기에서 바로 잘못됐다는 게 확인됐다**(2026-09-17). 회전시키면 박스가 내용물과 같이 안 돌고, 회전한 내용을 계속 감싸느라 제자리에서 커지기만 했다(회전한 사각형의 axis-aligned envelope은 원본보다 항상 크다). `computeRouteHitBounds`가 회전값(`rotationDeg`)을 접어 없애지 않고 `{ cx, cy, width, height, rotationDeg }`(`CanvasOrientedRect`)로 그대로 들고 있게 고치고, 그리는 쪽에서 그 회전값으로 `<G transform="rotate(...)">`를 적용해 실제로 같이 돌게 했다.
- **드래그 중 박스가 안 움직이다가 뒤늦게 따라오던 문제도 고쳤다**(2026-09-17 실기기 피드백). 처음엔 커밋된 `transform`(React state)만 보고 그렸는데, 실제 경로는 Reanimated SharedValue(`tx`/`ty`/`tScale`/`tRotation`)를 UI 스레드에서 직접 읽어 리렌더 없이 매 프레임 움직인다 — 그래서 드래그 중엔 박스가 그대로 있다가 손을 뗀 뒤에야 순간 이동하듯 따라왔다. `computeRouteHitBounds`를 `computeRouteLocalBounds`로 바꿔 "돌리기 전 자기 모양"(캔버스 바운즈, transform 미적용)만 반환하게 하고, 실제 위치·회전·크기는 `route-preview.tsx` 모듈 스코프에 새로 둔 `AnimatedG`(`Reanimated.createAnimatedComponent(G)`)가 groupTransform과 **같은 SharedValue·같은 수식**을 `useAnimatedProps`로 읽어 적용한다 — 경로를 그리는 Skia Group과 박스를 그리는 SVG Group이 매 프레임 같은 값을 보므로 완전히 같이 움직인다. AnimatedG는 렌더마다 다시 만들면 마운트가 리셋돼 애니메이션이 끊기므로 반드시 모듈 스코프에서 한 번만 생성해야 한다.

### 4-3. 간결 프리셋 제거 + 원라인 문구 크기

`STAMP_LAYOUTS`(선택 목록)에서 `row`('간결') 항목을 뺐다 — 타입(`StampLayout`)과 `stampLayoutDescriptors`의 `'row'` 렌더링 분기는 남겨 뒀다. `layout` 필드가 없는 옛 저장분의 fallback(`config.layout ?? 'row'`)이 여전히 이 분기를 쓰기 때문이다. 원라인(`line`)의 문구 크기를 26→22(u)로 줄이고 `titleBaseline` 계산의 배수도 낮춰(0.85→0.7/0.75) 아래로 살짝 내렸다 — 정확한 값은 실기기 확인 전이라 TS·Swift 양쪽에 "다시 볼 것" 주석을 남겼다.

### 4-4. 도구와 안내 (`edit.tsx`)

- **스토리 안전 영역 버튼 제거**: `showSafeGuide` state와 토글 버튼(`guideToggle`)을 지우고 `showSafeAreaGuide={false}`를 고정으로 넘긴다. `SafeAreaGuide` 컴포넌트 자체(`route-preview.tsx`)는 그대로 둬서, 다시 필요해지면 값만 다시 연결하면 된다 — 결정문이 "안전 영역 자체가 아니라 토글만 없앤다"고 명시했다.
- **재생 버튼 이름**: 아이콘 옆에 "재생"/"정지" `Text`를 추가(`previewActionNamed` 스타일, 기존 `guideToggleText`/`guideToggleTextOn`은 `previewActionLabel`/`previewActionLabelOn`으로 이름을 바꿔 재사용 — 이름이 더 이상 안전 영역 토글을 가리키지 않으므로).
- **각인 초기화 신설**: `handleStampReset`을 추가해 러닝 데이터 탭에 초기화 칩(경로 탭의 `resetChip`과 같은 스타일)을 뒀다. 경로 초기화(§4-3, "되돌리는 단위는 조작뿐")와 같은 원칙으로 `position`·`scale`만 되돌리고, 켠 항목·문구·프리셋(layout)은 그대로 둔다.

### 4-5. 러닝 기록 목록 — 좌표 없는 기록을 목록에서 뺀다

`run-record-selection.md` §2-2가 실기기 피드백으로 뒤집혔다("보여주되 고를 수 없다" → "목록에서 뺀다", 상세 이유는 FRD 본문). `record-selection.tsx`에서 `visibleRuns = runs.filter(r => r.hasRoute)`를 만들어 `FlatList`엔 이것만 넘기고, `renderItem`의 `!hasRoute` 분기(점선·"좌표가 저장되어 있지 않음")를 걷어냈다(§6 실패 재시도 분기는 그대로 — 그건 선택 이후 실패라 별개). 새로 생긴 §4-1 세 번째 빈 화면("기록은 있는데 전부 좌표가 없음")과, 일부만 걸러졌을 때의 목록 하단 안내를 추가했다. `common-rules.md` §3-2(이 FRD를 예시로 들던 일반 원칙)도 함께 고쳤다 — 예시가 이제 "개별 표시 대신 집계로 알리는" 예외 사례가 됐기 때문.

## 어긋남 기록

(없음)
