# 갤러리 영상 배경

- FRD: [배경 선택](../../specs/frd/background-selection.md) §1 배경의 종류, §3-1 갤러리에서 고르기, §3-3 권한, §5 영상 처리, §6 불러오기와 대기, §7 실패 / [경로 렌더링](../../specs/frd/route-rendering.md) §8 배경 합성 (`approved`)
- 근거 결정: [2026-09-08](../../decisions/2026-09-08-scope-and-roles.md) 배경 소재 3번 "갤러리에서 고른 영상"(여유 시)
- 구현 상태: **구현 완료.** 빌드 26으로 내부 테스터에게 배포했다(2026-10-03). 처리방침·FAQ도 고쳤고, 공개 링크 교체만 남았다
- 확인: 2026-10-03 사용자가 FRD 규칙표를 보고 범위를 정했다. 갤러리 영상만, 사진처럼 확대·이동, 미리보기에서 재생.

## 이어서 할 사람에게

이 노트는 인계 문서를 겸한다. 세션이 끊기면 여기부터 읽는다.

**지금 어디까지:** 구현, 실기기 확인, 빌드 26 내부 배포, 처리방침·FAQ 반영까지 끝났다. **공개 링크는 아직 빌드 25다.** 바꾸는 일은 지민이 한다.

**다음 할 일**

- [x] 1. 네이티브: 영상 준비 함수(앞 20초 잘라 보관, 첫 장면 추출, 방향 반영한 크기·길이)
- [x] 2. 네이티브: 렌더러가 프레임마다 영상 장면을 깔게 한다
- [x] 3. JS: 데이터 타입·보관·경로 복원
- [x] 4. JS: 갤러리에서 영상 고르기와 구도 조정
- [x] 5. JS: expo-video 설치, 배경 선택·편집 미리보기에서 재생
- [x] 6. JS: 공유 화면이 렌더러에 영상 정보를 넘긴다
- [x] 7. FRD §3-1 "현재 MVP는 사진만" 고치기, §1 표의 3번 범위 갱신
- [x] 8. 검사: 타입, 린트, 테스트, 문서 검사, iOS 빌드
- [x] 9. 실기기 확인(아래 "실기기 확인")
- [x] 10. PR 머지 후 빌드 26을 내부 테스터에게 배포([배포 기록](../../ops/build-and-dev-commands.md))
- [x] 11. 처리방침·FAQ에 영상을 더한다([공개 문서 기록](../../ops/public-docs-log.md))
- [ ] 12. 공개 링크를 26 이후 빌드로 바꾼다. 지민이 한다(2026-10-03 사용자)

## 코드 위치

| | |
|---|---|
| `modules/route-renderer/ios/VideoBackground.swift` | 영상 준비(`VideoBackground.prepare`)와 프레임마다 장면 꺼내기(`VideoBackgroundSource`) |
| `modules/route-renderer/ios/RouteRendererModule.swift` | `prepareVideoBackground` 등록, `backgroundVideoPath`·`backgroundVideoCrop` 옵션, 프레임 루프 연결 |
| `src/lib/background-storage.ts` | `PhotoBackground`에 `media`·`posterUri`·`durationSec`, `isVideoBackground` |
| `src/lib/video-rules.ts` | 보관 길이 20초, 3초 미만 정지 규칙, 렌더러용 자르기 영역 |
| `src/components/background-video.tsx` | 소리 없는 재생(`BackgroundVideo`), 확정한 구도대로 자른 재생(`CroppedBackgroundVideo`) |
| `src/components/photo-background-preview.tsx` | `video` 속성이 있으면 사진 대신 영상을 같은 조작으로 보여 준다 |
| `src/app/background-selection.tsx` | 갤러리에서 사진·영상 고르기, 영상 준비, 확정할 때 영상과 첫 장면 보관 |
| `src/app/edit.tsx` | 편집 미리보기에서 영상 재생 |
| `src/app/share.tsx` | 렌더러에 `backgroundVideoPath`·`backgroundVideoCrop` 전달 |

## 정한 것

| | |
|---|---|
| 범위 | **갤러리 영상만.** 촬영 영상은 녹화에 마이크 권한이 붙고 처리방침도 바뀌어서 다음으로 미룬다 |
| 구도 | **사진과 같은 확대·이동.** 사진의 구도 값(`PhotoCrop`)과 계산을 그대로 쓴다 |
| 미리보기 | **배경 선택과 편집 화면에서 소리 없이 반복 재생한다** (expo-video) |

## 설계

**데이터.** 지금 저장 필드인 `backgroundPhoto`에 `media: 'video'`, `posterUri`, `durationSec`를 더해 영상도 담는다. 초안과 보관함이 이 이름으로 기기에 저장돼 있어서 필드 이름을 바꾸지 않는다.

**첫 장면 이미지.** 영상의 첫 장면을 뽑고 사진과 같은 자르기로 1080×1920 JPEG를 만들어 `backgroundImagePath`에 넣는다. 썸네일, 보관함, 인스타 공유 배경은 이 이미지를 그대로 쓴다.

**보관.** 클립은 영상 앞에서부터 쓰므로(FRD §5-1) 원본의 앞 20초만 잘라 보관한다. 다시 인코딩하지 않는다. 긴 영상을 통째로 보관하면 용량이 커진다.

**고르기.** expo-image-picker에 `mediaTypes: ['images', 'videos']`와 `videoExportPreset: H264_1920x1080`을 준다. 원본 그대로(Passthrough) 받으면 iOS가 사진 보관함 권한을 묻는다([Expo 57 image-picker 문서](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)). FRD §3-3은 갤러리 고르기에 권한을 묻지 않으므로 압축 프리셋을 쓴다. H.264로 다시 만들면서 HDR 영상도 일반 색으로 바뀐다.

**렌더러.** `backgroundVideoPath`와 `backgroundVideoCrop`을 받는다. 영상 읽기와 함께 방향, 자르기, 1080×1920 축소, 색 공간을 한 번에 처리한다. 영상이 클립보다 짧으면 처음으로 되감고, 3초 미만이면 마지막 장면에서 멈추고, 길면 앞부분만 쓴다(FRD §5-1·§5-2). 마지막 3초를 한 장으로 재사용하던 최적화는 영상일 때 끈다. 배경이 계속 움직이기 때문이다.

**미리보기.** expo-video로 소리 없이 재생하고, 다른 앱의 음악을 끊지 않게 섞어서 재생한다(`audioMixingMode: 'mixWithOthers'`). 3초 미만이면 반복하지 않고 마지막 장면에서 멈춘다.

**구도 조정.** 사진은 손가락을 따라 이미지의 크기와 위치를 바꾼다. 영상도 처음엔 같은 방식이었는데, 실기기에서 확대가 툭툭 끊겼다. 영상 화면은 크기가 바뀔 때마다 iOS가 영상 표시 영역을 다시 배치하면서 짧은 전환 효과를 붙이기 때문이다. **그래서 영상은 확대 전 크기로 고정하고 transform으로 옮기고 키운다.** 보이는 위치는 사진과 같은 계산이고 구도 값도 같다. 사진에 transform을 쓰지 않는 것은 확대했을 때 흐려질 수 있어서다.

## 빌드할 때

- 새 네이티브 모듈(expo-video)과 새 Swift 파일이 들어갔으므로 `ios/`에서 `pod install`을 다시 돌린다. 이 맥에서는 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`을 붙여야 돈다([빌드 문서](../../ops/build-and-dev-commands.md) §2)
- `xcode-select`가 CommandLineTools를 가리키면 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`를 붙인다
- **2026-10-03 확인:** 새 Swift 파일 두 개는 컴파일된다(경고만 있다. 렌더 경로의 동기식 AVFoundation API가 iOS 16부터 폐기 예정이라는 경고). 개발용(Debug) 시뮬레이터 빌드는 **링크에서 실패했는데, 원인은 이 작업이 아니다.** 빠진 심볼이 `RCTPackagerConnection`(expo-dev-launcher)과 `facebook::react::Sealable`(제스처·리애니메이티드·SVG)이라 React Native 기본 모듈 쪽이다. `[확인 필요]` main에서도 같은지는 확인하지 않았다. 같은 날 Debug **실기기** 빌드는 링크까지 통과했으니 시뮬레이터에만 해당하는 문제로 보인다
- **개발용 앱이 실제로 깔렸는지 확인한다.** 2026-10-03에 `expo run:ios`가 설치 완료를 출력했는데도 폰에는 TestFlight 빌드 25가 남아 있어 개발 서버에 접속하지 않았다. 확인과 직접 설치 방법은 [빌드 문서](../../ops/build-and-dev-commands.md) §1에 적었다

## 실기기 확인

2026-10-03 사용자가 개발용 앱(iPhone 11 Pro)으로 확인했다. **"전반적으로 잘 된다"고 했고, 배경 선택에서 확대가 끊기는 문제 하나가 나왔다.** 위 "구도 조정"처럼 고친 뒤 다시 확인해 괜찮다고 했다.

아래 위험은 항목별로 따로 보고받지는 않았다. TestFlight 빌드에서 더 보이면 [QA 기록](../../ops/qa-log.md)에 남긴다.

## 확인할 위험

- **생성 시간이 늘어난다.** 마지막 3초 재사용이 꺼지고 영상 읽기가 더해진다. [두 장면 동시 그리기 결정](../../decisions/2026-09-29-export-parallel-rendering.md)과 함께 본다
- **화면 잠금·앱 전환 중**에도 영상을 읽을 수 있는지
- 영상을 고른 직후 **권한 창이 뜨지 않는지**
- 새 네이티브 모듈(expo-video)이 들어가므로 **개발용 앱을 다시 빌드**해야 한다

## 공개 문서

2026-10-03에 처리방침과 FAQ에 영상을 더했다. 무엇을 고쳤는지는 [공개 문서 기록](../../ops/public-docs-log.md)에 있다.

**보관함에서 항목을 지워도 배경 사진·영상 사본은 남는다.** 사진 때부터 그랬고 이번에 안내에 적었다. 코드로 지우게 바꾸면 안내 문장도 뺀다.

## 어긋남 기록

- FRD 배경 선택 §3-1 "현재 MVP는 사진만 선택 가능하다"는 이 작업으로 낡는다. 같은 PR에서 고친다.
