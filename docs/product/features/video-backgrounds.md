# 갤러리 영상 배경

- FRD: [배경 선택](../../specs/frd/background-selection.md) §1 배경의 종류, §3-1 갤러리에서 고르기, §3-3 권한, §5 영상 처리, §6 불러오기와 대기, §7 실패 / [경로 렌더링](../../specs/frd/route-rendering.md) §8 배경 합성 (`approved`)
- 근거 결정: [2026-09-08](../../decisions/2026-09-08-scope-and-roles.md) 배경 소재 3번 "갤러리에서 고른 영상"(여유 시)
- 구현 상태: **진행 중** (브랜치 `phs00/feature/video-background`)
- 확인: 2026-10-03 사용자가 FRD 규칙표를 보고 범위를 정했다. 갤러리 영상만, 사진처럼 확대·이동, 미리보기에서 재생.

## 이어서 할 사람에게

이 노트는 인계 문서를 겸한다. 세션이 끊기면 여기부터 읽는다.

**지금 어디까지:** 네이티브 준비 함수와 렌더러 연결, JS 데이터 타입과 규칙(테스트 포함)까지 커밋했다. **iOS 빌드로 Swift 컴파일은 아직 확인하지 않았다.** expo-video는 설치했다(app.json에 설정 플러그인이 추가됨).

**다음 할 일**

- [x] 1. 네이티브: 영상 준비 함수(앞 20초 잘라 보관, 첫 장면 추출, 방향 반영한 크기·길이)
- [x] 2. 네이티브: 렌더러가 프레임마다 영상 장면을 깔게 한다
- [x] 3. JS: 데이터 타입·보관·경로 복원
- [ ] 4. JS: 갤러리에서 영상 고르기와 구도 조정
- [ ] 5. JS: expo-video 설치, 배경 선택·편집 미리보기에서 재생
- [ ] 6. JS: 공유 화면이 렌더러에 영상 정보를 넘긴다
- [ ] 7. FRD §3-1 "현재 MVP는 사진만" 고치기, §1 표의 3번 범위 갱신
- [ ] 8. 검사: 타입, 린트, 테스트, 문서 검사, iOS 빌드
- [ ] 9. 실기기 확인은 사용자가 한다(아래 "확인할 위험")

## 코드 위치

| | |
|---|---|
| `modules/route-renderer/ios/VideoBackground.swift` | 영상 준비(`VideoBackground.prepare`)와 프레임마다 장면 꺼내기(`VideoBackgroundSource`) |
| `modules/route-renderer/ios/RouteRendererModule.swift` | `prepareVideoBackground` 등록, `backgroundVideoPath`·`backgroundVideoCrop` 옵션, 프레임 루프 연결 |
| `src/lib/background-storage.ts` | `PhotoBackground`에 `media`·`posterUri`·`durationSec`, `isVideoBackground` |
| `src/lib/video-rules.ts` | 보관 길이 20초, 3초 미만 정지 규칙, 렌더러용 자르기 영역 |

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

## 확인할 위험

실기기에서 사용자가 확인한다.

- **생성 시간이 늘어난다.** 마지막 3초 재사용이 꺼지고 영상 읽기가 더해진다. [두 장면 동시 그리기 결정](../../decisions/2026-09-29-export-parallel-rendering.md)과 함께 본다
- **화면 잠금·앱 전환 중**에도 영상을 읽을 수 있는지
- 영상을 고른 직후 **권한 창이 뜨지 않는지**
- 새 네이티브 모듈(expo-video)이 들어가므로 **개발용 앱을 다시 빌드**해야 한다

## 공개 문서

처리방침과 FAQ는 지금 "사진"만 말한다. 출시 전에 영상을 더해야 한다. 공개 노션이라 고칠 때 사용자에게 확인받는다.

## 어긋남 기록

- FRD 배경 선택 §3-1 "현재 MVP는 사진만 선택 가능하다"는 이 작업으로 낡는다. 같은 PR에서 고친다.
