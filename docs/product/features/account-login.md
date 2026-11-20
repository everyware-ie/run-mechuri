# Apple·카카오 로그인과 회원가입

- FRD: [Apple·카카오 로그인과 회원가입 FRD](../../specs/frd/account-login.md) §1~§4
- PRD: [Apple·카카오 로그인과 회원가입](../../specs/prd/account-login.md)
- 구현 상태: 진행 중

## 착수 확인

2026-11-20에 FRD §1 사용자가 확인할 핵심, §2 로그인 입구, §3 가입과 로그인, §4 닉네임을 사용자와 확인했다.\
FRD는 아직 `draft`다. PR 전에 approved로 올리고 FRD §10 함께 개정하는 문서를 같은 PR에서 고치기로 사용자와 정했다.

이번 범위에서 정한 것은 아래와 같다.

| 항목 | 결정 |
|---|---|
| 브랜치 | PRD·FRD가 있는 `jminkkk/docs/account-login`에서 분기 |
| 서버 | Spring Boot, Java 21. `backend/`에 새로 만든다 |
| 토큰 보관 | `expo-secure-store` 추가 |
| 로컬 서버 접속 | 같은 Wi-Fi의 Mac IP로 http 접속. 주소는 `EXPO_PUBLIC_API_URL`로 주입 |
| 내 계정 화면 | 닉네임과 로그인 수단만 표시. 백업 상태, 로그아웃, 탈퇴는 다음 단계 |
| 크루 진입 입구(FRD §2-2) | 크루 화면이 없어 코드는 만들지 않는다 |
| 화면 디자인 | 로그인·회원가입·내 계정 화면은 지민이 디자인과 개발을 함께 맡는다. Claude Design으로 시안을 먼저 만든 뒤 구현 방식을 정한다. 2026-11-20 [계정 화면 시안](../../ideation/jminkkk/2026-11-20-account-login-screens.html)이 나왔다 |

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
- 지금의 로그인 수단 선택 화면과 홈의 "내 계정" 버튼은 연동 확인용 임시 화면이다. [계정 화면 시안](../../ideation/jminkkk/2026-11-20-account-login-screens.html)대로 바꾼다
- 취소면 안내 없이 로그인 수단 선택 화면에 남고, 그 밖의 실패는 FRD §3-2의 문구와 다시 시도 버튼을 띄운다

## 어긋남 기록

- 2026-11-20 서비스 이용약관 링크: FRD §3-1은 약관과 처리방침 링크를 함께 요구하지만, 약관은 아직 공개 URL이 없다([약관·처리방침 링크 FRD](../../specs/frd/public-policy-links.md)). 처리방침만 연결했고, 약관이 공개되면 추가한다
