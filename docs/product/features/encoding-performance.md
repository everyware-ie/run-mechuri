# 인코딩 속도와 백그라운드 실행

근거: [내보내기·공유 FRD](../../specs/frd/export-and-share.md) §2 인코딩, [경로 렌더링 FRD](../../specs/frd/route-rendering.md) §9 출력 규격.

## 착수 확인 (2026-09-13)

phs00 요청: 기존 변경을 먼저 TestFlight에 배포한 다음, 앱 전환·화면 잠금 중 인코딩과 품질을 유지하는 속도 개선을 진행한다. FRD의 성공 시 보관함 등록, 취소·실패 시 편집값 유지 규칙을 이어받고 백그라운드 정책을 같은 변경에서 보완한다.

## 변경 전 확인

- 네이티브 AVAssetWriter가 1080×1920, H.264, 30fps, 12초(360프레임)를 만든다.
- 마지막 3초의 동일한 완성 화면도 90번 다시 렌더링·픽셀 복사한다.
- UIGraphicsImageRenderer는 기기의 기존 기본 스케일을 사용한다. 1배로 내리면 비용은 줄지만 안티앨리어싱이 달라질 수 있으므로 이번 개선에서 바꾸지 않는다.
- 백그라운드 실행 요청이 없고 writer의 시작·append·종료 실패를 모두 검사하지 않았다.
- iPhone 11 Pro, iOS 26.6.2 개발 빌드: 합성 원형 좌표 1,000개, 불빛 러너·글래스·동적 페이스·한글 문구 테스트 56.357초. 출력은 실제 360프레임, 1080×1920, 30fps, 12초. 개인 GPS 원본을 성능 테스트에 사용하지 않았다. 개발 앱 측정이며 모든 기기의 성능 보장은 아니다.

## 구현·검증 계획

1. 완성 화면 픽셀 버퍼 재사용과 renderer 재사용. 프레임 시간·수·H.264 설정·그림자·폰트·스케일 유지.
2. 사용자 시작 iOS 26 continued processing task, 이전 OS의 유한한 background task. 앱 전환·잠금과 강제 종료를 구분.
3. 취소·대체 요청·시스템 만료를 작업 단위로 분리하고 writer 오류를 확인. 보관함 저장까지 작업 수명 관리.
4. 동일 입력 영상의 디코딩 프레임 비교, 시간 비교, 실제 앱 전환·화면 잠금 확인. 실기기 확인 전 완료로 적지 않는다.

## 플랫폼 근거

- [Apple WWDC25: Finish tasks in the background](https://developer.apple.com/videos/play/wwdc2025/227/): 사용자 시작 continued processing task, 진행률·취소·만료·완료 처리.
- Xcode iOS 26.5 SDK BackgroundTasks 헤더: continued processing 등록은 앱 시작 시점 제한의 예외, 같은 식별자 중복 등록 금지, `.fail` 요청 전략.

## 속도·출력 비교 (2026-09-13)

동일 입력을 기존/개선 네이티브 코드에서 한 번씩 실행했다. 첫 비교는 foreground 상태다.

| 항목 | 기존 | 개선 |
|---|---:|---:|
| JS 요청부터 네이티브 완료 응답 | 56.357초 | 40.329초 |
| 실제 그린 프레임 | 360 | 271 |
| 인코딩한 프레임 | 360 | 360 |
| 출력 | 1080×1920 / 30fps / 12초 | 동일 |

약 28.4% 단축. 개선판 네이티브 내부 측정 40.146초 중 래스터화 26.976초, 픽셀 복사 12.136초, writer 대기 0.411초. 기존 3배 렌더 스케일을 유지했다. 다음 큰 비용은 래스터화·복사지만 스케일을 낮춰 속도를 얻는 변경은 이번에 포함하지 않았다.

AVAssetReader로 두 mp4의 **360프레임 전체**를 같은 BGRA 형식으로 디코딩해 비교했다. 프레임 시각 일치, 다른 프레임 0개, 최대 채널 차이 0, 평균 절대 차이 0이었다. 이 테스트 입력에서 픽셀 차이가 없음을 확인한 것이며 모든 조합의 전수 검사는 아니다.

## 구현 구조

- `RouteRendererModule.swift`: 작업별 잠금으로 취소 상태를 분리하고 직렬 렌더 큐를 사용한다. 더 최신 요청은 이전 작업만 취소한다.
- `RenderBackgroundLease`: iOS 26 continued processing task와 이전 OS의 유한한 background task를 관리한다. 동일 ID 중복 등록을 피하고 각 요청의 콜백이 다른 작업을 실행하지 않도록 작업 ID를 분리한다.
- 진행 이벤트는 출력 파일 이름으로 구분한다. 오래된 공유 화면이 새 작업의 진행률을 섞어 받지 않는다.
- 파일 writer의 시작·append·종료 상태를 검사한다. 완료 영상의 마지막 픽셀 버퍼를 수정하지 않고 3초 정지 구간에서 재사용한다.
- JS가 보관함에 저장한 뒤 `finishRender(jobId, persisted)`로 백그라운드 작업을 종료한다. JS reload 등으로 응답이 없으면 15초 후 권한을 반환한다. 이 타임아웃은 결과물을 저장했다는 뜻이 아니다.
- `app.json`에 permitted task ID와 processing 모드를 둔다. 네이티브 재빌드가 필요하다. **TestFlight 17에는 이 후속 인코딩 변경이 포함되지 않는다.**

## 시스템 진행 안내 표시 제약 (2026-09-13)

phs00가 내보내기 시작 시 상단의 “러닝 영상 만들기” 안내를 몇 초 뒤 자연스럽게 숨기도록 요청했다. 해당 문구는 앱의 toast가 아니라 `BGContinuedProcessingTaskRequest`의 title이며, iOS가 표시하는 시스템 진행 UI다.

- [Apple BGContinuedProcessingTask 문서](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask)와 Xcode iOS 26.5 SDK 헤더를 확인했다. 제목·부제목·진행률 갱신은 가능하지만 배너 표시 시간 지정이나 숨김 API는 제공하지 않는다.
- 안내만 숨기려고 `setTaskCompleted`를 호출하면 장시간 백그라운드 실행 권한도 종료하므로 적용하지 않았다. 기존 보관함 저장 ACK 이후 완료 처리를 유지한다.
- [요청 API](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtaskrequest)는 foreground에서 사용자 동작에 따라 제출해야 한다. 배경 전환 시점까지 제출을 미루는 우회는 별도의 실행 안정성 검증이 필요하며 이번 요청에 적용하지 않았다.
- 이번 확인에서는 런타임 코드를 변경하지 않았다. 자동 숨김 요구는 현재 공개 API로 충족하지 못한 UX 제약으로 남긴다.

## 픽셀 비교 재현

`frontend/scripts/check-rendered-clips.swift`는 macOS AVAssetReader로 비교한다. 좌표·사진을 외부로 전송하지 않는다. 기존/개선 mp4를 로컬에 준비한 뒤 다음을 실행한다.

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc -O \
  frontend/scripts/check-rendered-clips.swift -o /private/tmp/check-rendered-clips
/private/tmp/check-rendered-clips /path/to/before.mp4 /path/to/after.mp4
```

규격·프레임 수·시각 불일치 또는 픽셀 차이가 있으면 실패한다. 인코더/OS가 바뀐 비교에서는 차이가 곧 품질 저하라는 뜻은 아니므로 차이 원인을 별도로 검토한다. 이번 전후 비교는 동일 기기·OS에서 했다.

## 실기기 백그라운드·화면 잠금 검증

- iPhone 11 Pro / iOS 26.6.2 개발 앱에서 설정 앱으로 전환한 뒤 사용자 직접 화면 잠금.
- 테스트 도중 사용자가 실제 결과물 만들기를 새로 시작했고, 기존 합성 테스트는 `취소했습니다`로 종료됐다. 최신 요청만 진행되어 작업 대체가 동작했다.
- 잠금 상태(`passcodeRequired: true`)와 앱 `background` 상태에서 실제 결과물 진행률이 약 17% → 45%로 증가했다.
- 21:35:35 KST, 네이티브가 223.819초에 완료. 21:35:35.808에 보관함 등록. 21:37에도 잠금을 유지한 상태에서 저장 파일·등록 메타데이터를 직접 확인했고 초안 키는 제거돼 있었다. 잠금을 풀어 앱에 복귀한 뒤 저장된 것이 아니다.
- 실제 완성 파일도 360프레임 전체 디코딩에 성공했고 1080×1920·30fps·12초를 확인했다.
- 이 실제 기록은 foreground 합성 테스트와 입력이 다르므로 40초와 직접 속도 비교하지 않는다. 백그라운드에서는 시스템 우선순위가 낮아져 더 오래 걸릴 수 있다.
- JS 연결은 완료 뒤 끊어졌지만 파일·보관함 저장이 이미 끝난 것이 확인됐다. 디버거 연결 유무만으로 실패를 판단하지 않는다.

검증 범위: iOS 26 실기기 앱 전환·화면 잠금·완료·보관함 저장, 최신 요청 대체, 동일 영상 픽셀 비교, TypeScript/변경 파일 lint/Swift Debug 빌드/문서 검사. 이전 OS의 유한한 background task 만료, 저전력·열 제한·저장 공간 부족은 실기기 조건별 추가 QA가 필요하다. iOS의 실행 허가와 강제 종료 뒤 작업 지속은 보장하지 않는다.
