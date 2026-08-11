# 플랫폼 기술 검토: 러닝 앱이 OS에서 뭘 할 수 있고, 뭐가 막히나

*2026-08-11 · jminkkk · [#1](https://github.com/everyware-ie/run-mechuri/issues/1) 후속 · 컨셉 발산이 아니라 **플랫폼 API 사실 확인** 노트*

> 성격: 이 노트는 아이디어를 내거나 컨셉의 우열을 가리는 글이 **아니다**. 08-04 회의에서 나온 컨셉들이 전제하는 기능(GPS 기록·건강 데이터·지도·외부 앱 공유)이 **일반 개발자에게 어디까지 열려 있는지**를 확인한 사실 정리다.
>
> - 확인일: **2026-08-11**. **각 절 머리에 그 절의 1차 출처(플랫폼 공식 문서) 링크를 달아뒀다** — 직접 확인할 수 있게. 전체 목록은 문서 말미 [출처](#출처) 절
> - 사실 주장은 **공식 문서 원문에만 근거**한다. 블로그·위키 등 2차 자료는 배경 이해용으로만 쓰고 출처 절에서 분리해뒀다
> - `[확인 필요]` 표시 항목은 **실기기·코드로 검증하지 않았거나, 2차 자료 기반이라 공식 확인이 남은 것**이다
> - "함의"로 시작하는 문단은 **개인 판단**이고 팀 결정이 아니다

## 왜 이 노트를 썼나

08-04 회의에서 다음 발산 주제가 "공유하고 싶은 기능"으로 좁혀졌다([#1](https://github.com/everyware-ie/run-mechuri/issues/1)). 그런데 지금까지 쌓인 컨셉이 전부 **백그라운드 GPS 기록 · 건강 데이터 접근 · 지도 표시 · 인스타 공유**를 당연한 전제로 깔고 있고, 이게 실제로 허용되는지는 아무도 확인하지 않았다.

특히 두 노트가 스스로 미결로 남긴 지점이 여기다:

- JiEung2 08-04: *"기본기 비용이 이 기능보다 크다 — 정확한 GPS 기록·워치 연동이 부실하면 공유가 예뻐도 쓰지 않는다"* `[미결]`
- JiEung2 08-04: 자동 촬영 안을 **OS 제약(백그라운드 카메라 차단)** 때문에 접었다 — 즉 이미 한 번 플랫폼 벽에 부딪혔다

컨셉을 고르기 전에 "애초에 되는가"를 확정해두려는 것이 목적이다.

---

## 결론 요약

1. **iOS는 러닝 앱에 필요한 걸 사실상 다 열어준다.** 특히 **HealthKit은 Apple에 신청하고 기다리는 승인 절차가 존재하지 않는다** — Xcode에서 capability 토글이 전부다. 위치도 `Always` 권한 없이 백그라운드 추적이 된다.
2. **막히는 건 두 곳이고, 각각 다른 사람의 컨셉을 직격한다.** ① 인스타그램 스토리에 **링크 스티커를 API로 심을 수 없다** → JiEung2의 D(코스 딥링크) ② **한국 지도 반출 규제로 구글맵이 후보에서 탈락** → 내 여정형(한국 실제 루트).
3. **Android가 iOS보다 관문이 많다.** Health Connect는 Play Console 폼 제출이 **필수**이고 2026-01부터 요건이 강화됐다. 위치도 포그라운드 서비스 + 상시 알림이 강제된다.

---

## 1. iOS

### 1-1. 위치 — Core Location

> 1차 출처: [Handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background) · [`allowsBackgroundLocationUpdates`](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates) · [Requesting authorization to use location services](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services) · [`UIBackgroundModes`](https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes)

| 항목 | 사실 |
|---|---|
| 백그라운드 위치 추적 | **가능.** 타깃의 **Signing & Capabilities > Background Modes > Location updates** 체크. Xcode가 `Info.plist` 키를 자동으로 넣어준다 |
| **Apple이 명시한 정당 용도** | 공식 문서가 백그라운드 위치를 써도 되는 예로 **"하이킹이나 피트니스 워크아웃 중의 정확한 경로 추적"**을 직접 들고 있다 ★ |
| 필요한 권한 수준 | **`When In Use`로 충분.** `Always`는 필요 없다 |
| `Always`가 필요한 경우 | 앱이 **종료된 뒤에도** significant location change·region monitoring으로 앱을 깨워야 할 때. `When In Use`는 앱이 종료되면 사용자가 다시 열어야 위치가 재개된다 |
| Apple 승인 절차 | **없음.** capability 체크 + `Info.plist` usage description |
| 최신 API | `CLBackgroundActivitySession`으로 백그라운드 활동 세션을 열어 업데이트를 받는다. 백그라운드로 내려가기 전에 사용자에게 위치 수집을 고지할 책임은 앱에 있다 |
| 플랫폼 제외 | **visionOS는 백그라운드 위치 업데이트를 받지 못한다.** macOS는 앱을 suspend하지 않으므로 이 설정 자체가 불필요 |

**함의(개인 판단).** 러닝은 사용자가 "시작"을 눌러 세션을 여는 구조라 `When In Use`로 충분하다. 게다가 **Apple이 공식 문서에서 피트니스 경로 추적을 백그라운드 위치의 정당한 사례로 예시**하고 있어, 심사에서 사용 정당성을 설명하기 좋은 위치다. 가장 거부감 큰 `Always`를 요구하지 않아도 되는 것도 권한 수락률에 유리하다.

### 1-2. 건강 데이터 — HealthKit ★

이 절이 이번 검토에서 가장 중요하다. **HealthKit은 신청서를 내고 Apple의 승인을 기다리는 절차가 없다.**

> 1차 출처: [Setting up HealthKit](https://developer.apple.com/documentation/healthkit/setting-up-healthkit) · [Protecting user privacy (HealthKit)](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) · [`HKWorkoutRoute`](https://developer.apple.com/documentation/healthkit/hkworkoutroute) · [Accessing a User's Clinical Records](https://developer.apple.com/documentation/healthkit/accessing-a-user-s-clinical-records) · [HealthKit Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit)

| 항목 | 사실 |
|---|---|
| 사용 방법 | Xcode에서 프로젝트를 선택하고 **HealthKit capability를 추가**한다. 이게 전부다 |
| 사전 승인 폼 | **존재하지 않는다.** 기본 health·fitness 데이터는 토글로 켜는 capability다 |
| 유일한 예외 | **Clinical Health Records**(FHIR 임상기록). 공식 문서 원문: *"앱이 사용자의 임상기록에 접근해야 하는 경우에만 Clinical Health Records 체크박스를 선택하라. 실제로 사용하지 않으면서 이 capability를 켜면 **App Review가 앱을 거부할 수 있다**"* — 즉 사전 승인이 아니라 **심사 시점 평가**다 |
| 우리가 쓸 데이터 | 워크아웃(`HKWorkout`), 달리기 거리(`distanceWalkingRunning`), 심박, **경로(`HKWorkoutRoute`)** — 전부 basic fitness data. 예외에 해당하지 않는다 |
| 필수 조건 | ① usage description 키(읽기·쓰기 각각) — **없으면 권한 요청 시 앱이 크래시한다** ② 데이터 타입별 사용자 명시 동의 ③ **건강 데이터를 광고에 사용 금지** ④ 사용자 동의 없이 제3자 공개 금지, **판매 금지** ⑤ 용도가 health/fitness임이 마케팅 문구와 UI에서 명확할 것 |

**검증 중 새로 발견한 실무 제약 2건** — 회의에서 짚을 가치가 있다:

1. **기기가 잠기면 HealthKit 스토어가 암호화되어 백그라운드 읽기가 실패할 수 있다.** 공식 문서 원문: *"디바이스가 잠기면 스토어를 암호화한다. 그 결과 **백그라운드 실행 중에는 스토어를 읽지 못할 수 있다.** 다만 쓰기는 잠긴 상태에서도 가능하다 — 임시 캐시했다가 잠금 해제 시 저장한다."*
   → 러닝 중(화면 잠금 상태)에 HealthKit을 **읽어서** 뭔가 하려는 설계는 위험하다. **쓰기는 안전**하다.
2. **HealthKit capability를 켜면 Xcode가 `healthkit`을 required device capabilities에 자동 추가**해서, 미지원 기기에서는 설치·구매가 아예 차단된다. 필수가 아니라면 `Info.plist`에서 해당 항목을 지워야 한다. 또한 **iPadOS 16 이전과 macOS에서는 HealthKit을 쓸 수 없다.**

**`HKWorkoutRoute`가 이번 검토의 핵심 발견이다.** 공식 문서상 *"워크아웃의 경로 데이터를 담는 샘플"*이며, 위치 데이터는 **`CLLocation` 객체 배열**로 저장된다. 쓰기는 `HKWorkoutRouteBuilder`에 러닝 중 위치를 계속 넘기고 종료 시 route를 만드는 방식, 읽기는 데이터가 크기 때문에 [`HKWorkoutRouteQuery`](https://developer.apple.com/documentation/healthkit/hkworkoutroutequery)로 **배치 비동기 조회**하는 방식이다. 사용자가 동의하면 **다른 앱이 저장해둔 경로도 읽을 수 있다.**

**함의(개인 판단).** 이게 사실이라면 "GPS 트래커를 우리가 처음부터 다 만들어야 하는가"라는 전제 자체가 흔들린다. 최소한 **과거 러닝 데이터를 가진 상태로 앱을 시작**할 수 있고, 경로 기반 컨셉(A/B/C)의 콜드스타트 문제도 완화된다.

> `[확인 필요]` **NRC·스트라바가 실제로 `HKWorkoutRoute`까지 저장하는지는 확인하지 않았다.** 워크아웃 요약(거리·시간·칼로리)을 건강 앱에 쓰는 앱은 많지만, 좌표열까지 넣는지는 앱마다 다르다. **내 아이폰의 건강 앱에서 NRC 워크아웃 하나를 열어 경로 지도가 뜨는지 보면 즉시 판별된다** — 회의 전에 확인 가능한 항목.

### 1-3. 지도 — MapKit

- 앱 내 지도 표시는 **무료·승인 불필요**([Apple Maps for Developers](https://developer.apple.com/maps/)). 한국 지도도 iOS 6부터 정식 서비스 중이고, 상세 데이터는 국내 서버에 보관하는 구조다.
- `[확인 필요]` 다만 **한국 지도 데이터 갱신이 2022년 중반 이후 정체됐다**는 사용자 보고가 있다. 위성 줌도 한국은 제한적이다. 실제 품질은 직접 확인 필요.

---

## 2. Android — iOS보다 관문이 많다

### 2-1. 위치

> 1차 출처: [위치 권한 요청](https://developer.android.com/develop/sensors-and-location/location/permissions) · [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)

| 항목 | 사실 |
|---|---|
| 러닝 세션 중 위치 추적 | **Foreground Service** 방식. `FOREGROUND_SERVICE_LOCATION` 권한 + **사용자에게 보이는 상시 알림이 강제** |
| `ACCESS_BACKGROUND_LOCATION` | 러닝 세션 용도라면 **불필요**. 포그라운드 서비스가 커버한다 |
| 이 권한을 요청하면 | Play 심사에서 **별도 정당화가 필요**해진다. 요청하지 않는 설계가 유리 |

### 2-2. 건강 데이터 — Health Connect

iOS와 결정적으로 다른 지점이다.

> 1차 출처: [Publish your health app on Google Play](https://developer.android.com/health-and-fitness/health-connect/publish) · [Android Health Permissions: Guidance and FAQs (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/12991134) · [Health Connect data types](https://developer.android.com/health-and-fitness/health-connect/data-types)

| 항목 | 사실 |
|---|---|
| Play Console 선언 | **필수.** App content 페이지의 **Health apps form**을 제출해야 한다 |
| 미제출 시 | 해당 데이터 타입 접근이 **차단**된다. 폼을 안 낸 상태로는 앱 등록 변경 심사도 못 올린다 |
| 2026-01 강화 | 단순 선언을 넘어 **의료기기 라벨링 체계**, Health Connect 데이터 사용 정당화 강화, 연령 제한 신호의 건강 프로파일링 사용 전면 금지가 도입됐다 |
| 우리 데이터 타입 | 운동·거리는 민감도가 낮은 축이라 정당화 부담은 상대적으로 작을 것으로 보이나(개인 판단), **폼 제출 자체는 면제되지 않는다** |

**함의(개인 판단).** "iOS 먼저, Android 나중"이 기술적으로도 합리적이다. iOS는 토글만으로 시작할 수 있는 반면 Android는 스토어 심사 프로세스가 개발 초기부터 끼어든다.

---

## 3. 외부 공유 — 인스타그램 ★ (JiEung2 컨셉 직격)

> 1차 출처: [Meta for Developers — Sharing to Stories](https://developers.facebook.com/docs/instagram-platform/sharing-to-stories) (2026-08-11 원문 확인) · [Facebook App ID 요구사항 공지(2022-10)](https://developers.facebook.com/blog/post/2022/10/10/introducing-important-update-to-Instagram-sharing-to-stories/)

Instagram 스토리 컴포저는 **배경 레이어 + 스티커 레이어** 두 층으로 구성되고, 외부 앱은 이 두 층에 넣을 에셋을 전달할 수 있다. iOS는 **커스텀 URL 스킴 + 페이스트보드**, Android는 **implicit intent** 방식이다.

**공식 문서가 명시한, 전달 가능한 데이터 전부:**

| 필드 | 사양 |
|---|---|
| Facebook App ID | **필수.** 2023년 1월부터 없으면 *"The app you shared from doesn't currently support sharing to Stories"* 에러가 뜬다 |
| 배경 이미지 | JPG·PNG / 최소 **720×1280** / 권장 비율 9:16, 9:18 |
| 배경 영상 | H.264·H.265·WebM / 1080p 가능 / **최대 20초** / 50MB 미만 권장 |
| 스티커 | JPG·PNG / 권장 **640×480**. 배경 위에 얹히고 사용자가 컴포저에서 추가 편집 가능 |
| 배경 그라데이션 | top/bottom 색상 hex 두 개. 같으면 단색, 다르면 그라데이션. 배경 에셋이 있으면 무시됨 |

등록: `Info.plist`의 `LSApplicationQueriesSchemes`에 `instagram-stories` 추가 (iOS).

**❌ 이 표에 링크 필드가 없다는 것이 핵심이다.** 공식 문서가 열거한 전달 가능 데이터는 위가 전부이고, **URL·링크 스티커를 넣는 파라미터는 존재하지 않는다.** Spotify류 사례는 별도 파트너십으로 봐야 한다.

**함의.** JiEung2의 **경로 오버레이 카드 내보내기는 기술적으로 성립한다** ✅ — 배경 영상 + 경로 오버레이 스티커 조합이 정확히 이 API가 지원하는 형태다. 다만 **배경 영상 20초 제한**은 설계에 바로 반영해야 한다(JiEung2 노트가 가정한 "영상 15초"는 이 안에 들어온다). 에셋이 기기 로컬 파일이어야 하므로 **합성·인코딩은 온디바이스**에서 끝내는 구조가 된다.

**반면 D(코스 추천 → 그대로 뛰기)의 "딥링크를 스토리에 심는다"는 이 경로로는 불가능하다.** JiEung2가 노트에서 딥링크 vs QR을 저울질하며 *"인스타그램 정책상 어디까지 허용되는지 확인 필요"* `[미결]`로 남긴 질문의 답은 **딥링크 쪽이 막힌다**이다. D를 하려면 QR/워터마크가 사실상 유일한 선택지다.

---

## 4. 지도 — 한국 규제 (여정형 직격)

- 한국은 **정밀 지도 데이터의 국외 반출을 제한**한다(국가 안보 사유). 그 결과 **구글맵은 한국에서 도보 경로·대중교통 경로가 제대로 동작하지 않는다** — 경로 알고리즘이 완전한 국내 데이터를 쓰지 못하기 때문이다. 구글 본사도 한국어 공식 블로그에서 이 사안을 별도로 해명하고 있다: [구글 지도 데이터 관련 주요 질의에 대한 안내](https://blog.google/intl/ko-kr/company-news/inside-google/google-maps-data-export-qa-kr/)
- 네이버 지도·카카오맵은 완전한 국내 데이터를 쓴다. 개발자 문서: [카카오맵 API](https://developers.kakao.com/docs/latest/ko/kakaomap/common) · [네이버 클라우드 플랫폼 Maps](https://www.ncloud.com/product/applicationService/maps)
- Apple 지도를 쓸 경우: [Apple Maps for Developers (MapKit)](https://developer.apple.com/maps/)
- `[확인 필요]` **카카오맵 API의 무료 쿼터 운영 방식이 최근 변경됐다.** 구체 수치·조건은 확인하지 못했다([카카오 데브톡 공지](https://devtalk.kakao.com/t/topic/150295)). 네이버 지도 API 요금 조건도 미확인.

**함의.** 내 여정형 컨셉(제주 올레·국토종주를 **실제 지도 위에서** 전진)은 지도 위 경로 표현이 코어라서, **구글맵은 후보에서 빠진다.** 선택지는 카카오맵/네이버 지도 API 또는 MapKit(iOS 한정). 지도 SDK 선택이 플랫폼 선택과 얽히는 구조다.

---

## 5. 컨셉별 매핑

08-04 이후 쌓인 컨셉을 "OS가 막는가"로 다시 본 표. 난이도는 개인 판단이다.

| 컨셉 | OS/플랫폼이 막는 것 | 우리가 만들어야 하는 것 | 확인 필요 |
|---|---|---|---|
| **경로 오버레이 공유** (JiEung2 08-04, 나머지의 베이스) | **없음** ✅ 인스타 배경+스티커 API가 정확히 이 형태를 지원 | GPS 트랙 기록, 경로→선 렌더링, 영상 합성·인코딩 | 인코딩 대기시간, 인스타 압축 시 선 뭉개짐 |
| **A. 오늘의 크루** (콜라주) | **없음** ✅ 순수 서버·클라이언트 문제 | 친구·그룹 기능(**현재 없음**), 경로 정규화, 레이아웃 | "같은 날" 기준(정책 문제, 기술 아님) |
| **B. 성장 비교 카드** | **없음** ✅ | 과거 데이터 조회. HealthKit 과거 워크아웃을 읽으면 **가입 첫날부터 비교 카드가 성립**할 수 있음(개인 판단) | 타 앱의 route 저장 여부(1-2) |
| **C. 대결 카드** | **없음** ✅ | 친구 기능 + B의 카드 엔진 재사용 | — |
| **D. 코스 공유 → 그대로 뛰기** | **딥링크 삽입 막힘** ❌ → QR/워터마크로 우회 | 코스ID 체계, **경로 매칭·판정 로직**(가장 무거움) | QR 스캔 전환율 |
| **A-보완2. 조립형 GPS 아트** | **없음** (알고리즘 문제) | 도형 분할, **"그 모양대로 뛰었는지" 판정** — D와 부품 공유 | GPS 오차 하에서 판정 관용도 |
| **여정형** (jminkkk 07-28) | **구글맵 탈락** ⚠️ → 카카오/네이버/MapKit | 한국 루트 폴리라인 데이터, 누적거리→좌표 매핑, 랜드마크 해금 | 국내 지도 API 쿼터·요금 |

### 데이터 요구 수준이 두 갈래로 갈린다 (개인 판단)

| | 필요한 데이터 | 결과 |
|---|---|---|
| 공유 컨셉군(오버레이·A·B·C·D) | **좌표열** — 경로의 모양 자체가 제품 | GPS 기록 품질이 곧 제품 품질 |
| 여정형 | **누적 거리 스칼라** — 5.2km라는 숫자면 성립 | HealthKit/Health Connect에서 **거리만 읽어도 동작**. 자체 GPS 트래커 없이 검증 가능 |

여정형은 "기본기(정확한 GPS 기록)를 먼저 다 만들어야 한다"는 비용을 우회할 수 있는 유일한 후보다. JiEung2가 `[미결]`로 남긴 *"기본기 비용이 이 기능보다 크다"* 문제에 대해, 컨셉에 따라 답이 달라진다는 뜻이다.

---

## 6. 팀 상황과 직결되는 것 — 어느 플랫폼으로 만드나

**어떤 컨셉을 고르든 네이티브 앱이 필요하다.** 백그라운드 위치 추적은 웹/PWA로 대체할 수 없다(브라우저는 화면이 꺼지면 추적이 끊긴다).

그런데 현재 팀은 기획 1 + 백엔드 2이고 **앱 개발 경험자가 없다.** 컨셉 선택보다 이쪽이 일정에 더 큰 변수인데 지금까지 어느 노트에도 안 적혀 있다.

- Expo/React Native에는 `expo-location` + `expo-task-manager` 조합으로 백그라운드 위치를 다루는 경로가 있다([공식 문서](https://docs.expo.dev/versions/latest/sdk/location/)). 다만 **Android 포그라운드 서비스 관련 이슈 리포트가 존재**한다([expo#22445](https://github.com/expo/expo/issues/22445)).
- `[확인 필요]` **크로스플랫폼으로 프로덕션 러닝 앱 수준의 GPS 정확도·배터리 소모를 감당할 수 있는지는 검증하지 않았다.** 이건 문서로 결론 낼 수 없고 실기기 스파이크가 필요하다.

---

## 7. 회의에서 결정할 것 (내 제안, 우선순위 순)

1. **플랫폼과 개발 방식** — iOS 먼저인가 양쪽인가, 네이티브인가 크로스플랫폼인가. 팀에 앱 경험자가 없다는 전제에서 누가 무엇을 학습할지까지. **컨셉 선택보다 먼저 정해야 한다고 본다.**
2. **GPS 트랙을 우리가 직접 기록할 것인가, HealthKit/Health Connect에서 읽어올 것인가.** 1-2가 사실이면 선택지가 생긴다 — 다만 Android는 폼 제출이 붙는다.
3. **D(코스 딥링크)를 QR로 우회해서라도 할 것인가, 접을 것인가.** 딥링크가 막힌다는 게 확인됐으므로 JiEung2의 미결 질문이 판단 가능한 상태가 됐다.
4. **여정형을 살릴 경우 지도 SDK** — 카카오/네이버/MapKit 중. 쿼터·요금 확인이 선행.

## 8. 회의 후 검증할 것 (스파이크 후보 — 이번엔 실행 안 함)

- [ ] **건강 앱에서 NRC 워크아웃에 경로 지도가 뜨는지 확인** (1-2의 `[확인 필요]`. 폰만 있으면 5분)
- [ ] **화면 잠금 상태에서 HealthKit 읽기가 실제로 실패하는지** 확인 (1-2 제약 1) — 실패한다면 러닝 중 필요한 데이터는 세션 시작 시 미리 읽어두는 설계가 강제된다
- [ ] 카카오맵·네이버 지도 API 무료 쿼터·요금 조건 확인
- [ ] Expo로 백그라운드 위치 최소 앱 만들어 30분 러닝 트랙 정확도·배터리 측정
- [ ] 인스타 스토리 공유 URL scheme 실제 동작 확인 (배경 영상 + 스티커 레이어)
- [ ] Play Console Health apps form의 실제 요구 항목 열람

---

## 출처

**외부 링크는 전부 2026-08-11에 HTTP 200을 확인했다.** (예외: 팀 내부 문서 중 `mechuri-docs` 링크는 **private repo**라 GitHub 로그인 상태에서만 열린다.) 아래 "1차 출처"는 플랫폼 제공사의 공식 문서이고, 이 노트의 사실 주장은 원칙적으로 여기에만 근거한다. "2차 자료"는 배경 이해용이며 사실 근거로 쓰지 않았다.

### 1차 출처 (공식 문서) — 검증하려면 여기부터

**Apple — 위치**
- [Handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background) ★ "하이킹·피트니스 워크아웃 경로 추적"을 정당 용도로 예시한 원문
- [`allowsBackgroundLocationUpdates`](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates)
- [Requesting authorization to use location services](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services) — When In Use vs Always
- [`UIBackgroundModes`](https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes)

**Apple — HealthKit**
- [Setting up HealthKit](https://developer.apple.com/documentation/healthkit/setting-up-healthkit) ★ "Xcode에서 capability 추가", "Clinical Health Records 체크박스는 실제 필요할 때만 — 아니면 App Review 거부 가능" 원문
- [Protecting user privacy](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) ★ 잠금 시 백그라운드 읽기 실패·쓰기는 가능, 광고 사용 금지, 판매 금지 원문
- [`HKWorkoutRoute`](https://developer.apple.com/documentation/healthkit/hkworkoutroute) · [`HKWorkoutRouteQuery`](https://developer.apple.com/documentation/healthkit/hkworkoutroutequery) · [`HKWorkoutRouteBuilder`](https://developer.apple.com/documentation/healthkit/hkworkoutroutebuilder)
- [Accessing a User's Clinical Records](https://developer.apple.com/documentation/healthkit/accessing-a-user-s-clinical-records) — 예외 케이스
- [HealthKit Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit) · [HealthKit Capabilities Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.access)
- [Capability Requests (Apple Developer Account Help)](https://developer.apple.com/help/account/capabilities/capability-requests/) — **Apple에 별도 요청이 필요한 capability 목록. HealthKit은 여기 없다**
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — §5.1.3 Health and Health Research
- [Apple Maps for Developers](https://developer.apple.com/maps/)

**Google / Android**
- [Publish your health app on Google Play](https://developer.android.com/health-and-fitness/health-connect/publish) ★ Health apps form 제출 의무
- [Android Health Permissions: Guidance and FAQs (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/12991134)
- [Health Connect data types](https://developer.android.com/health-and-fitness/health-connect/data-types)
- [위치 권한 요청](https://developer.android.com/develop/sensors-and-location/location/permissions) · [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [구글 지도 데이터 관련 주요 질의에 대한 안내 (구글 공식 한국어 블로그)](https://blog.google/intl/ko-kr/company-news/inside-google/google-maps-data-export-qa-kr/)

**Meta**
- [Sharing to Stories](https://developers.facebook.com/docs/instagram-platform/sharing-to-stories) ★ 전달 가능 데이터 표 원문 — **링크 필드가 없다는 근거**
- [Facebook App ID 요구 공지 (2022-10)](https://developers.facebook.com/blog/post/2022/10/10/introducing-important-update-to-Instagram-sharing-to-stories/)

**국내 지도 / 크로스플랫폼**
- [카카오맵 API 문서](https://developers.kakao.com/docs/latest/ko/kakaomap/common) · [무료 쿼터 변경 공지](https://devtalk.kakao.com/t/topic/150295)
- [네이버 클라우드 플랫폼 Maps](https://www.ncloud.com/product/applicationService/maps)
- [Expo Location 공식 문서](https://docs.expo.dev/versions/latest/sdk/location/) · [Background Location 이슈 (expo#22445)](https://github.com/expo/expo/issues/22445)

### 2차 자료 (배경 이해용 — 사실 근거 아님)

- [Google Play Health Apps Update: New January 2026 Requirements](https://myappmonitor.com/blog/google-play-health-apps-update-2026-requirements) — 2026-01 강화 내용 요약. **공식 문서로 재확인 필요**
- [Sharing to Instagram Stories – a definitive guide](https://www.ishanchhabra.com/thoughts/sharing-to-instagram-stories) · [Sharing to Instagram Stories in SwiftUI](https://codakuma.com/instagram-stories-sharing-swiftui/) — 구현 예제
- [Demystifying Core Location Permissions](https://medium.com/kinandcartacreated/demystifying-core-location-permissions-a4ade8c4b60b) · [Core Location Modern API Tips](https://twocentstudios.com/2024/12/02/core-location-modern-api-tips/)
- [구글 지도 대한민국 지도 데이터 반출 논란 (나무위키)](https://namu.wiki/w/%EA%B5%AC%EA%B8%80%20%EC%A7%80%EB%8F%84%20%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD%20%EC%A7%80%EB%8F%84%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EB%B0%98%EC%B6%9C%20%EB%85%BC%EB%9E%80) · [Apple 지도/대한민국 (나무위키)](https://namu.wiki/w/Apple%20%EC%A7%80%EB%8F%84/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD) — MapKit 한국 데이터 갱신 정체는 이 2차 자료 기반이라 `[확인 필요]`

**팀 내부 문서**
- [#1 아이디에이션: "공유하고 싶은 기능" 주제로 발산](https://github.com/everyware-ie/run-mechuri/issues/1)
- [JiEung2 — 크루 콜라주·대결·성장비교·코스공유 (08-10)](../JiEung2/2026-08-10-crew-collage-and-runnable-course-share.md) `idea/JiEung2 브랜치`
- [JiEung2 — 경로 오버레이 공유 (08-04)](https://github.com/everyware-ie/mechuri-docs/blob/idea/JiEung2/products/running/raw/JiEung2/2026-08-04-route-overlay-share-concept.md) `mechuri-docs idea/JiEung2 브랜치 — 아직 이 repo로 미이관`
- [jminkkk — 여정형 러닝 (07-28)](2026-07-28-journey-running-concept.md)
- [2026-07-14 회의 종합](../../meetings/2026-07-14/synthesis.md)
