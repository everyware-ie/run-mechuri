# RN vs Swift — 최종 판단 정리

*2026-08-25 · JiEung2 담당 · [2026-08-23 기술 스택 리서치](2026-08-23-tech-stack-research-rn-vs-swift.md)의 후속 검증 노트*

## 나는?: RN

## 기각된 근거

GitHub Octoverse 2025에서 TypeScript가 1위인 반면 Swift는 순위표에 없다. 여기서 "Swift 공개 코드가
적으니 학습 데이터도 적을 것"이라는 추론은 가능하지만, **이건 확인된 사실이 아니라 정황 추론**이다.

**"AI 보조 개발이 RN에서 실측으로 더 빠르다"** — GitHub에서 TS 비율이 압도적으로 많으니 학습 데이터도 많을 거라는 추론이었을 뿐, 검증된 사실이 아닌 개인 판단이므로 **근거 없음으로 폐기.**

## 살아남은 근거 둘

### 1. SwiftUI Previews 크래시 (Apple 공식 포럼으로 확인됨)

**무엇인가**: Xcode에서 SwiftUI 코드를 저장하면 즉시 캔버스에 렌더링해 보여주는 기능. 다만 RN의 Fast Refresh와 작동 방식이 근본적으로 다르다.

| | SwiftUI Previews | RN Fast Refresh |
|---|---|---|
| 방식 | 별도 프로세스(PreviewShell)를 매번 컴파일 + 새로 띄움 | 이미 돌아가는 앱 프로세스 안에서 JS만 재실행 |
| 실패 시 | 캔버스 전체가 멈추거나 빈 화면, 수동 재시작 필요 | 앱에 빨간 에러 화면, 코드 고치면 바로 복구 |
| 상태 유지 | 프로세스가 새로 뜨므로 매번 초기 상태 | React가 최대한 상태 보존 |

**왜 크래시 나나**
- 미리보기 View 하나만 고쳐도 Swift는 타입 해석에 모듈 전체 컨텍스트가 필요해 관계없는 곳 문제로도 전체가 막힘
- PreviewShell 프로세스 자체의 버그(예: macOS List 컴포넌트 사용 시 알려진 크래시)
- 간단한 코드 실수가 에러 메시지 없이 캔버스 전체를 죽임
- 실기기 프리뷰와 실제 동작이 다른 경우도 보고됨
- 우회법(`Editor → Canvas → Use Legacy Previews Execution`, `xcrun simctl --set previews shutdown all`)이 커뮤니티에 정착해 있다는 것 자체가 흔한 문제라는 증거

**출처**: Apple Developer Forums
- [Preview crashes consistency in Xcode 16 beta](https://developer.apple.com/forums/thread/756681)
- [PreviewShell crashes and breaks the preview canvas](https://developer.apple.com/forums/thread/762993)
- [Xcode16.3 SwiftUI Preview Crash](https://developer.apple.com/forums/thread/779825)

### 2. EAS 빌드 파이프라인

Xcode 인증서·프로비저닝 프로파일 설정을 CLI(`eas build`)가 상당 부분 흡수해줌. 팀에 Xcode 숙련자가 없어도 진행 가능. TestFlight 내부 테스트는 업로드 후 10~15분 내 반영.

**AI 활용 전제와 특히 잘 맞는 이유**: 인증서·프로비저닝은 Apple 포털을 직접 클릭해서 처리하는 수동 작업이라 AI가 대신해줄 수 없는 영역. EAS가 이 마찰을 흡수해준다는 건 "AI가 코드는 대신 짜주지만 이 부분은 못 도와준다"는 지점의 리스크를 줄여주는 것.

## "학습 부담은 아예 빼자"는 가정 하에서도 결론이 안 바뀌는 이유

학습 부담(누가 Swift/RN을 배워야 하는가)을 완전히 제외해도, **빈도로 비교하면 답이 나온다.**

| | 빈도 | 얼마나 아픈가 |
|---|---|---|
| **SwiftUI Previews 크래시** | 화면 5개 작업 내내, 5주 동안 반복 | AI가 코드를 고칠 때마다 눈으로 확인해야 하는데 그 확인 자체가 자주 막힘 |
| **RN 브릿지 디버깅** (RN의 단점) | 네이티브 모듈 3개, 한 번 제대로 만들면 그 뒤로는 거의 안 건드림 | 어렵지만 드묾 |

**브릿지 버그가 AI한테도 어려운 종류인 건 맞다** — JS 로그와 네이티브 로그가 따로 나와서 원인이 언어 문법이 아니라 "두 세계 사이 타이밍·직렬화" 문제일 때 AI도 두 로그를 상관관계로 추론해야 함. 다만 이 프로젝트는 이 리스크가 작다:

> 네이티브 모듈 3개(HealthKit 읽기, 렌더링, 인스타 공유) 전부 **"요청 한 번 – 완료 콜백 한 번"** 구조로 설계됨. 브릿지를 넘나드는 상황 자체가 드묾.

**고빈도로 반복되는 마찰(Previews)이 저빈도로 한정된 리스크(브릿지)보다 5주 일정에서 더 크게 누적된다.**

## 남는 트레이드오프 (정직하게)

브릿지 디버깅은 팀이 한 번도 안 해본 새로운 실패 모드다. Swift 단독이었으면 이 문제 자체가 없었을 것. 다만 위 이유로 이번 프로젝트에서는 발생 빈도가 낮게 설계돼 있어 감내할 만하다고 판단.

## 부록: RN 안에서도 Expo냐 CLI냐가 갈린다

RN으로 정해도 끝이 아니다. "RN 프로젝트를 어떤 방식으로 시작하느냐"에 또 두 갈래가 있다.

### CLI(bare) — 날것 그대로

`npx react-native init`로 시작하면 처음부터 `ios/`, `android/` 네이티브 프로젝트 폴더가 통째로 생긴다. **Xcode, Android Studio를 우리가 직접 열어서 인증서·빌드·배포까지 전부 관리해야 한다.** 자유도는 가장 높지만, 그 자유도의 대가를 팀이 그대로 떠안는다.

### Expo — RN 위에 얹힌 관리 레이어

Expo는 RN을 대체하는 게 아니라, **RN 프로젝트 관리를 대신해주는 도구 모음**이다.

- 네이티브 폴더(`ios/`, `android/`)를 평소엔 아예 안 만들어두고, 필요할 때(`expo prebuild`)만 자동으로 생성해준다 — 우리가 직접 그 폴더를 헤집을 일이 거의 없다
- **EAS**라는 빌드 서비스가 인증서·프로비저닝 프로파일 설정을 대신 처리해준다. `eas build` 한 줄이면 클라우드에서 빌드해서 TestFlight까지 올려준다
- "커스텀 네이티브 코드는 못 쓴다"는 게 예전 통념이었는데, **2026년 기준으로는 틀렸다.** [Expo Modules API](https://docs.expo.dev/modules/overview/)로 Swift 코드를 직접 짜서 끼워 넣을 수 있다 — HealthKit 읽기, AVFoundation 렌더러, 인스타 공유 셋 다 이 방식으로 만들면 된다

### 한 줄 비교

| | CLI(bare) | Expo |
|---|---|---|
| 네이티브 폴더 관리 | 우리가 직접 | 필요할 때만 자동 생성 |
| 빌드·배포 | Xcode로 직접 Archive·업로드 | `eas build` 한 줄 |
| 인증서·프로비저닝 | 우리가 Apple 포털에서 직접 설정 | EAS가 대신 처리 |
| 커스텀 네이티브 코드(Swift) | 원래도 가능 | 2026년 기준 Expo Modules API로 가능, eject 불필요 |

### 우리는 Expo로 간다

이유는 단순하다. **RN을 고른 이유 중 하나가 "팀에 Xcode 숙련자가 없다"였는데, CLI로 가면 그 문제를 그대로 다시 떠안기 때문이다.** Expo를 안 쓰면 RN을 고른 값어치의 절반이 사라진다. 커스텀 네이티브 모듈 3개(HealthKit·렌더러·인스타 공유)도 Expo Modules API로 다 되므로, "네이티브 코드가 필요해서 CLI로 가야 한다"는 옛날 이유도 지금은 안 통한다.
