# 데이터 확보 방식 조사: HealthKit 접근 조건 · GPX 소스 비교 · 갤럭시(Android)

*2026-08-16 · JiEung2 개인 조사 원문 · 1주차(8/12~8/18) 담당 항목 "데이터 확보 방식" 관련*

> 성격: 회의 전 개인 조사 원문. 결론 항목은 **JiEung2 개인 판단**이며, 팀 결정은 아니다. 화요일 회의에서 배포형태(웹/네이티브) 결정과 같이 확정해야 한다.

## 왜 이 조사를 했나

1주차 목표(mp4 export 스파이크, 렌더링 프리셋)를 진행하기 전에, "GPX를 어디서 어떻게 가져올 수 있는가"부터 확인해야 데이터 확보방식 논의가 가능하다고 판단해 조사함.

## 요약 결론

- **애플 생태계(HealthKit)는 접근 조건이 열려 있다.** 기업 인증이나 애플과의 별도 파트너십 없이, 일반 Apple Developer Program 계정으로 사용자 동의만 받으면 워크아웃/경로 데이터 접근 가능.
- **나이키런클럽(NRC)은 공식 데이터 반출 경로가 없다.** 제외하는 게 맞다고 판단.
- **삼성(갤럭시)은 두 경로가 갈린다.** 삼성 자체 SDK는 파트너십 승인 필요(불가), Health Connect는 HealthKit과 유사하게 열려 있음(가능).
- GPX 표준 자체에는 심박수·케이던스 필드가 없고(Garmin의 비공식 확장 `TrackPointExtension`을 앱이 구현해야 포함됨), 워크아웃 소요시간·거리는 GPX 확장과 무관하게 `HKWorkout` 기본 속성으로 별도 접근 가능.

---

## 1. HealthKit 접근 조건

- Apple Developer Program 계정(개인/기업 무관)만 있으면 HealthKit capability 추가 + `NSHealthShareUsageDescription` 권한 문구 + 사용자 동의로 워크아웃·경로(`HKWorkoutRoute`) 데이터 읽기 가능. 별도 기업 인증·애플과의 파트너십 계약 불필요.
  - 출처: Apple Developer "Health and fitness apps" (확인일 2026-08-16) — https://developer.apple.com/health-fitness/
- App Store 심사 가이드라인 5.1.3 제약: HealthKit으로 얻은 데이터를 광고/마케팅/데이터마이닝 목적으로 쓰거나 제3자에 판매 금지. 프라이버시 정책 필수. 개인 건강정보 iCloud 저장 금지.
  - 출처: App Store Review Guidelines 발췌 (확인일 2026-08-16) — https://gist.github.com/ethanhuang13/07fdcb6e4a26b46c994b3fc0a55a08f2
- 5.1.1(ix)의 "기업 계정 필수" 조항은 **임상 기록·고도로 규제된 의료 서비스**에만 해당. 러닝 경로 시각화 수준은 해당 안 됨 — 개인 개발자 계정으로 진행 가능하다고 판단(개인 판단, 팀 확인 필요).

## 2. GPX 소스별 비교 — 애플 vs 나이키런클럽 vs 삼성

### 애플 피트니스/건강 앱
- 개별 워크아웃 "공유하기"로 GPX 직접 추출하는 기본 기능은 없음.
- 건강 앱의 "모든 건강 데이터 내보내기"를 쓰면 `workout-routes/` 폴더에 GPX가 포함되긴 하나, 전체 데이터를 통째로 내보내는 방식이라 개별 확인용으로는 무거움.
- 서드파티 앱들이 HealthKit 권한으로 개별 워크아웃을 안정적으로 GPX로 뽑아줌 — 실사용 검증됨(직접 GPX Export 앱으로 테스트 완료, 됨 확인):
  - GPX Export (무료, 순수 경로만 패키징) — https://apps.apple.com/us/app/gpx-export/id1667613575
  - GPX Route Exporter — https://apps.apple.com/ca/app/gpx-route-exporter/id1487816558
  - Combine Workouts (여러 워크아웃 합쳐서 내보내기) — https://apps.apple.com/us/app/combine-workouts-export-gpx/id6444284557
  - (확인일 2026-08-16)

### 나이키런클럽(NRC)
- **공식 GPX/데이터 내보내기 기능 자체가 없음.** 공유 버튼은 요약 이미지/지도 캡처 수준.
- 존재하는 추출 도구(`nrc-exporter`, `nrc2strava` 등)는 전부 비공식 리버스엔지니어링 — 내부 SQLite DB 직접 접근 또는 비공개 API 토큰 탈취 방식. Nike API 변경 시 바로 깨짐, ToS 위반 소지.
  - 출처: yasoob/nrc-exporter README (확인일 2026-08-16) — https://github.com/yasoob/nrc-exporter
- 공식적으로 지원되는 유일한 경로는 **NRC → Strava 자동 동기화 → Strava에서 GPX 내보내기**.
- **결론(개인 판단): NRC 전용 사용자 직접 지원은 이번 범위에서 제외.** "애플 건강데이터 또는 Strava만 지원"으로 좁히는 게 현실적.

### 삼성(갤럭시)
- **삼성 헬스 자체 SDK(Samsung Health Data SDK)**: 파트너십 신청 필요 — 데이터 흐름도 제출, 법규 준수/보안사고 이력 신고, 승인까지 영업일 기준 10~14일, 배포 최소 2주 전 신청 필요. **9/22 마감 기준으로 시간 안 맞음.**
  - 출처: Samsung Health Data SDK 파트너십 프로세스 정리 (확인일 2026-08-16) — https://velog.io/@mraz3068/Samsung-Health-Data-SDK
- **Health Connect**: 구글·삼성 공동 개발한 OS 표준 플랫폼(Android 14+ 시스템 내장). HealthKit처럼 사용자 동의 하나로 접근 가능, 별도 파트너십 불필요. 삼성 헬스 데이터도 Health Connect로 동기화되므로 삼성 SDK를 거치지 않고도 삼성 유저 데이터 접근 가능.
  - 출처: Health Connect (Wikipedia, 확인일 2026-08-16) — https://en.wikipedia.org/wiki/Health_Connect
- **결론(개인 판단): 안드로이드 확장 시 Health Connect만 보면 됨.** 지금 MVP는 애플 우선이라 급한 항목 아님.

## 3. HealthKit에서 뽑을 수 있는 데이터 종류

- **심박수·케이던스는 GPX 표준에 없음.** 표준 GPX 1.1은 lat/lon/ele/time만 정의. 심박수·케이던스는 Garmin이 만든 비공식 확장 `TrackPointExtension`(gpxtpx 네임스페이스)을 앱이 구현해야만 포함됨. 실제 GPX Export 앱으로 테스트한 결과 이 확장이 없어 심박수 미포함 확인.
  - 출처: Garmin TrackPointExtension 스키마 (확인일 2026-08-16) — https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd
  - **개인 판단**: 오히려 다행 — 러닝 드로잉에 필요한 건 좌표+시간뿐이라, 민감 건강정보(심박수)를 안 받아도 되면 프라이버시 처리 부담이 줄어듦.
- **소요시간·거리는 GPX 확장과 무관하게 `HKWorkout` 객체 기본 속성**(`startDate`, `endDate`, `duration`, `totalDistance`)으로 별도 접근 가능. 경로 쿼리보다 오히려 간단하고, 추가 권한 불필요(워크아웃 읽기 권한에 포함).
- 좌표 각각에 타임스탬프(`CLLocation.timestamp`)가 있어 구간별 페이스도 좌표+시간만으로 계산 가능 — 심박수·케이던스 없이 "선 그리기 + 전체시간 + 구간페이스" 세 가지가 HealthKit 기본 권한 하나로 커버됨.

## 4. React Native로 HealthKit 접근 가능한지

- 가능함. 다만 순수 JS가 아니라 **네이티브 Swift 모듈을 RN에서 감싸는 브릿지** 구조.
- `@kingstinct/react-native-healthkit` — 활발히 유지되는 라이브러리, TypeScript 지원, `getWorkoutRoutes` 함수로 경로 데이터 직접 접근 가능.
  - 출처: npm 패키지 페이지 (확인일 2026-08-16) — https://www.npmjs.com/package/@kingstinct/react-native-healthkit
- `react-native-health` — 더 오래된 커뮤니티 라이브러리, `getAnchoredWorkouts` 등 지원.
  - 출처: GitHub agencyenterprise/react-native-health (확인일 2026-08-16) — https://github.com/agencyenterprise/react-native-health
- 둘 다 **iOS 전용**(HealthKit 자체가 애플 전용). Xcode HealthKit capability·Info.plist 권한 설정은 네이티브 개발과 동일하게 필요 — RN이 이 설정 자체를 없애주진 않음.
- **함의(개인 판단)**: "웹이냐 네이티브냐" 이분법 대신, React Native + 이 라이브러리 조합으로 HealthKit 접근이 가능하다는 옵션이 하나 더 있음. 순수 웹만 고집할 필요 없이 배포형태 논의 범위를 넓힐 수 있음.

## `[미결]` — 회의에서 확인할 질문

- 순수 웹(브라우저)으로 갈 경우 HealthKit 직접 연동이 **원천적으로 불가능**(브라우저 API 없음)하다는 게 확인됨. 데이터 확보방식과 배포형태가 서로 강하게 제약하는 관계라는 걸 화요일 회의에서 먼저 공유 필요.
- "애플 건강데이터 + Strava만 지원, NRC 제외"로 데이터 소스 범위를 좁히는 것에 대한 팀 동의 필요.
- 개인 개발자 계정으로 심사 통과 가능하다는 판단(5.1.1(ix) 미해당)에 대해 지민 님 스택/심사 조사와 교차 확인 필요.
