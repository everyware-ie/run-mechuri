# 각인 가독성 — 결과물이 편집 화면과 달라 보이던 문제

- FRD: ../../specs/frd/route-rendering.md, ../../specs/frd/result-editing.md
- 이슈: -
- 구현 상태: 진행 중

## 확인한 근거

[2026-09-16 결정](../../decisions/2026-09-16-release-and-editor-scope.md) §1 "각인 가독성이 최우선 작업이다"를 확인하고 진행한다. "글씨가 빛나는 효과가 있어서 그런지 살짝 화질이 안 좋아 보인다"(지응, 2026-09-14)는 신호가 실제 렌더러 코드에서 두 가지 원인으로 확인됐다.

## 구현 노트

### 원인 1 — 결과물(Swift)이 항상 흰색 발광으로 그리고 있었다

`route-preview.tsx`는 2026-09-02에 각인 텍스트 표현을 둘로 나눴다: `'row'`(레거시, 2026-09-16에 선택 목록에서도 빠짐)만 굵은 검정 아웃라인 + 흰색 발광(글로우)의 "강한" 처리를 쓰고, 실제로 고를 수 있는 나머지 여섯 프리셋(코너·글래스·레일·스택·스탯바·원라인)은 `rgba(0,0,0,0.55)` 검정 그림자 하나만 까는 "옅은" 처리를 쓴다(`softShadow`, `StampTextsSvg`) — "안쪽만 빛나고 겉은 새까맣게 되어 구리다"는 실기기 피드백으로 나뉜 구분이다.

**`RouteRendererModule.swift`(최종 mp4를 굽는 쪽)는 이 구분이 없었다.** `draw()`·`drawHeroValue()` 둘 다 무조건 `ctx.setShadow(color: UIColor.white, blur: 6)`를 썼다 — 즉 지금 고를 수 있는 프리셋 전부가 편집 화면 미리보기보다 결과물에서 훨씬 더 "빛나 보이게" 나오고 있었다. `stamp.stampLayout != "row"`일 때 그림자 색을 `rgba(0,0,0,0.55)`로 바꿔 미리보기와 맞췄다(`isSoftShadow`/`stampShadowColor`). 블러 반경(6)은 이미 정적 썸네일의 SVG 필터(`route-thumbnail.tsx`의 `stampGlow`, `stdDeviation="6"`)와 같은 캔버스 픽셀 단위라 손대지 않았다.

`'row'`는 렌더링 분기가 코드에 남아 있어(옛 저장분 호환, [편집 화면 노트](editor-2026-09-16-scope.md) §4-3 참고) 그 레이아웃만 기존 흰색 발광 그대로 유지했다 — 그쪽은 이번 버그의 영향을 받지 않는다.

### 원인 2 — 글씨체가 시스템 폰트로 근사돼 있었다

미리보기는 `@expo-google-fonts`로 실제 로드한 JetBrains Mono·Space Grotesk·Noto Sans KR을 쓰는데, Swift 쪽은 처음부터 "폰트 파일을 네이티브 자산으로 번들링하는 파이프라인이 아직 없어서" 시스템 모노스페이스/시스템 폰트로 근사해 뒀다([결과물 편집 구현 노트](result-editing.md) "폰트 불일치(v0 근사)").

**번들링 파이프라인을 새로 만들 필요는 없었다** — `expo-font`가 JS에서 `Font.loadAsync`를 부르면 `CTFontManagerRegisterFontsForURL`로 그 폰트를 앱 프로세스 전역에 등록한다(`node_modules/expo-font/ios/FontLoaderModule.swift`). 즉 실제 PostScript 이름을 알면 네이티브 코드에서도 바로 찾아 쓸 수 있다. 각 `.ttf`의 `name` 테이블을 직접 파싱해 정확한 이름을 확인했다:

| route-preview.tsx `family` | PostScript 이름 |
|---|---|
| `JetBrainsMono_500Medium` | `JetBrainsMono-Medium` |
| `JetBrainsMono_700Bold` | `JetBrainsMono-Bold` |
| `SpaceGrotesk_700Bold` | `SpaceGrotesk-Bold` |
| `NotoSansKR_500Medium` | `NotoSansKR-Medium` |
| `NotoSansKR_700Bold` | `NotoSansKR-Bold` |

`monoFont`·`heroValueFont`·`hangulFont` 세 헬퍼(`loadedFont` 위에 얹음)를 추가해 `UIFont(name:)`으로 찾고, 못 찾으면(등록 전 등) 기존 시스템 폰트로 그대로 폴백한다 — 실패해도 예전 동작으로 조용히 돌아갈 뿐이라 안전하다. 24곳의 `UIFont.systemFont`/`.monospacedSystemFont` 호출을 route-preview.tsx의 실제 사용처(라벨·mono 값 → JetBrains Mono, 히어로·통계 숫자 → Space Grotesk Bold, 문구 → Noto Sans KR)에 맞춰 전부 교체했다.

**실기기 확인 필요**: `CTFontManagerRegisterFontsForURL`은 프로세스 스코프 등록이라 이론상 앱이 뜬 뒤 `_layout.tsx`의 `useFonts`가 완료된 시점부터는 항상 찾아져야 하지만, 시뮬레이터/실기기에서 실제로 폰트가 바뀌어 보이는지, 등록 타이밍 관련 예외가 없는지는 빌드해서 봐야 확인된다.

## 어긋남 기록

(없음)
