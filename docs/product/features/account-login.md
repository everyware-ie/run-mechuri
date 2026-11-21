# Apple·카카오 로그인과 회원가입

- FRD: [Apple·카카오 로그인과 회원가입 FRD](../../specs/frd/account-login.md) §1~§4
- PRD: [Apple·카카오 로그인과 회원가입](../../specs/prd/account-login.md)
- 구현 상태: 구현과 실기기 확인 완료 (2026-11-21, [PR #143](https://github.com/everyware-ie/run-mechuri/pull/143))

## 착수 확인

2026-11-20에 FRD §1 사용자가 확인할 핵심, §2 로그인 입구, §3 가입과 로그인, §4 닉네임을 사용자와 확인했다.\
FRD는 2026-11-20 지민이 승인해 `approved`가 됐다. 1단계(클라이언트 로그인)는 그 전에 `draft` 기준으로 진행했고, 사용자가 작업 지시에서 허용한 것이다.\
FRD 승인, FRD §10 함께 개정하는 문서, PRD의 서버 선정은 [#142](https://github.com/everyware-ie/run-mechuri/pull/142)에서 먼저 머지했다. 미완성 화면이 main에 들어가지 않도록 문서와 코드를 나눴다.

이번 범위에서 정한 것은 아래와 같다.

| 항목 | 결정 |
|---|---|
| 브랜치 | PRD·FRD가 있는 `jminkkk/docs/account-login`에서 분기 |
| 서버 | Spring Boot, Java 21. `backend/`에 새로 만든다 |
| 토큰 보관 | `expo-secure-store` 추가 |
| 로컬 서버 접속 | 같은 Wi-Fi의 Mac IP로 http 접속. 주소는 `EXPO_PUBLIC_API_URL`로 주입 |
| 내 계정 화면 | 닉네임과 로그인 수단만 표시. 백업 상태, 로그아웃, 탈퇴는 다음 단계 |
| 크루 진입 입구(FRD §2-2) | 크루 화면이 없어 코드는 만들지 않는다 |
| 화면 디자인 | 로그인·회원가입·내 계정 화면은 지민이 디자인과 개발을 함께 맡는다. [계정 화면 시안](../../ideation/jminkkk/2026-11-20-account-login-screens.html)(2026-11-20)의 01, 02a, 03, 04a~c, 05a, 05b(계정 카드), 06을 구현했다 |

범위 밖: 백업·복원(FRD §5), 로그아웃·탈퇴(FRD §6, §7), 서버 배포.\
로그아웃과 탈퇴는 로그인이 들어간 빌드를 심사에 내기 전에 반드시 넣어야 한다.

## 구현 노트

### 라이브러리

| 용도 | 패키지 | 고른 이유 |
|---|---|---|
| Apple 로그인 | `expo-apple-authentication` ~57.0.2 | Expo SDK 공식 모듈. `npx expo install`로 SDK 57에 맞춘 버전을 받았다([SDK 57 문서](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/)) |
| 카카오 로그인 | `@react-native-kakao/core`, `@react-native-kakao/user` 3.2.0 | Expo config plugin을 제공하고 peer 의존성이 `expo >=52`, `react-native >=0.76`이다 |
| 토큰 보관 | `expo-secure-store` ~57.0.4 | 우리 서버 토큰을 키체인에 둔다. AsyncStorage는 평문이라 쓰지 않는다 |

카카오 패키지 문서 사이트 `rnkakao.dev`는 2026-11-20 확인 때 관계없는 사이트로 리다이렉트됐다.\
그래서 설정 방법은 npm 패키지에 들어 있는 config plugin 소스(`expo-config-plugin/build/withIos.js`)를 직접 읽고 확인했다. 저장소는 [mym0404/react-native-kakao](https://github.com/mym0404/react-native-kakao)다.

### 네이티브 설정

- `app.json`: `ios.usesAppleSignIn: true`와 `expo-apple-authentication` 플러그인. Apple 로그인 entitlement가 추가된다
- `app.config.js`: `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`가 있을 때만 카카오 플러그인을 넣는다. 키를 저장소에 남기지 않기 위해서다
  - 플러그인이 `kakao<앱 키>` URL 스킴과 `kakaokompassauth`, `kakaolink`, `kakaoplus` 쿼리 스킴을 추가한다. 기존 instagram 항목과 합쳐지는 것을 `expo config --type introspect`로 확인했다
  - `handleKakaoOpenUrl: true`로 카카오톡에서 돌아오는 URL을 AppDelegate에서 처리한다
- 키는 `frontend/.env.local`에 둔다(gitignore 대상). 같은 변수를 앱 실행 중 SDK 초기화에도 쓴다

### 취소와 실패 구분

- Apple: `ERR_REQUEST_CANCELED`
- 카카오: `Cancelled`(카카오계정 화면 취소), `AccessDenied`(카카오톡 동의 화면 취소). 패키지의 `RNCKakaoUserManager.swift`와 `RNCkakaoUtil.swift`에서 오류 코드가 이렇게 넘어오는 것을 확인했다
- 취소면 안내 없이 로그인 수단 선택 화면에 남는다. 그 밖의 실패(서버 오류, 네트워크 없음 포함)는 시안 03처럼 버튼 위에 FRD §3-2의 문구와 다시 시도 버튼을 띄운다. 다시 시도는 마지막에 고른 수단으로 다시 요청한다

### 화면과 코드

| 화면 | 파일 | 시안 |
|---|---|---|
| 홈 "내 계정" 버튼 | `frontend/src/app/(home)/index.tsx` | 01 |
| 로그인 수단 선택, 실패 안내 | `frontend/src/app/account/login.tsx` | 02a, 03 |
| 닉네임 입력(가입), 닉네임 변경 | `frontend/src/app/account/nickname.tsx` (`current` 파라미터가 있으면 변경) | 04a~c, 06 |
| 내 계정 | `frontend/src/app/account/index.tsx` | 05a, 05b |
| 서버 호출, 토큰 보관 | `frontend/src/lib/account.ts` | |
| 닉네임 규칙 | `frontend/src/lib/nickname.ts` (테스트 `nickname.test.ts`) | |

- **계정 입구는 `EXPO_PUBLIC_API_URL`이 있는 빌드에서만 보인다.** 서버를 배포하기 전에는 스토어·TestFlight 빌드에 이 값이 없어서 홈이 지금과 같다(ARCHIVE 라벨 유지)
- **가입을 마친 계정의 토큰만 키체인에 저장한다.** 닉네임 전 단계의 토큰은 메모리에만 둔다. 그래서 닫기, 뒤로 스와이프, 앱 종료 어느 쪽으로 나가도 로그인하지 않은 상태로 남고 다음 로그인 때 닉네임 입력부터 다시 한다(FRD §3-2 흐름, §4 닫기 버튼)
- 닉네임 입력 칸은 키보드 자동 대문자를 끄고, 입력하는 대로 소문자로 바꾼다(FRD §4)
- 내 계정 화면은 들어올 때마다 서버에서 닉네임을 다시 읽는다. 서버가 토큰을 거절하면(401) 토큰을 지우고 로그인 전 화면을 보여 준다

### 서버 (`backend/`)

Spring Boot 4.2.0, Java 21, Gradle. 로컬 개발 전용이며 배포하지 않았다.

| API | 요청 | 응답 |
|---|---|---|
| `POST /auth/apple` | `{ "identityToken" }` | `{ "token", "nickname" }`. `nickname`이 null이면 가입 미완료 |
| `POST /auth/kakao` | `{ "accessToken" }` | 위와 같음 |
| `GET /me` | 우리 토큰(`Authorization: Bearer`) | `{ "nickname", "provider" }` |
| `PUT /me/nickname` | `{ "nickname" }` + 우리 토큰 | 200 `{ "nickname", "provider" }`, 400 `INVALID_LENGTH`·`INVALID_CHARS`, 409 `DUPLICATE` |

Apple·카카오 토큰이 유효하지 않으면 401 `INVALID_PROVIDER_TOKEN`이다.

- **Apple identity token**: Apple 공개키(`https://appleid.apple.com/auth/keys`)로 서명을 확인하고 `iss`, `aud`(번들 ID `com.mechuri.runmechuri`), 만료를 검사한다. `spring-boot-starter-security-oauth2-resource-server`의 `NimbusJwtDecoder`를 쓴다([Apple 문서](https://developer.apple.com/documentation/signinwithapple/verifying-a-user))
- **카카오 access token**: `GET https://kapi.kakao.com/v1/user/access_token_info`로 회원번호를 받는다. **응답의 `app_id`가 우리 앱(1658837)이 아니면 거절한다.** 다른 앱에서 발급된 카카오 토큰으로 우리 계정에 로그인하는 것을 막기 위해서다([카카오 문서](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#get-token-info))
- **계정**: `account(provider, provider_user_id, nickname)` 테이블 하나. (provider, provider_user_id)와 nickname에 유니크 제약을 건다. 영문을 소문자로만 저장하므로 nickname 유니크 제약이 곧 중복 검사다
- **닉네임**: 앱이 보낸 값을 믿지 않고 서버에서 앞뒤 공백 제거, 소문자 변환, 2~10자, `[가-힣a-z0-9]` 검사를 다시 한다
- **우리 토큰**: HS256 JWT, 30일. refresh 토큰은 없다(코드에 `ponytail:` 주석). 서명 키는 `backend/config/application.properties`(gitignore)의 `app.jwt-secret`에 둔다
- **DB**: H2 파일(`backend/data/`, gitignore). 서버를 다시 켜도 계정이 남는다

### 로컬 테스트 방법

1. 서명 키를 만든다. 한 번만 하면 된다

   ```bash
   cd backend && mkdir -p config && echo "app.jwt-secret=$(openssl rand -base64 32)" > config/application.properties
   ```

2. 서버를 띄운다

   ```bash
   cd backend && ./gradlew bootRun
   ```

3. 앱에 서버 주소를 넣는다. `frontend/.env.local`에 아래 줄을 추가한다. Mac IP는 `ipconfig getifaddr en0`으로 확인한다

   ```
   EXPO_PUBLIC_API_URL=http://<Mac IP>:8080
   ```

4. 개발 앱을 다시 빌드해 설치한다(네이티브 패키지가 추가돼서 필요하다). `npx expo prebuild` 후 Xcode에서 Run, 또는 `npx expo run:ios --device`. 이후 JS만 바꿀 때는 `npx expo start --dev-client --lan`

- 아이폰과 Mac은 같은 Wi-Fi에 있어야 한다. 처음 접속할 때 아이폰이 "로컬 네트워크" 권한을 물으면 허용한다
- 서버 테스트: `cd backend && ./gradlew test`

### 확인 체크리스트

자동 검증(2026-11-20 통과):

- [x] 서버 테스트 8개: 첫 로그인은 가입 미완료, 다시 로그인하면 같은 계정, 로그인 수단이 다르면 다른 계정, 닉네임 공백 제거·소문자 저장, 길이·허용 문자 위반 400, 다른 사람과 중복이면 대소문자가 달라도 409, 토큰 없거나 잘못된 Apple 토큰이면 401, 다른 앱의 카카오 토큰 거절, 실제 빈 구성 기동
- [x] 실제 서버 기동 후 Mac IP로 접속, 잘못된 Apple·카카오 토큰 401(카카오는 실제 카카오 API 응답)
- [x] 앱: `tsc --noEmit`, `eslint src/ modules/`(오류 0, 기존 경고 30), Jest 54개 묶음(닉네임 규칙 5개 추가)

실기기 확인(2026-11-21, 지민, iPhone 17, EAS 개발 빌드 `1.0.1(48)` + 로컬 Metro·서버):

- [x] 홈 오른쪽 위에 "내 계정" 외곽선 버튼이 보인다(시안 01)
- [x] 내 계정 → 로그인 전 문구와 "로그인" 버튼(시안 05a)
- [x] Apple로 계속하기 → 처음이면 닉네임 입력 화면(시안 04a)
- [x] 닉네임에 `새`를 넣으면 "2~10자로 입력해 주세요"와 완료 비활성(04b). 대문자를 치면 소문자로 바뀐다
- [x] 다른 계정이 쓰는 닉네임이면 "이미 쓰고 있는 닉네임이에요"(04c). 카카오로 가입한 닉네임을 Apple 가입에서 쓰면 확인할 수 있다
- [x] 완료 → 내 계정에 닉네임과 "Apple"이 보인다(05b)
- [x] 앱을 완전히 종료하고 다시 켜도 내 계정에 같은 닉네임이 보인다
- [x] 같은 수단으로 다시 로그인하면 닉네임 입력 없이 같은 계정으로 들어간다
- [x] 카카오로 계속하기도 위와 같이 동작한다. 로그인 수단에 "카카오"가 보인다
- [x] 닉네임 행 → 닉네임 변경(시안 06). 지금 닉네임과 같으면 완료가 막힌다
- [x] Apple·카카오 화면에서 취소하면 안내 없이 로그인 화면에 남는다
- [x] 서버를 끄고 로그인하면 "로그인하지 못했어요. 다시 시도해 주세요."와 다시 시도 버튼(시안 03)
- [x] 닉네임 화면에서 닫기를 누르고 다시 로그인하면 닉네임 입력부터 시작한다. 앱을 강제 종료해도 같다

### 실기기 확인 기록

- 확인한 빌드: EAS 개발 빌드 `348efa03-bb05-42e2-bfee-97b0f077a338`(`development` 프로필, 커밋 `8d3baa9`). 앱 화면 코드는 로컬 Metro에서 받았다
- 이 Mac의 Xcode 27.2로 직접 빌드한 앱은 시작하자마자 `UIScene life cycle is required for apps built with this SDK`로 실행되지 않았다. 로그인 코드와는 관계없는 빌드 환경 문제라 EAS 클라우드 빌드로 우회했다. 자세한 내용은 [빌드·개발 명령어 모음](../../ops/build-and-dev-commands.md) 2026-11-21 기록에 있다
- 로그아웃이 없어서, 다른 수단으로 다시 로그인하는 확인은 서버 서명 키를 바꿔 앱의 토큰을 무효로 만드는 방법을 썼다. 가입 중 닫기 확인 전에는 로컬 DB(`backend/data/`)를 비웠다
- 서버를 끈 상태에서 카카오 로그인 → 실패 카드 → 서버를 켠 뒤 다시 시도로 가입까지 이어지는 것을 확인했다

## 어긋남 기록

- 2026-11-20 서비스 이용약관 링크: FRD §3-1은 약관과 처리방침 링크를 함께 요구하지만, 약관은 아직 공개 URL이 없다([약관·처리방침 링크 FRD](../../specs/frd/public-policy-links.md)). 처리방침만 연결했고, 약관이 공개되면 추가한다
- 2026-11-20 FRD에 없는 문구를 시안과 구현에서 채웠다. FRD에 올릴지 정해야 한다
  - 로그인 화면의 "러닝 기록을 나만의 스토리로"(시안 02a 그대로)
  - 닉네임 저장 실패: "닉네임을 저장하지 못했어요. 다시 시도해 주세요." 시안 06은 "03과 같은 안내"라고 했지만, 03의 "로그인하지 못했어요"는 닉네임 변경에 맞지 않아 바꿨다
  - 내 계정 조회 실패: "계정 정보를 불러오지 못했어요. 다시 시도해 주세요."
- 2026-11-20 한글 자모: 서버는 완성형 한글만 받는다(자모 단독 `ㄱ`, `ㅏ` 불가). 앱은 입력 중인 자모를 막지 않는다. 막으면 한글을 조합하는 동안 오류가 깜빡이기 때문이다. 자모만 남은 채 완료하면 서버가 허용 문자 오류로 돌려준다
- 2026-11-20 시안 01은 "ARCHIVE · N" 라벨 자리를 내 계정 버튼이 대신한다. 계정 입구가 보이는 빌드에서만 그렇게 했고, 그 외 빌드는 지금처럼 라벨을 둔다
- 2026-11-20 시안 05b의 화살표·뒤로 아이콘은 기존 앱 헤더(`ScreenHeader`의 `←`)를 그대로 썼다. 다른 화면과 맞추기 위해서다
