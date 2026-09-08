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

## 2. 네이티브 쪽을 바꿨을 때 (새 패키지·설정·bridge 모듈)

**Swift 파일 "내용"만 바꾼 거면 이 단계 없이 바로 3번(Xcode Run)으로 가도 된다** — 이미 링크된 로컬 모듈은 Xcode가 원본 경로를 그대로 참조해서, 다시 빌드만 해도 반영된다.

**새 npm 패키지를 설치했거나, `app.json`/plugin 설정을 바꿨거나, 새 네이티브 모듈을 추가했을 때만** 아래가 필요하다.

```bash
npm install                 # package.json 바뀐 거 반영
npx expo prebuild            # ios/ 프로젝트 재생성 (+ pod install 겸함)
```

- `prebuild`는 `ios/`, `android/` 폴더를 설정 기준으로 다시 만든다. 기존 `ios/`가 있으면 덮어쓸지 물어본다.
- 앱 표시 이름이 한글("메추리")이라 프로젝트 파일명이 `app.xcodeproj`/`app.xcworkspace`로 나오는 게 정상(알려진 특이사항).

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
# 1) 빌드 — Apple 클라우드에서 빌드, 완료까지 보통 10~20분
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
