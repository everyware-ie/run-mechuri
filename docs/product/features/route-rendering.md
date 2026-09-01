# 경로 렌더링

- FRD: ../../specs/frd/route-rendering.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/modules/route-renderer`에 AVFoundation 기반 로컬 네이티브 모듈을 만들었다. **v0 스코프 — 관통용, 품질 기준(§10) 대상 아님.**

- 접근: 실시간 화면 캡처가 아니라 프레임을 하나씩 그려 `AVAssetWriter`로 인코딩 (2026-08-16 mp4 스파이크 테스트에서 실시간 캡처가 배경 합성과 함께 무너지는 것을 확인하고 전환하기로 한 방향, `docs/ideation/JiEung2/2026-08-16-mp4-export-spike-test-and-pivot.md`)
- §4 프레이밍: 회전 0(북쪽이 위), cos(위도) 보정한 투영, 짧은 축 기준 8% 여백에 맞춰 크기·위치 자동 계산
- §5-1 출력: 12초 고정(그리기 9초 + 정지 3초), §5-4에 따라 진행률은 거리(호 길이) 기준으로 계산 (점 인덱스 아님 — 이 FRD 항목 자체가 route-rendering.md §5-4의 실제 버그 발견에서 나옴)
- §9 출력 규격: 1080×1920, 30fps, mp4(H.264)
- §6 프리셋 3개(기본 드로잉·불빛 러너·구간 점등) 전부 구현 (2026-08-31, 결과물 편집 화면과 함께). 구간 점등은 v0 단순화 있음 — [결과물 편집 노트](result-editing.md) 참고
- result-editing FRD §4의 사용자 변형값(위치·크기·회전)을 초기값 위에 적용하는 `applyTransform` 추가
- §3 다듬기(직선/코너 두 축, RDP 단순화 + 모서리 라운딩) 구현. `applySmoothing`을 `projectPoints`
  다음 `applyTransform` 이전에 적용 — 자세한 내용은 [결과물 편집 노트](result-editing.md) §5 참고
- §7 각인(거리·시간·페이스·심박) 구현. `drawStamps` — 마찬가지로 [결과물 편집 노트](result-editing.md)
  §7 참고. §7-3 "거리는 그려진 선 길이가 아니라 기록된 총 거리"를 그대로 지킴
- §8 합성 순서(배경 → 경로 → 각인) 지킴

### 미리보기 렌더: react-native-svg → react-native-skia (2026-08-31)

편집 중 실시간 미리보기(`frontend/src/components/route-preview.tsx`·`route-thumbnail.tsx`)를
react-native-svg에서 **react-native-skia**로 바꿨다.

- **왜**: "3안" 시안의 경로 그림은 `<canvas>` 2D(`shadowBlur` 네온 글로우, 지나온 길·최근 잔광·머리
  점, 구간 반짝임)로 그려졌는데, svg `FeGaussianBlur` 필터로는 그 느낌이 안 나왔다. 또 프레임마다
  SVG `<Path>`를 통째로 다시 그리는 비용이 커서 실기기에서 렉이 걸렸다(dev 빌드에서 특히)
- **어떻게**: Skia는 canvas와 같은 엔진 계열이라 시안 `paint()` 레이어 구성을 거의 그대로 옮겼다.
  글로우는 `<Shadow dx=0 dy=0 blur=r color=#FF5A2B>`, 부분 경로는 기존 `pointsUpToDistance` 슬라이스를
  `Skia.Path.MakeFromSVGString`으로. 팔레트: 선 `#FFF3EC`, 글로우 `#FF5A2B`, 옅은 원본 `rgba(237,241,245,.13)`
- **각인 텍스트는 여전히 SVG 오버레이** — 로드된 JetBrains Mono를 또렷하게 쓰려고. Skia `Canvas` 위에
  절대 위치 `<Svg>`를 얹는다
- **Swift 렌더러(`modules/route-renderer`)는 아직 안 맞춤** — CoreGraphics `setShadow`로 같은 값을 맞출
  수 있지만 이번엔 미리보기만. 최종 mp4와 미리보기의 글로우가 다를 수 있음(어긋남 기록에 남김)
- **의존성 추가**: `@shopify/react-native-skia` — 커스텀 네이티브 모듈이라 `expo prebuild` + 재빌드 필요.
  reanimated 4/worklets는 이미 있었음(Skia가 요구). babel 설정은 babel-preset-expo가 자동 처리

**아직 안 한 것(관통 이후 과제)**:
- §3-3 왕복 겹침 처리
- §7-5 안전 영역 수치 실기기 확인(`[확인 필요]` — 상단 14%·하단 20% 제안값 그대로 씀)
- §8 배경이 영상일 때의 처리
- §10 품질 판정(선 굵기·대비 등) — 이건 실제 GPX로 3주차에
- 각인 텍스트 폰트: 미리보기(SVG, JetBrains Mono)와 최종 렌더러(Swift, 시스템 모노스페이스)가
  다른 폰트를 씀 — 네이티브 자산 파이프라인에 폰트 파일을 아직 안 넣어서. 프리셋 글로우 반경
  근사와 같은 종류의 v0 타협

## 어긋남 기록

- **미리보기(Skia)와 최종 mp4(Swift CoreGraphics)의 글로우가 아직 다르다** (2026-08-31). 미리보기를 시안
  canvas에 맞췄는데 Swift `RouteRendererModule.swift`의 `strokePath` 글로우 반경·레이어는 그대로 — 실기기
  확인 후 Swift도 같은 값으로 맞춰야 한다
