# 빌드·개발 명령어 모음

실기기/시뮬레이터 확인부터 TestFlight 배포까지, 이 프로젝트에서 실제로 쓰는 명령어를 상황별로 정리한다. `frontend/` 안에서 실행하는 게 기본.

## 1. 개발 중 — JS/TS만 고쳤을 때

**JS/TS 코드(화면, 컴포넌트, 로직)만 바꿨다면 이것만 있으면 된다.** 네이티브 재빌드 필요 없음.

```bash
npx expo start
```

- 이미 기기에 설치된 앱(개발 빌드)이 켜져 있으면 자동으로 새 코드를 받는다.
- 화면이 이상하게 안 바뀌면 캐시 문제일 수 있다 — `npx expo start -c` (캐시 클리어).
- 앱이 아예 안 켜져 있으면, 기기에서 앱을 직접 실행해 Metro(`expo start`)에 연결한다.

### 흔들어도 개발 메뉴가 나오지 않을 때

**TestFlight 앱에서는 개발 메뉴가 열리지 않는다.** 흔들기는 이미 설치된 개발용 앱에서 메뉴를 여는 동작이지, TestFlight를 개발용으로 바꾸는 동작이 아니다. [Expo 개발용 빌드 안내](https://docs.expo.dev/develop/development-builds/use-development-builds/).

이 프로젝트는 개발용과 TestFlight의 bundle ID가 모두 `com.mechuri.runmechuri`다. 같은 아이폰에서는 나중에 설치한 버전으로 교체된다. TestFlight 업데이트 후 로컬 QA로 돌아오려면 개발용 앱을 다시 빌드·설치하고 개발 서버를 실행한다. 앱을 먼저 삭제할 필요는 없다.

```bash
npx expo start --dev-client --lan --port 8081
```

개발용 앱의 서버 선택 화면에서 연결하거나 Metro에 나온 QR 코드로 연다. LAN 연결은 Mac과 아이폰이 같은 네트워크에 있어야 한다. 개발용 앱이 연결된 뒤에는 Metro 터미널의 `m`으로도 개발 메뉴를 열 수 있다. [Expo 디버깅 도구 안내](https://docs.expo.dev/debugging/tools/).

## 2. 네이티브 쪽을 바꿨을 때 (새 패키지·설정·bridge 모듈)

**Swift 파일 "내용"만 바꾼 거면 이 단계 없이 바로 3번(Xcode Run)으로 가도 된다** — 이미 링크된 로컬 모듈은 Xcode가 원본 경로를 그대로 참조해서, 다시 빌드만 해도 반영된다.

**새 npm 패키지를 설치했거나, `app.json`/plugin 설정을 바꿨거나, 새 네이티브 모듈을 추가했을 때만** 아래가 필요하다.

```bash
npm install                 # package.json 바뀐 거 반영
npx expo prebuild            # ios/ 프로젝트 재생성 (+ pod install 겸함)
```

- `prebuild`는 `ios/`, `android/` 폴더를 설정 기준으로 다시 만든다. 기존 `ios/`가 있으면 덮어쓸지 물어본다.
- 현재 표시 이름은 `Runary`다. 새로 prebuild한 iOS 프로젝트는 `Runary.xcworkspace`를 사용한다. 이름 변경 전에 생성한 로컬 프로젝트에는 `app.xcworkspace`가 남아 있을 수 있으므로 실제 파일명과 scheme을 확인한다.

## 3. 실기기/시뮬레이터에서 직접 확인 (Xcode)

```bash
open ios/*.xcworkspace        # Xcode 실행 (반드시 .xcworkspace, .xcodeproj 아님)
```

Xcode가 열리면:

1. 상단 기기 선택 드롭다운에서 **연결된 실기기** 또는 **시뮬레이터** 선택
2. **Run(▶)** — 빌드 + 설치까지 한 번에

**실기기로 Run 하려면**: Xcode → Settings → Accounts에 Apple Developer 계정이 로그인돼 있어야 한다. 로그인 안 돼 있으면 "No Account for Team ..." 에러가 남 — 이건 GUI에서 직접 로그인해야 풀리는 문제.

**계정 로그인이 안 될 때**: 시뮬레이터로는 서명 없이 Run 가능 — 코드가 맞게 컴파일되는지 정도는 확인할 수 있다(단, HealthKit 같은 실기기 전용 기능은 시뮬레이터에서 동작 안 함).

Run 후 앱이 켜지면, 그 앱은 자동으로 Metro(`npx expo start`)를 찾아 연결한다 — 둘은 별개 프로세스라 **Xcode Run과 `npx expo start`를 둘 다 켜둬야** JS 코드 변경이 실시간으로 반영된다.

## 4. TestFlight로 배포 (팀원들이 실기기에서 테스트)

`eas.json`에 `production` 빌드/제출 프로필이 이미 설정돼 있음(`ascAppId: 6807295594`).

```bash
# 1) 빌드 — Expo EAS 클라우드에서 빌드
npx eas-cli build --platform ios --profile production --non-interactive --no-wait

# 위 명령이 출력하는 빌드 ID(또는 아래로 조회)로 진행 상황 확인
npx eas-cli build:list --platform ios --limit 3

# 특정 빌드 상세 확인 — 주의: build:view는 --non-interactive 플래그를 안 받는다
npx eas-cli build:view <BUILD_ID>

# 2) 빌드 상태가 finished가 되면 제출
npx eas-cli submit --platform ios --profile production --non-interactive --id <BUILD_ID>
```

- 제출 후 애플 쪽 자동 처리(바이러스 검사 등, 사람이 보는 심사 아님)에 5~10분 정도 걸린다. 끝나면 등록된 내부 테스터는 바로 TestFlight 앱에서 설치할 수 있다(우리 팀은 내부 테스터라 별도 "베타 심사"는 안 거침 — 외부 테스터에게 공개할 때만 애플의 베타 심사가 있음).
- `autoIncrement: true`(eas.json)라 빌드 번호는 자동으로 올라간다 — 버전 번호를 직접 안 올려도 됨.
- 확인 링크: `https://appstoreconnect.apple.com/apps/6807295594/testflight/ios`

### 클라우드 무료 한도가 소진됐을 때: 로컬 배포 빌드

2026-09-13 PR #53은 EAS 무료 iOS 빌드 한도 때문에 이 경로로 배포했다. 유료 구독을 추가하지 않았다. 생성된 IPA도 EAS Submit으로 제출할 수 있다.

```bash
brew install fastlane  # 이 맥에 없을 때 한 번만. Xcode·CocoaPods도 필요
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx eas-cli build \
  --platform ios --profile production --local --non-interactive --output /private/tmp/mechuri-production.ipa
npx eas-cli submit --platform ios --profile production \
  --path /private/tmp/mechuri-production.ipa --non-interactive --no-wait
npx eas-cli submit:status --platform ios --profile production --json --non-interactive
```

- 머지된 커밋의 깨끗한 체크아웃에서 실행한다. 작업 중 변경이나 개인 파일을 배포에 섞지 않는다.
- 로컬 빌드도 원격 인증서와 원격 빌드 번호를 사용한다. 실패한 빌드 번호는 건너뛸 수 있다.
- 이 날짜의 EAS CLI에서 `--what-to-test` 자동 등록은 Enterprise 플랜 제한으로 제출이 거절됐다. 해당 옵션 없이 제출하고 팀 테스트 안내는 PR에 남겼다.
- `submit` 완료는 Apple 업로드 완료다. `submit:status`의 해당 빌드가 `VALID` / `IN_BETA_TESTING`인지 확인해야 내부 테스트 가능 상태를 확정할 수 있다.
- **1.0.0(17)**: PR #53, merge `be7483b`, Apple 제출 `65bc740a-d749-4105-9405-316d0f4861e9`. 2026-09-13 내부 테스트 가능 상태 확인. 미리보기 원인·해결·측정은 [미리보기 성능 노트](../product/features/preview-performance.md)에 있다.


### 2026-09-13 인코딩·각인 후속 배포 — 1.0.0(18)

- 소스: [PR #54](https://github.com/everyware-ie/run-mechuri/pull/54), merge `5b704ce212e018bfdd4a8490135df8f8067b40a4`.
- 변경: 앱 전환·화면 잠금 중 인코딩과 보관함 저장, 완성 프레임 재사용, 최초 코너·최근 선택 각인 기본값. 시스템 진행 안내의 자동 숨김은 공개 API 제약으로 미적용.
- 로컬 production 빌드 성공. IPA의 `1.0.0(18)`·bundle ID·processing 모드·continued processing 식별자·JS 번들 포함 확인.
- [EAS 제출](https://expo.dev/accounts/team-mechuri/projects/mechuri/submissions/964812d4-36be-461a-9f36-49b682735c44): `FINISHED`. 2026-09-13 Apple 조회에서 `VALID` / `IN_BETA_TESTING`, 미만료 상태 확인. 등록된 내부 테스터가 TestFlight에서 업데이트할 수 있다.
- IPA SHA-256: `903bb27553b818b7ce7e9f903672f4d3d8ff62a25f6109ecf7bcb0c4d03f6db4`.
- 구현·검증·제약은 [인코딩 성능 노트](../product/features/encoding-performance.md), [각인 편집 노트](../product/features/result-editing.md)에 기록한다. 개발 기기에서 약 28.4% 단축과 전체 360프레임 픽셀 일치를 확인했으며, 모든 기기·입력에 같은 속도를 보장하지 않는다.

## 5. 자주 쓰는 확인 명령 (커밋 전)

```bash
node_modules/.bin/tsc --noEmit          # 타입 체크
node_modules/.bin/eslint src/ modules/  # 린트
cd .. && python3 scripts/check-docs.py  # 문서 정합성 (docs/ 건드렸을 때)
```

Swift 파일은 Xcode 없이 문법만 빠르게 확인하고 싶을 때(전체 빌드 없이):

```bash
xcrun swiftc -parse modules/route-renderer/ios/RouteRendererModule.swift
```

`No such module 'ExpoModulesCore'` 에러는 무시해도 된다 — CocoaPods로만 링크되는 모듈이라 이 명령으로는 못 찾는 게 정상이고, 문법 자체(괄호 짝, 타입 등)만 확인하는 용도다. 실제 컴파일 확인은 Xcode Run으로.


## 2026-09-20: Runary 개발 앱 설치

표시 이름을 Runary로 바꾸고 첫 실행 안내·홈에 개인정보 처리방침 링크를 추가했다. iPhone Debug 빌드 성공 후 연결된 개발 아이폰에 설치했다. Expo app.json과 로컬 생성 iOS Info.plist의 CFBundleDisplayName·건강 권한 안내를 맞췄다. 배포 빌드는 app.json 설정을 사용한다. 번들 ID는 com.mechuri.runmechuri로 유지했다.

오늘 편집 QA 수정은 사용자가 확인 완료했다. 이 설치 시점에는 로컬 QA용이었고, 이후 PR #62·#63을 머지해 아래의 빌드 23으로 TestFlight 내부 배포를 완료했다. 기능 근거와 검증은 [처리방침 링크](../product/features/privacy-policy-link.md), [제품명 반영](../product/features/runary-display-name.md)에 기록했다.


## 2026-09-20: 출시 준비 배포 1.0.0(23)

### 소스와 변경

- [PR #62](https://github.com/everyware-ie/run-mechuri/pull/62): 경로 선택 박스의 이동·확대·회전 동기화, 원라인 기본 너비 보정, 러닝 데이터 크기 슬라이더, 항목별 터치 영역, 이동 후 되튀는 현상 제거, 전체 미리보기에서 대상 전환 시 접힘 상태 유지.
- [PR #63](https://github.com/everyware-ie/run-mechuri/pull/63): Runary 표시 이름·화면 문구, 첫 실행·홈의 처리방침 링크, 공개 Notion 이름과 새 허브 주소 반영.
- 배포 소스: `a280271a38a2d2b3b1450631218360957c95babe`. 머지된 main의 별도 깨끗한 체크아웃에서 기존 잠금 파일로 의존성을 설치하고 로컬 production 빌드를 실행했다.

### 검증

사용자가 오늘 편집 QA 항목을 확인 완료했다. 타입, 미리보기·편집 회귀 검사, 문서 검사와 diff 공백 검사가 통과했다. iOS Debug 빌드·개발 기기 설치도 완료했다. 전체 린트에는 기존 오류 16개·경고 5개가 남아 있으며 이번 변경에서 추가된 오류는 없다.

빌드 중 Expo Doctor는 최신 권장 패치와 다른 의존성 21개를 보고했다. 배포 직전 의존성 변경을 추가하지 않고 검증한 잠금 파일을 유지했다. [확인 필요] 패치 업데이트는 별도 작업에서 호환성·회귀 검증 후 진행한다.

### 제출 상태

로컬 production 빌드가 성공했다. IPA의 표시 이름 `Runary`, 버전 `1.0.0(23)`, 기존 bundle ID `com.mechuri.runmechuri`, processing 모드·JS 번들 포함을 확인했다. macOS 신뢰 저장소 접근이 가능한 환경에서 `codesign --verify --deep --strict`가 통과했다.

- IPA SHA-256: `06832392975d0a685ed4dc994949caf93358f56abcd71e68fb130f434fd7470b`.
- [EAS 제출](https://expo.dev/accounts/team-mechuri/projects/mechuri/submissions/55e05c3c-b903-4336-a06b-9ea5b1e44431): `FINISHED`, 2026-09-20 22:46 KST Apple 업로드 완료.
- 2026-09-20 Apple 조회에서 빌드 `23`이 `VALID` / `IN_BETA_TESTING`, 미만료 상태임을 확인했다. 등록된 내부 테스터는 TestFlight에서 업데이트할 수 있다. 외부 상태는 `READY_FOR_BETA_SUBMISSION`이다.

### 9월 22일 외부 공개 인계

2026-09-20 Apple 조회에서 기존 빌드 `1.0.0(18)`은 `BETA_APPROVED`, 빌드 `1.0.0(22)`는 `READY_FOR_BETA_SUBMISSION`이었다. 이전 빌드 승인을 이번 빌드의 외부 배포 완료로 간주하지 않는다.

사용자는 외부 베타 공개 설정을 다른 팀원에게 요청하거나 다음에 진행하기로 했다. 앱 관리 Apple 계정으로 [App Store Connect의 TestFlight](https://appstoreconnect.apple.com/apps/6807295594/testflight/ios)에 로그인하여 이번 빌드를 외부 베타 그룹에 추가하고, 표시되는 베타 심사·테스트 시작 절차를 진행한다. 공개 링크에서 새 빌드를 설치할 수 있는지 확인한 뒤 출시 안내에 사용한다. 이번 작업에서는 공개 링크 변경이나 스레드·지인 대상 메시지를 보내지 않았다.
