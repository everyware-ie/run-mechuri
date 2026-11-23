# Apple·카카오 로그인과 회원가입

- FRD: [Apple·카카오 로그인과 회원가입 FRD](../../specs/frd/account-login.md) §1~§4, §5-1 첫 가입 시 일괄 업로드, §6 로그아웃, §7 탈퇴
- PRD: [Apple·카카오 로그인과 회원가입](../../specs/prd/account-login.md)
- 구현 상태: 구현 완료, 로그인 필수·백업은 실기기 일부 확인 (2026-11-23, [PR #143](https://github.com/everyware-ie/run-mechuri/pull/143))

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

## 로그아웃·탈퇴 착수 (2026-11-23)

사용자가 FRD §6 로그아웃, §7 탈퇴 구현을 요청했다("구현 완료하고 말해줘"). FRD에서 로그인 필수와 부딪치는 곳은 추천안으로 채우고 보고한다.

- 로그아웃·탈퇴 뒤에는 홈이 아니라 로그인 수단 선택으로 간다. 로그인이 필수라서다
- 탈퇴 확인 화면의 두 번째 문장을 "다시 가입하면 이 기록을 새 계정에 백업할 수 있어요."로 바꾼다
- 탈퇴하면 기기의 "올린 기록" 표시를 지운다. 서버 기록이 지워졌으니 다시 가입할 때 올라가야 한다. 로그아웃은 표시를 그대로 둔다(§5-1 계정 간 섞임 방지)

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
| 홈 "내 계정" 아이콘, 로그인 관문 | `frontend/src/app/(home)/index.tsx` | 01(아이콘만) |
| 로그인 수단 선택, 실패 안내, 나중에 하기 | `frontend/src/app/account/login.tsx` | 02a, 03 |
| 닉네임 입력(가입), 닉네임 변경 | `frontend/src/app/account/nickname.tsx` (`current` 파라미터가 있으면 변경) | 04a~c, 06 |
| 내 계정, 백업 상태 | `frontend/src/app/account/index.tsx` | 05b |
| 서버 호출, 토큰 보관, 로그인 관문 상태 | `frontend/src/lib/account.ts` | |
| 기록 백업 | `frontend/src/lib/backup.ts` (테스트 `backup.test.ts`) | |
| 닉네임 규칙 | `frontend/src/lib/nickname.ts` (테스트 `nickname.test.ts`) | |

- **계정 입구와 로그인 관문은 `EXPO_PUBLIC_API_URL`이 있는 빌드에서만 동작한다.** 서버를 배포하기 전에는 스토어·TestFlight 빌드에 이 값이 없어서 홈이 지금과 같다(ARCHIVE 라벨 유지, 로그인 묻지 않음)
- **로그인 관문(FRD §2)**: 홈이 첫 실행 안내 확인 다음에 `checkSession()`을 부른다. 저장된 토큰이 없거나 서버가 거절하면 로그인 수단 선택으로 교체한다. 앱을 연 뒤 한 번만 서버에 묻고, 네트워크 오류면 저장된 토큰을 믿고 통과시킨다
  - 관문으로 연 로그인 화면은 스택에 홈이 없어 닫기 버튼이 없다(`router.canGoBack()`). 나중에 하기를 누르면 이번 실행만 관문을 건너뛴다(메모리 플래그)
  - `GET /me`가 새 토큰을 주고 앱이 바꿔 저장한다. 30일 안에 한 번만 열어도 로그인이 이어진다
- **Apple·카카오 모듈은 로그인할 때만 불러온다**(`import()`). 홈과 측정 화면도 `account.ts`를 쓰는데, 이 모듈이 없는 바이너리에서 함께 로드되면 시작하자마자 꺼진다. Jest도 같은 이유로 실패했다
- **백업(FRD §5-1)**: 로그인·가입 직후와 앱을 열 때 `startBackup()`. 완료된 Runary 측정 기록 중 올린 적 없는 것만 한 건씩 `PUT /me/records/{id}`로 올리고, 한 건마다 올린 ID를 AsyncStorage에 저장한다. 앱이 닫혀도 다음 실행 때 남은 것부터 이어진다
  - 올린 기록 ID는 계정과 상관없이 남긴다. 같은 기기에서 다른 계정으로 가입해도 이전 계정의 기록이 섞이지 않는다
  - 진행 상황, 남은 건수, 마지막 백업 시각은 내 계정 화면에만 보인다
  - 측정 기능이 없는 빌드에는 Runary 기록이 없어 올릴 것이 없다
- **가입을 마친 계정의 토큰만 키체인에 저장한다.** 닉네임 전 단계의 토큰은 메모리에만 둔다. 그래서 닫기, 뒤로 스와이프, 앱 종료 어느 쪽으로 나가도 로그인하지 않은 상태로 남고 다음 로그인 때 닉네임 입력부터 다시 한다(FRD §3-2 흐름, §4 닫기 버튼)
- 닉네임 입력 칸은 키보드 자동 대문자를 끄고, 입력하는 대로 소문자로 바꾼다(FRD §4)
- 내 계정 화면은 들어올 때마다 서버에서 닉네임을 다시 읽는다. 서버가 토큰을 거절하면(401) 토큰을 지우고 로그인 수단 선택으로 보낸다
- 로그인·닉네임 요청을 기다리는 동안 화면을 닫으면 로그인을 끝내지 않는다. 닉네임 중복 응답이 늦게 와도 그 사이 글자를 고쳤다면 오류를 띄우지 않는다(PR #143 리뷰)

### 서버 (`backend/`)

Spring Boot 4.2.0, Java 21, Gradle. 로컬 개발 전용이며 배포하지 않았다.

| API | 요청 | 응답 |
|---|---|---|
| `POST /auth/apple` | `{ "identityToken" }` | `{ "token", "nickname" }`. `nickname`이 null이면 가입 미완료 |
| `POST /auth/kakao` | `{ "accessToken" }` | 위와 같음 |
| `GET /me` | 우리 토큰(`Authorization: Bearer`) | `{ "nickname", "provider", "token" }`. `token`은 새로 발급한 30일 토큰 |
| `PUT /me/nickname` | `{ "nickname" }` + 우리 토큰 | 200 `{ "nickname", "provider" }`, 400 `INVALID_LENGTH`·`INVALID_CHARS`, 409 `DUPLICATE` |
| `PUT /me/records/{recordId}` | FRD §5-5 올리는 것 + 우리 토큰 | 204. 같은 기록을 다시 보내도 한 건만 남는다 |
| `DELETE /me` | `{ "appleAuthorizationCode" }`(Apple 계정만) + 우리 토큰 | 204. 계정, 닉네임, 백업 기록을 지운다(FRD §7-2) |

Apple·카카오 토큰이 유효하지 않으면 401 `INVALID_PROVIDER_TOKEN`이다.

- **Apple identity token**: Apple 공개키(`https://appleid.apple.com/auth/keys`)로 서명을 확인하고 `iss`, `aud`(번들 ID `com.mechuri.runmechuri`), 만료를 검사한다. `spring-boot-starter-security-oauth2-resource-server`의 `NimbusJwtDecoder`를 쓴다([Apple 문서](https://developer.apple.com/documentation/signinwithapple/verifying-a-user))
- **카카오 access token**: `GET https://kapi.kakao.com/v1/user/access_token_info`로 회원번호를 받는다. **응답의 `app_id`가 우리 앱(1658837)이 아니면 거절한다.** 다른 앱에서 발급된 카카오 토큰으로 우리 계정에 로그인하는 것을 막기 위해서다([카카오 문서](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#get-token-info))
- **계정**: `account(provider, provider_user_id, nickname)` 테이블 하나. (provider, provider_user_id)와 nickname에 유니크 제약을 건다. 영문을 소문자로만 저장하므로 nickname 유니크 제약이 곧 중복 검사다
- **닉네임**: 앱이 보낸 값을 믿지 않고 서버에서 앞뒤 공백 제거, 소문자 변환, 2~10자, `[가-힣a-z0-9]` 검사를 다시 한다
- **우리 토큰**: HS256 JWT, 30일. refresh 토큰은 없다(코드에 `ponytail:` 주석). 서명 키는 `backend/config/application.properties`(gitignore)의 `app.jwt-secret`에 둔다
- **기록(`run_record`)**: 계정 ID + 기록 ID에 유니크 제약. 본문은 `RecordUpload`(시작·종료 시각, 시간, 거리, 평균 페이스, 평균·최고 심박, 걸음 수, 평균 케이던스, 좌표, 심박 시계열)로 받아 JSON으로 보관한다. 이 형식에 없는 필드(배터리, GPS 공백, 오류 같은 진단 정보)는 받아도 버린다
- **탈퇴와 Apple 토큰 해지**: 앱이 탈퇴 직전에 Apple 로그인을 한 번 더 받아 authorization code를 보낸다. 서버는 .p8 키로 client secret(ES256 JWT)을 만들고 `/auth/token`으로 refresh token을 받은 뒤 바로 `/auth/revoke`로 해지한다. 그래서 Apple refresh token을 보관하지 않는다
  - .p8 키가 설정되지 않으면 해지만 건너뛰고 경고 로그를 남긴다. 해지가 실패해도 계정은 지운다
  - 카카오 연결 끊기는 앱이 카카오 SDK(`unlink`)로 한다. 서버에 카카오 어드민 키를 두지 않기 위해서다. 카카오 로그인이 만료돼 실패해도 계정은 지운다
- **서명 키 길이**: Base64로 풀어 32바이트 미만이면 서버가 시작하지 않는다(PR #143 리뷰)
- **DB**: H2 파일(`backend/data/`, gitignore). 서버를 다시 켜도 계정이 남는다

### 로컬 테스트 방법

Apple 토큰 해지까지 확인하려면 Sign in with Apple 키가 필요하다. Apple Developer → Keys에서 Sign in with Apple을 켠 키를 만들고 `.p8`을 `backend/config/`에 둔다(gitignore). `backend/config/application.properties`에 두 줄을 넣는다. 없으면 해지만 건너뛴다.

```
app.apple.key-id=<Key ID>
app.apple.private-key-path=config/AuthKey_<Key ID>.p8
```

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

2026-11-22 로그인 필수·첫 가입 백업 추가분

자동 검증:

- [x] 서버 테스트 13개(기록 5개 추가): 같은 기록은 한 건만, 계정마다 따로 보관, 진단 정보 저장 안 함, 토큰 없이 업로드 불가, 내 정보 조회 시 새 토큰
- [x] 앱: `tsc --noEmit`, `eslint src/ modules/`(오류 0, 기존 경고 30), Jest 57개 묶음 409개(백업 2개 추가: 올릴 기록 고르기, 진단 정보 제외)

실기기 확인(2026-11-23, 지민, iPhone 17, EAS 개발 빌드 `1.0.1(48)` + 로컬 Metro·서버). 사용자 결정으로 일부는 확인하지 않고 머지했다:

- [x] 로그인하지 않은 상태로 앱을 열면 로그인 수단 선택이 나오고 닫기 버튼이 없다
- [x] 가입하면 홈으로 가고, 내 계정에 "기록 백업 중 n/N"이 보였다가 마지막 백업 시각이 나온다
- [x] 서버에 Runary 측정 기록이 올라갔다. 마지막 백업 시각은 올릴 기록을 모두 올린 뒤에만 나오므로 그것으로 확인했다(건수 대조는 하지 않음)
- [ ] 백업 중 앱을 종료하고 다시 열면 남은 것만 올라가고 중복이 없다 → 실기기 확인 생략. 한 건마다 올린 ID를 저장하는 코드와 서버의 "같은 기록은 한 건만" 테스트로 대신함
- [ ] 앱을 다시 열면 로그인을 묻지 않는다 → 실기기 확인 생략(사용자 결정)
- [ ] 서버를 끄고 로그인 화면에서 로그인하면 실패 카드에 "나중에 하기"가 있고, 누르면 홈으로 간다. 홈의 내 계정을 누르면 닫기 버튼이 있는 로그인 화면이 나온다 → 실기기 확인 생략(사용자 결정)
- [x] 측정 화면 아래 문구가 "위치와 기록은 이 기기에 보관하고 내 계정에 백업해요"다
- [ ] 서명 키를 바꿔 로그아웃한 뒤 다른 수단으로 가입하면 이전 계정에 올린 기록은 다시 올라가지 않는다 → 실기기 확인 생략. 백업 테스트(올린 기록 제외)로 대신함

2026-11-23 로그아웃·탈퇴 추가분

자동 검증:

- [x] 서버 테스트 17개(탈퇴 4개 추가): 탈퇴하면 계정·기록 삭제와 같은 Apple 계정 재가입, Apple 해지 실패해도 삭제, code 없으면 해지 없이 삭제, client secret 서명·클레임
- [x] 앱: `tsc --noEmit`, `eslint src/ modules/`(오류 0, 기존 경고 30), Jest 58개 묶음 413개(탈퇴 4개 추가: Apple code 전달, Apple 취소 시 중단, 카카오 끊기 실패해도 삭제, 네트워크 실패)

실기기에서 확인할 것(개발 앱 다시 빌드 불필요, Metro만):

- [ ] 내 계정 아래에 "로그아웃" 버튼과 덜 눈에 띄는 "탈퇴"가 있다
- [ ] 로그아웃 → "로그아웃할까요?" 창. 확인하면 로그인 수단 선택으로 간다. 다시 로그인하면 기록이 다시 올라가지 않는다
- [ ] 탈퇴 → 확인 화면(시안 08) → 탈퇴하기. Apple 계정이면 Apple 창이 한 번 더 뜨고, 취소하면 탈퇴하지 않는다
- [ ] 탈퇴하면 로그인 수단 선택으로 가고, 같은 수단으로 로그인하면 닉네임 입력부터 시작한다. 가입하면 기기 기록이 다시 올라간다
- [ ] 카카오 계정 탈퇴 뒤 카카오 계정 설정의 "연결된 서비스"에서 Runary가 빠졌다
- [ ] 서버를 끄고 탈퇴하면 "인터넷에 연결한 뒤 다시 시도해 주세요."

### 실기기 확인 기록

- 확인한 빌드: EAS 개발 빌드 `348efa03-bb05-42e2-bfee-97b0f077a338`(`development` 프로필, 커밋 `8d3baa9`). 앱 화면 코드는 로컬 Metro에서 받았다
- 이 Mac의 Xcode 27.2로 직접 빌드한 앱은 시작하자마자 `UIScene life cycle is required for apps built with this SDK`로 실행되지 않았다. 로그인 코드와는 관계없는 빌드 환경 문제라 EAS 클라우드 빌드로 우회했다. 자세한 내용은 [빌드·개발 명령어 모음](../../ops/build-and-dev-commands.md) 2026-11-21 기록에 있다
- 로그아웃이 없어서, 다른 수단으로 다시 로그인하는 확인은 서버 서명 키를 바꿔 앱의 토큰을 무효로 만드는 방법을 썼다. 가입 중 닫기 확인 전에는 로컬 DB(`backend/data/`)를 비웠다
- 서버를 끈 상태에서 카카오 로그인 → 실패 카드 → 서버를 켠 뒤 다시 시도로 가입까지 이어지는 것을 확인했다

## 어긋남 기록

- 2026-11-22 좌표 정확도: FRD §5-5는 "좌표(정확도 포함)"를 올리라고 하지만, 측정 모듈이 JS로 넘기는 좌표에는 정확도가 없다(위도, 경도, 시각, 구간). 네이티브는 고치지 않고 정확도 없이 올린다
- 2026-11-22 심박: 측정 모듈이 JS로 넘기는 심박은 40구간으로 요약한 `heartChart`뿐이라 그것을 올린다. 원본 심박 샘플은 올라가지 않는다
- 2026-11-22 "나중에 하기": FRD 초안은 "네트워크가 없으면"이었지만 오프라인 여부를 가려낼 수 없어 모든 로그인 실패에 둔다. FRD §2를 함께 고쳤다
- 2026-11-22 측정 화면 문구 "위치와 기록은 이 기기에 보관하고 내 계정에 백업해요"는 FRD에 없던 문구라 새로 썼다. 내부 측정 FRD에 함께 적었다

- 2026-11-20 서비스 이용약관 링크: FRD §3-1은 약관과 처리방침 링크를 함께 요구하지만, 약관은 아직 공개 URL이 없다([약관·처리방침 링크 FRD](../../specs/frd/public-policy-links.md)). 처리방침만 연결했고, 약관이 공개되면 추가한다
- 2026-11-20 FRD에 없는 문구를 시안과 구현에서 채웠다. FRD에 올릴지 정해야 한다
  - 로그인 화면의 "러닝 기록을 나만의 스토리로"(시안 02a 그대로)
  - 닉네임 저장 실패: "닉네임을 저장하지 못했어요. 다시 시도해 주세요." 시안 06은 "03과 같은 안내"라고 했지만, 03의 "로그인하지 못했어요"는 닉네임 변경에 맞지 않아 바꿨다
  - 내 계정 조회 실패: "계정 정보를 불러오지 못했어요. 다시 시도해 주세요."
- 2026-11-20 한글 자모: 서버는 완성형 한글만 받는다(자모 단독 `ㄱ`, `ㅏ` 불가). 앱은 입력 중인 자모를 막지 않는다. 막으면 한글을 조합하는 동안 오류가 깜빡이기 때문이다. 자모만 남은 채 완료하면 서버가 허용 문자 오류로 돌려준다
- 2026-11-20 시안 01은 "ARCHIVE · N" 라벨 자리를 내 계정 버튼이 대신한다. 계정 입구가 보이는 빌드에서만 그렇게 했고, 그 외 빌드는 지금처럼 라벨을 둔다
- 2026-11-20 시안 05b의 화살표·뒤로 아이콘은 기존 앱 헤더(`ScreenHeader`의 `←`)를 그대로 썼다. 다른 화면과 맞추기 위해서다
- 2026-11-23 백업 시각 형식을 `11.20 13:02`에서 `11월 23일 14시 03분`으로 바꿨다(사용자 요청). FRD §2-1을 함께 고쳤다
- 2026-11-23 로그아웃 확인 창은 시안 07의 바텀 시트 대신 iOS 기본 확인 창(Alert)으로 만들었다. 문구와 버튼은 FRD §6 그대로다. 시트로 바꾸려면 디자인을 다시 정한다
- 2026-11-23 로그아웃·탈퇴 뒤에는 FRD 초안의 "홈으로"가 아니라 로그인 수단 선택으로 간다. 로그인이 필수라서다. FRD §6, §7을 함께 고쳤다
- 2026-11-23 탈퇴 확인 화면의 두 번째 문장을 "다시 가입하면 이 기록을 새 계정에 백업할 수 있어요."로 정했다(FRD `[확인 필요]` 해소, 사용자 확인 필요)
