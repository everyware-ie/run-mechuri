---
title: 외부 베타 심사 제출 — 입력값과 절차
product: running
type: ops
status: draft
updated: 2026-09-16
---

# 외부 베타 심사 제출 — 입력값과 절차

내부 테스트로 돌던 것을 **외부 테스터에게 열기 위한 첫 베타 심사**다. 담당은 지민(Account Holder)이다.

App Store Connect에 그대로 넣을 문안과 누르는 순서를 한 곳에 모았다. **제출 화면을 보면서 이 문서를 옆에 두고 채우면 된다.**

- 근거: [출시 가능성 노트 §4 TestFlight](../ideation/jminkkk/2026-08-17-appstore-release-feasibility.md) · [9/9 인계 문서의 체크리스트](beta-2026-09-09/handoff.md) · [공개 안내 문서 변경 이력](public-docs-log.md)
- 내부 테스터는 심사가 없지만 **외부는 첫 빌드가 App Review를 통과해야 한다.** 그래서 이 작업이 생겼다

---

## 1. 제출 전에 확인할 것

**이 셋은 제출 버튼을 누르기 전에 끝나야 한다.** 나머지 미결 항목은 [§4 이번에 안 하고 넘기는 것](#4-이번에-안-하고-넘기는-것)에 있다.

### 1-1. 처리방침 공개 주소가 비로그인으로 열리는가 — ✅ 확인함 (지민, 2026-09-16)

**시크릿 창에서** https://phs00.notion.site/privacy 가 로그인 없이 열리는 것을 확인했다. 만든 사람은 로그인돼 있어 잘 보이지만 심사자는 못 볼 수 있어 매번 이렇게 확인한다.

- 로그인 요구나 접근 요청 화면이 뜨면 **그대로 리젝된다** (가이드라인 5.1.1)
- 허브에서 정책·FAQ·문의로 이동되는지도 같이 본다

### 1-2. 공개된 처리방침이 9/14 갱신본인가 — ✅ 확인함 (지민, 2026-09-16)

레포의 [스냅샷](beta-2026-09-09/privacy-current.md)은 **9/9 시점이라 낡았다** — "갤러리 사진 선택과 카메라 촬영 기능이 없다"고 적혀 있다. 실제 공개본은 [9/14에 사진·카메라를 반영](public-docs-log.md#2026-09-14--갤러리-사진과-카메라-촬영-반영)했다.

공개본 §5 권한 표에 **카메라** 줄이 있는 것을 확인했다.

> | 카메라 | 그 자리에서 찍어 배경으로 쓸 수 없습니다. 기본 배경과 갤러리 사진은 그대로 씁니다 |

심사자는 바이너리가 요구하는 권한과 처리방침을 대조한다. 앱이 요청하는 세 권한(건강·사진 저장·카메라)이 모두 표에 있다.

### 1-3. 제출할 빌드를 특정한다

| 항목 | 값 |
|---|---|
| 앱 이름 | 메추리 런 |
| 번들 ID | `com.mechuri.runmechuri` |
| 버전 | 1.0.0 |
| 빌드 번호 | **18** |
| commit SHA | `5b704ce212e018bfdd4a8490135df8f8067b40a4` (PR #54 머지) |
| Apple 상태 | `VALID` / `IN_BETA_TESTING` (2026-09-13 확인) |

**빌드 18 이후의 커밋은 전부 문서라 코드는 이것이 최신이다.** 근거는 [빌드·개발 명령 §2026-09-13 배포 기록](build-and-dev-commands.md)에 있다.

빌드 번호와 SHA를 여기 적어 두면 리젝 대응 때 무엇을 낸 빌드인지 다툴 일이 없다. [9/9 인계 문서 체크리스트](beta-2026-09-09/handoff.md) 첫 항목이 이것이다.

---

## 2. App Store Connect에 넣을 값

### 2-1. 테스트 정보 (Test Information)

**한 번 채우면 이후 빌드에 계속 쓰인다.** TestFlight 탭 좌측 하단 "테스트 정보"에 있다.

| 칸 | 넣을 값 |
|---|---|
| 피드백 이메일 | `team.mechuri@gmail.com` |
| 마케팅 URL | `https://phs00.notion.site/mechuri-run` |
| 개인정보 처리방침 URL | `https://phs00.notion.site/privacy` |
| 로그인 필요 | **아니요** (체크 해제) |

**연락처 정보** — 심사 중 문제가 생기면 Apple이 연락하는 곳이다. 지민 본인 정보를 넣는다.

| 칸 | 넣을 값 |
|---|---|
| 이름 / 성 | 지민 본인 |
| 전화번호 | 본인 번호 |
| 이메일 | `team.mechuri@gmail.com` (또는 본인 상시 확인 주소) |

### 2-2. 베타 앱 설명 (Beta App Description)

테스터가 TestFlight 앱에서 보는 소개다.

```
메추리 런은 iOS 건강 앱의 실외 달리기 기록과 경로를 불러와
러닝 경로 영상을 만드는 앱입니다.

배경 위에 경로와 각인을 얹어 편집하고, 완성한 영상을
사진 앱에 저장하거나 Instagram 스토리로 공유할 수 있습니다.

회원가입과 로그인은 필요하지 않습니다.
러닝 기록과 결과물은 기기 안에만 보관되며 팀 서버로 보내지 않습니다.

※ 실외 달리기 기록이 건강 앱에 있어야 사용할 수 있습니다.
   경로(GPS) 좌표가 없는 기록은 목록에 나오지 않습니다.
```

### 2-3. 테스트할 내용 (What to Test)

빌드마다 다르게 쓸 수 있는 칸이다.

```
1. 건강 앱의 실외 달리기 기록을 불러와 하나를 고릅니다
2. 경로 모양(부드럽게 / 각지게)과 각인 문구를 편집합니다
3. 배경을 기본 이미지 또는 직접 고른 사진으로 바꿔 봅니다
4. 영상으로 만들어 사진 앱에 저장하거나 Instagram 스토리로 공유합니다

특히 봐주세요
- 영상 만들기가 끝까지 도는지 (중간에 앱이 꺼지지 않는지)
- 경로 그림이 실제 뛴 길과 닮았는지
- 결과물에 정보가 너무 많아 알아보기 어렵지 않은지
```

### 2-4. 베타 앱 심사 메모 (App Review Notes) — 가장 중요

**심사자 기기에는 러닝 기록이 없다.** 이 메모가 없으면 심사자는 "실외 러닝 기록이 없어요" 화면만 보고 앱의 기능을 확인할 수 없다.

수동으로 추가한 운동에는 GPS 경로가 붙지 않아 **우리 앱에서는 결과물이 나오지 않는다.** 심사자가 그걸 시도했다가 실패하고 리젝하는 흐름을 막으려면, 그 사실을 먼저 알려야 한다.

**데모 영상은 미리 만들지 않는다.** 가이드라인 2.1이 요구하는 것은 로그인이 있는 앱의 데모 계정이고, 영상은 제공할 수 있다는 선택지다. TestFlight 베타 심사는 정식 심사보다 얕게 보므로 텍스트 설명으로 통과하는 경우가 흔하다. 대신 **필요하면 제공하겠다는 뜻을 메모에 남겨** 심사자가 리젝 대신 되물을 여지를 준다. 실제로 요청이 오면 그때 찍는다([§5-1 데모 영상이 필요해지면](#5-1-데모-영상이-필요해지면)).

영문으로 넣는다. 그대로 복사해 쓰면 된다.

```
ABOUT THIS APP

Mechuri Run reads the user's outdoor running workouts and GPS route
coordinates from Apple Health (HealthKit), draws the route as artwork,
and renders it into a short video the user can save to Photos or share
to Instagram Stories.

No account, login, or server-side data storage is involved. All running
data and generated videos stay on the device.


IMPORTANT — HOW TO REVIEW WITHOUT RUNNING DATA

This app requires an OUTDOOR RUNNING WORKOUT WITH GPS ROUTE DATA in the
Health app. A review device will normally have none, and the app will
only show an empty state.

Please note: manually adding a workout in the Health app will NOT work
for this app. Manually created workouts contain no GPS route samples,
and this app needs route coordinates to draw anything. The workout will
not appear in our list.

The full flow is: grant HealthKit permission, select a run, edit the
route and caption, choose a background, render the video, save it to
Photos, and share to Instagram Stories.

If you are unable to complete the review without running data, please
contact us through Resolution Center before rejecting. We can provide a
recorded walkthrough of the entire flow, or arrange a device that
already contains outdoor running workouts with route data. We will
respond the same day.


HEALTHKIT USAGE

- We request READ access only. The app never writes to HealthKit.
- Data read: workout identifier, date, distance, duration, pace, heart
  rate (when present), and outdoor running route coordinates with
  timestamps.
- Purpose: to let the user select a run and render its route as artwork.
- This data is never used for advertising or marketing, never sold, and
  never transmitted to any server operated by us.
- Declining the HealthKit permission does not break the rest of the app.

LOCATION

The app does not track the user's current location and requests no
location permission. During editing, one coordinate from the middle of
the already-imported route may be sent to Apple's geocoding service to
look up a place name for the caption.

INSTAGRAM SHARING

Sharing to Instagram Stories requires the Instagram app to be installed.
If it is not installed, the app shows an explanatory sheet instead.

PRIVACY POLICY

https://phs00.notion.site/privacy
```

---

## 3. 제출 절차 (누르는 순서)

1. **App Store Connect** → 나의 앱 → **메추리 런** → 상단 **TestFlight** 탭
2. 좌측 **테스트 정보**에서 [§2 App Store Connect에 넣을 값](#2-app-store-connect에-넣을-값)의 테스트 정보·베타 앱 설명·심사 메모를 채우고 **저장**
3. 좌측 **테스터 및 그룹** → **+** → **새 그룹** → 이름 예: `외부 베타`
   - **"공개 링크 사용"** 을 켠다 → 링크로 누구나 참여할 수 있다. 인원 상한을 정할 수 있고 언제든 끌 수 있다
4. 그룹 안에서 **빌드** → **+** → **1.0.0 (18)** 선택
5. 이 시점에 **수출 규정(Export Compliance)** 질문이 뜬다
   - 앱이 HTTPS 표준 암호화만 쓰면 **"아니요"** 에 해당한다. 자체 암호화를 넣은 적이 없으므로 그렇다
6. **테스트할 내용**(§2-3)을 넣고 **심사 제출**
7. 상태가 **"심사 대기 중(Waiting for Review)"** 으로 바뀌면 완료다

### 그다음

- 심사는 **2~5일**로 본다. 신규 계정·신규 앱·최초 제출이라 가장 느린 조건이다([출시 가능성 노트 §3-2](../ideation/jminkkk/2026-08-17-appstore-release-feasibility.md))
- 통과하면 그룹의 **공개 링크**를 받아 배포한다
- **같은 버전의 이후 빌드는 심사가 없을 수도 있다.** 보장은 아니다(Apple 원문 `might not`)
- 한 버전당 동시 심사는 1건, 24시간에 6빌드까지 제출할 수 있다

### Apple 공식 안내

화면이 이 문서와 다르게 보이면 여기를 본다. App Store Connect는 UI가 종종 바뀐다.

- [외부 테스터 초대](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) — 외부 테스터의 정의, 첫 빌드 심사 요건, 공개 링크
- [빌드를 그룹에 연결하기](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-testers-to-builds) — 위 4번 단계

---

## 4. 이번에 안 하고 넘기는 것

제출을 막지는 않지만 남아 있는 것들이다. [9/9 인계 문서](beta-2026-09-09/handoff.md)의 체크리스트가 출처다.

| 무엇 | 왜 지금 안 하나 | 담당 |
|---|---|---|
| **앱 안에서 처리방침 열기** | `frontend/src`에 링크가 없다. 정식 심사에서는 걸릴 수 있다 | 개발 |
| **기록 없는 기기용 샘플 경로** | 코드 변경 + 새 빌드가 필요하다. 이번에는 심사 메모의 설명으로 대신한다. **리젝되면 이것부터 넣는다** | 개발 |
| **데모 영상** | 필수가 아니고, 찍느라 제출이 밀리는 비용이 더 크다. **요청이 오면 그때 찍는다**([§5 리젝되거나 문의가 오면](#5-리젝되거나-문의가-오면)) | 지민 |
| **App Privacy 응답 점검** | 정식 제출 화면의 항목이다. 베타 심사는 이것 없이 나간다. 자체 서버가 없다는 이유만으로 전부 '수집 안 함'으로 두지 않는다 | 지민 |
| **HealthKit 사본의 백업 제외 설정** | 코드를 읽은 것만으로 확정하지 못했다 | 개발 |
| **정식 App Store 제출** | 별개 심사다. 베타 통과가 정식 통과를 보장하지 않는다 | — |

---

## 5. 리젝되거나 문의가 오면

리젝 사유와 심사자 문의는 App Store Connect의 **해결 센터(Resolution Center)** 로 온다. **거기서 심사자에게 답글을 쓸 수 있다** — 오해로 보이는 리젝이면 재빌드 전에 먼저 설명해 보는 편이 빠르다. 재제출은 같은 화면에서 다시 **심사 제출**을 누르면 된다.

| 사유 | 대응 |
|---|---|
| 기능을 확인하지 못했다 (2.1) | **먼저 데모 영상을 찍어 해결 센터로 답글**을 단다(§5-1). 그래도 안 되면 샘플 경로 모드를 넣고 재제출한다([§4 이번에 안 하고 넘기는 것](#4-이번에-안-하고-넘기는-것)) |
| 처리방침 URL이 안 열린다 (5.1.1) | [§1-1](#1-1-처리방침-공개-주소가-비로그인으로-열리는가--확인함-지민-2026-09-16)을 다시 확인한다. 노션 공유 설정이 바뀌었을 수 있다 |
| 권한 설명이 바이너리와 안 맞는다 (5.1.1) | [§1-2](#1-2-공개된-처리방침이-914-갱신본인가--확인함-지민-2026-09-16). 공개본이 카메라를 포함하는지 본다 |
| 기능이 미완성이다 (4.2) | 인스타 공유가 붙어 있고 핵심 흐름이 끝에서 끝까지 돌므로 가능성은 낮다 |

### 5-1. 데모 영상이 필요해지면

심사 메모에 "요청하면 제공하겠다"고 적어 두었다. 요청이 오면 찍는다. **지민 폰에는 러닝 기록이 있으므로 직접 찍으면 된다.**

- **담아야 할 것**: 권한 허용 → 기록 선택 → 편집(경로·각인) → 배경 선택 → 영상 만들기 → 사진 앱 저장 → 인스타 공유. **끊지 말고 한 번에** 찍는 편이 좋다
- **길이**: 2~3분. 심사자가 빨리 확인할 수 있어야 한다
- **올리는 곳**: YouTube **일부 공개(Unlisted)**. 비공개(Private)로 두면 심사자가 못 본다. 로그인 없이 열리는지 시크릿 창에서 확인한다
- 링크를 해결 센터 답글에 붙인다. 심사 메모에도 함께 넣어 둔다

> 영상 안에서 개인 정보(실명, 집 근처 경로)가 신경 쓰이면 그 구간만 다른 기록으로 찍는다. 다만 경로가 보이지 않으면 심사자가 기능을 확인할 수 없으니 경로 자체는 보여야 한다.
