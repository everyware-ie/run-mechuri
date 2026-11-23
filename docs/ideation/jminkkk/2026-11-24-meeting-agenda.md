# 회의 안건 (지민): 로그인 마무리와 외부 설정 공유

로그인·회원가입, 로그인 필수, 첫 가입 백업, 로그아웃·탈퇴를 구현함. 정할 것보다 알릴 것이 많음

| | 내용 | 시간 |
|---|---|---|
| §1 | 로그인 구현 결과 (공유) | 5분 |
| §2 | Apple Developer·카카오·EAS에 추가한 것 (공유) | 5분 |
| §3 | 서버 배포 전에 정할 것 | 10분 |

---

## 1. 로그인 구현 결과 (공유)

- [#143](https://github.com/everyware-ie/run-mechuri/pull/143) 머지: Apple·카카오 로그인, 닉네임 가입, 로그인 필수, 첫 가입 시 Runary 측정 기록 백업
  - 회의(11/20)에서는 #143을 빼고 머지하기로 했는데, 이후 로그인 필수와 백업까지 넣고 실기기에서 확인한 뒤 머지함
- [#146](https://github.com/everyware-ie/run-mechuri/pull/146): 로그아웃, 탈퇴(Apple 토큰 해지, 카카오 연결 끊기). 실기기 확인은 생략하고 자동 테스트로 확인함
- 서버는 Spring Boot. 지민 Mac에서만 돌고 아직 배포하지 않음. 그래서 **TestFlight·스토어 빌드에는 로그인이 나오지 않음**(서버 주소가 있는 빌드에서만 동작)
- 로그인 필수로 정한 입구: 로그인하지 않았으면 앱을 열 때 로그인 화면. 한 번 로그인하면 유지. 로그인에 실패하면 "나중에 하기"로 그 실행만 넘어갈 수 있음([로그인 FRD](../../specs/frd/account-login.md) §2 로그인 입구)

## 2. Apple Developer·카카오·EAS에 추가한 것 (공유)

자세한 표는 [빌드·개발 명령어 모음](../../ops/build-and-dev-commands.md) 2026-11-24 기록에 있음

- **Apple Developer**
  - App ID에 Sign in with Apple을 켬. 기존 프로비저닝 프로파일이 무효가 됨
    - **다음 TestFlight 빌드는 `--freeze-credentials` 없이 돌려야 함**(프로파일을 새로 만들어야 해서)
  - Sign in with Apple 키 추가(Key ID `2FZJKD22M4`). `.p8` 파일은 저장소에 없고 노션으로 옮김. 위치 `[확인 필요]`
  - 지민 iPhone 17을 기기로 등록
- **카카오 디벨로퍼스**: 앱 등록(앱 ID `1658837`), iOS 번들 ID, 카카오 로그인 켬, 동의항목 없음
- **EAS**: 카카오 키를 `development` 환경에만 등록. TestFlight에 넣을 때는 `preview`·`production`에도 등록해야 함
- **앱 버전**: 로그인에 네이티브 패키지가 들어가서, 다음 배포 때 앱 버전을 올려야 함. 그대로 OTA를 보내면 1.0.2 앱이 꺼질 수 있음

## 3. 서버 배포 전에 정할 것 (10분)

- 서버를 어디에 띄울지(11/20 회의에서 다루지 않음)
- 로그인 필수의 심사 위험: 계정이 핵심 기능이 아닌 앱이 로그인을 강제하면 반려될 수 있음([App Review Guidelines 5.1.1](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)). 서버를 배포해 로그인이 스토어 빌드에 들어갈 때 대응을 정해야 함
- 로그인이 들어간 빌드를 내기 전에 개인정보 처리방침·이용약관·App Store 개인정보 표시 개정([로그인 PRD](../../specs/prd/account-login.md) §6 정책과 심사)
- Xcode 27 Mac에서는 로컬 빌드한 앱이 실행되지 않음. Expo 57.0.23 이상으로 올려야 함. App Store가 2027년 4월부터 iOS 27 SDK를 요구한다고 알려져 있어 언제 할지 정하기
