# App Store 출시 가능성: 9/22까지 계정을 만들고 심사를 통과할 수 있나

*2026-08-17 · jminkkk · [2026-08-11 회의](https://github.com/everyware-ie/mechuri-docs/blob/main/meetings/2026-08-11/synthesis.md) 1주차 분담 후속 · [플랫폼 기술 검토(08-11)](2026-08-11-platform-tech-review.md)의 남은 항목*

> 성격: 이 노트는 배포 형태를 고르는 글이 **아니다**(그건 [배포 형태 결론](2026-08-17-release-mode-decision.md)). 회의록이 이 트랙에 남긴 두 항목 중 **"App Store 심사 기간·리젝 리스크 → 9/22 역산"** 과 **"Apple Developer Program 등록 절차·기간·비용"** 에 대한 사실 확인이다.
>
> - 확인일: **2026-08-17**. 각 절 머리에 1차 출처(Apple 공식 문서) 링크를 달았다 — 직접 검증할 수 있게. 전체 목록은 말미 [출처](#출처)
> - 사실 주장은 **공식 문서 원문에만 근거**한다. 커뮤니티·블로그는 2차 자료로 분리했다
> - `[확인 필요]` 는 **공식 문서로 확인하지 못했거나 2차 자료 기반**인 항목
> - "함의"로 시작하는 문단은 **개인 판단**이고 팀 결정이 아니다
> - 회의록이 이 트랙에 남긴 다른 한 항목(**크로스플랫폼 실기기 검증**)은 이 노트 범위 밖이다. 실기기 스파이크가 필요하다 → [§6](#6-미확인-항목)

## 배경

[08-11 회의](https://github.com/everyware-ie/mechuri-docs/blob/main/meetings/2026-08-11/synthesis.md)에서 **MVP 출시일을 9/22(화)로 확정**했다. iOS 앱으로 갈 경우 **팀이 통제할 수 없는 두 구간**이 일정에 들어온다 — **계정 등록 대기**와 **앱 심사 대기**다. 6주 역산 어디에도 반영돼 있지 않다.

전제 조건도 갖춰져 있지 않다. **팀 3명 모두 Apple Developer Program 계정이 없다**(§1).

---

## 결론 요약

1. **개인(Individual)으로 등록해야 한다. 조직(Organization)은 9/22를 깬다.** 조직은 **D-U-N-S 번호**가 필수이고 발급·검증에 시간이 든다. 대신 개인으로 가면 App Store 판매자명에 **내 법적 이름이 그대로 노출**된다.
2. **개인 등록은 병목이 아니다.** 공식 문서가 *"구매 후 24시간 내에 멤버십 확인 메일을 받지 못하면 문의하라"* 고 안내한다 → 정상 경로는 24시간 이내. **비용은 연 $99**(원화 금액은 공식 미명시, §2-2). **조직은 이 24시간이 적용된다고 볼 수 없다** — D-U-N-S·권한 검증이 선행하기 때문이다(§2-4).
3. **팀원 테스트에 계정 유형은 상관없다.** 외부 테스터는 공식 정의상 *"App Store Connect 사용자가 아닌 사람"* 이라 개인 계정으로도 이메일·공개 링크로 초대된다(§4-1). 다만 **외부 배포는 첫 빌드가 App Review를 통과해야 한다** — 즉 **심사가 W6이 아니라 그 전에 이미 끝나 있어야 한다.**
4. **첫 빌드는 전체 심사를 받고, 같은 버전의 이후 빌드는 심사가 없을 수도 있다**(공식 원문 `might not` — 보장 아님, §4-2). → **첫 심사를 일찍 통과시켜 두면 그만큼 유리하다.** 다만 이후 빌드가 심사를 건너뛴다는 전제로 일정을 짜면 안 된다.
5. **역산은 "1차 제출 마감"보다 "첫 베타 심사를 언제 통과시켜 두는가"를 먼저 잡는 편이 낫다.** W3 말(9/1경)을 목표로 하면 W5 실사용 전에 첫 심사분을 끝낼 수 있다(§5).

---

## 1. 계정 현황 (2026-08-17 기준)

| 항목 | 상태 |
|---|---|
| Apple Developer Program 개인 계정 | **팀 3명 모두 없음** (jminkkk · phs00 · JiEung2) |
| 조직 계정 | 없음. 법인이 없다 |

**선행 사례 (jminkkk).** 다른 프로젝트에서 개인 계정으로 올린 TestFlight를 팀원 여러 명이 내려받아 테스트한 적이 있다. §4-1의 **외부 테스터** 경로이며, **개인 계정으로 팀 테스트가 가능하다는 실증**이다.

**함의(개인 판단).** 계정 부재가 9/22의 첫 번째 리스크다. 등록 자체는 하루면 되지만, **W1 안에 착수하지 않으면 지연 사유(§2-4)에 걸렸을 때 복구할 여유가 없다.**

---

## 2. Apple Developer Program 등록

> 1차 출처: [Become a member (enroll)](https://developer.apple.com/programs/enroll/) · [한국어 등록 페이지](https://developer.apple.com/kr/programs/enroll/) · [Enrollment — Account Help](https://developer.apple.com/help/account/membership/program-enrollment) · [Choosing a Membership](https://developer.apple.com/support/compare-memberships/)

### 2-1. 개인 vs 조직 — 이 선택이 일정을 가른다

| 항목 | 개인 (Individual) | 조직 (Organization) |
|---|---|---|
| 2단계 인증 Apple 계정 | 필수 | 필수 |
| 법적 이름 | **개인 법적 본명** (별칭·닉네임·회사명 불가) | **법인명** (DBA·가명·상표명 불가) |
| **D-U-N-S 번호** | **불필요** | **필수** (정부기관 제외) |
| 공개 웹사이트 | 불필요 | **정상 작동하는 공개 사이트 필요** |
| 등록 권한 | 본인 | 소유자·설립자·임원·승인된 직원 |

공식 문서 원문(조직 신원 확인):

> "Our identity verification process for organizations includes several components, including but not limited to a **D‑U‑N‑S Number** and binding authority check when enrolling as an organization."

D-U-N-S는 Dun & Bradstreet가 발급하는 9자리 사업자 식별번호다. `[확인 필요]` **발급 소요 기간은 확인하지 못했다** — Apple 문서는 "확인 또는 신청 가능"이라고만 안내한다.

**함의(개인 판단). 조직 경로는 검토 대상이 아니다.** 법인이 없고, D-U-N-S 발급 기간이 미지수이며, 공개 웹사이트까지 요구된다. 6주 일정에 넣을 수 없다.

### 2-2. 비용

> "Apple Developer Program 멤버십 회비는 **연간 미화 99달러**입니다. 가격은 지역별로 다를 수 있으며 **등록 과정에서 현지 통화로 표시됩니다.**" — [한국어 등록 페이지](https://developer.apple.com/kr/programs/enroll/)

- 공식 금액: **$99 / 년**
- `[확인 필요]` **원화 금액은 Apple 공식 페이지에 명시돼 있지 않다.** 커뮤니티 보고는 **₩129,000/년**으로 일치하나 2차 자료다(→ [출처](#2차-자료-사실-근거-아님)). **실제 금액은 결제 화면에서 확정된다.**
- 비영리·교육기관·정부기관은 [연회비 면제](https://developer.apple.com/help/account/membership/fee-waivers/) 신청 가능 — **우리는 해당 없음**

### 2-3. 개인 계정으로 팀원을 테스트에 넣을 수 있다 — 해결됨

**결론: 계정 유형은 팀원 테스트에 영향을 주지 않는다.** 외부 테스터는 공식 정의상 App Store Connect 사용자가 아니어도 되기 때문이다(§4-1). 개인 계정 소유자는 **Account Holder** 이므로 외부 테스터 초대에 필요한 역할 요건도 본인이 충족한다.

> "External testers are people you invite to test your app who aren't App Store Connect users." — [App Store Connect Help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)

> "Required role: **Account Holder**, Admin, or App Manager." — 동일 문서 (외부 테스터 초대 권한)

**jminkkk의 과거 경험(§1)이 이를 실증한다.** 개인 계정으로 올린 TestFlight를 팀원 여러 명이 내려받아 테스트했다.

**다만 대가는 남는다** — 외부 테스터 경로이므로 **첫 빌드 App Review를 통과해야 한다**(§4-2). 심사 없이 즉시 배포되는 건 내부 테스터뿐이고, 내부 테스터는 App Store Connect 역할 보유자여야 한다.

### 2-4. 등록 소요 기간과 지연 사유

공식 문서는 처리 기간을 명시하지 않는다. 유일한 시간 언급:

> "After your purchase has been processed, you'll receive a confirmation email. To check the status of your enrollment, sign in to your account on the developer website with the Apple Account you used to enroll. **If you haven't received a membership confirmation within 24 hours of your purchase, contact us.**"

→ **정상 경로는 24시간 이내**로 읽는 것이 타당하다.

**⚠️ 이 24시간을 조직에 그대로 적용하면 안 된다.** 공식 문구 자체는 개인·조직을 구분하지 않지만, 조직에는 **D-U-N-S 번호 확인과 binding authority check가 선행**한다(§2-1). 즉 24시간은 *"결제가 처리된 뒤 확인 메일까지"* 의 시간이고, 조직은 그 앞단에 별도 검증 구간이 붙는다. `[확인 필요]` **조직의 실제 총 소요 기간은 공식 문서에 없다** — 개인 등록을 전제로 하므로 확인 범위에서 제외했다.

명시된 지연 사유가 둘 있다:

| 지연 사유 | 공식 문서 원문 |
|---|---|
| 이름을 잘못 입력 | "Do not enter an alias, nickname, or company name as your first or last name, as **entering your legal name incorrectly will cause a delay in the approval of your enrollment.**" |
| 본인 명의가 아닌 카드로 결제 | "If you do not, **your enrollment will be delayed and you'll be asked for a copy of your government-issued photo identification.**" |

`[확인 필요]` 2차 자료에서는 **개인 계정에 수동 신원 확인이 붙어 며칠 걸린 사례**와 **금·토 결제 시 미국 업무일 기준으로 월·화까지 대기**한 사례가 보고된다. 공식 확인은 안 됐다.

### 2-5. 등록 체크리스트 (착수 시 그대로 사용)

- [ ] Apple 계정에 **2단계 인증** 활성화
- [ ] Apple 계정의 이름 필드가 **법적 본명**인지 확인 (닉네임이면 먼저 수정)
- [ ] 주소가 **P.O. Box가 아닌 실주소**인지 확인
- [ ] **본인 명의 신용카드** 준비
- [ ] **평일 오전에 결제** — 주말·미국 휴일 결제는 대기가 길어질 수 있다 `[확인 필요]`
- [ ] 결제 후 24시간 내 확인 메일 없으면 **즉시 Apple 문의**
- [ ] 승인 직후 **App Store Connect > Users and Access에서 팀원 초대 가능한지 확인** (§2-3)

---

## 3. App Store 심사 기간

> 1차 출처: [App Review (Distribute)](https://developer.apple.com/distribute/app-review/) · [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### 3-1. Apple이 공식적으로 말하는 수치

> **"On average, 90% of submissions are reviewed in less than 24 hours."**

이것이 Apple 공식 문서에 있는 **유일한 구체 수치**다.

### 3-2. 그런데 2차 자료의 실측은 다르다 — 우리 케이스가 느린 쪽이다

`[확인 필요]` 아래는 전부 2차 자료다. 다만 **여러 출처가 "신규 앱·신규 계정이 느리다"는 방향으로 일치**한다.

| 구분 | 보고된 값 | 출처 성격 |
|---|---|---|
| 전체 평균 (2026-05) | 8시간 38분 | 업데이트 포함 평균 |
| **신규 앱 최초 제출** | **2~5일** | ← **우리 케이스** |
| iOS "Waiting for Review" 대기만 | 2~3일 | 심사 시작 전 |
| 계정 이력 효과 | 앱 10개 출시한 계정이 신규 계정보다 빠름 | — |

**함의(개인 판단). 우리는 가장 느린 조건을 다 갖췄다** — 신규 계정 + 신규 앱 + 최초 제출. 공식 수치(24시간)를 계획 근거로 쓰면 안 되고, **신규 앱 기준 2~5일**로 잡아야 한다. 심사 자체보다 **리젝 1회의 왕복**이 일정에 더 크게 들어온다.

### 3-3. 신속 심사 (Expedited Review) — 횟수 제한은 "공식 수치가 없다"

`[확인 필요]` **신청 페이지가 Apple 로그인을 요구해 원문을 확인하지 못했다** (`developer.apple.com/contact/app-store/?topic=expedite` → 로그인 리다이렉트).

2차 자료에서 일관되게 확인되는 내용:

| 항목 | 내용 | 성격 |
|---|---|---|
| 공식 횟수 제한 | **Apple이 공표한 연간 상한은 없다** | 2차 자료 일치 |
| 실제 운용 | **Apple 재량으로 제한적 승인.** 요청 이력을 추적한다 | 2차 자료 |
| 남용 시 | **이후 요청이 거부된다.** 같은 제출건에 반복 요청하면 오용으로 읽힘 | 2차 자료 |
| 권고 | 진짜 긴급 상황에만. **연 1~2회 수준으로 아껴 쓸 것** | 2차 자료 권고 |

**함의(개인 판단).** "연 N회 제한"이라는 명문 규정은 찾지 못했지만, **실질적으로는 그렇게 취급하는 것이 맞다.** 이력이 없는 신규 계정이 첫 앱에 신속 심사를 쓰면 어떻게 평가되는지도 알 수 없다. **9/22 계획의 전제로 삼으면 안 되고, 리젝 2회가 났을 때의 마지막 카드로만 남겨둔다.**

계정 등록 후 로그인해서 실제 신청 폼의 문구를 확인해두는 것이 좋다.

---

## 4. TestFlight

> 1차 출처: [TestFlight](https://developer.apple.com/testflight/) · [Invite external testers — App Store Connect Help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)

회의록 W5(9/9~9/15)는 **"실사용 — 3명이 실제로 뛰고 올려보기"** 다. 그러려면 앱이 세 사람 폰에 깔려야 한다. 그 경로가 TestFlight이다.

### 4-1. 내부 vs 외부 — 우리는 외부 테스터 경로다

| 항목 | 내부 테스터 | 외부 테스터 |
|---|---|---|
| 최대 인원 | **100명** | **10,000명 / 앱** |
| 자격 | **App Store Connect 역할 보유자** (Account Holder/Admin/App Manager/Developer/Marketing) | **App Store Connect 사용자가 아닌 사람** |
| **App Review** | **불필요 — 즉시 테스트** | **첫 빌드만 필요** (§4-2) |
| 공개 링크 | 불가 | **가능** — SNS·이메일 배포 |
| 초대 권한 | — | Account Holder · Admin · App Manager |

공식 원문:

> "**External testers are people you invite to test your app who aren't App Store Connect users.**" / "After uploading your build, you can invite up to **10,000 external testers** per app."

> "Designate up to **100 members of your development team** who hold the Account Holder, Admin, App Manager, Developer, or Marketing role as beta testers."

**개인 계정 소유자는 Account Holder**이므로 외부 테스터 초대 권한을 충족한다(§2-3).

### 4-2. 첫 빌드는 전체 심사, 이후 빌드는 심사가 없을 수도 있다

> "The first build you submit **requires a full review**, but later builds for the same version **might not**."

> "You can only have one build of each version in review at a time. Once that build is approved, you can submit additional builds."

> "You can submit up to **six builds** for TestFlight App Review within a **24-hour period**."

정리하면:

| 대상 | 심사 |
|---|---|
| 첫 빌드 | **전체 심사 필수** |
| 같은 버전의 이후 빌드 | **심사가 없을 수도 있다** (`might not` — 보장 아님) |
| 다른 버전 | 원문에 없음 |

`[확인 필요]` **"might not"의 조건이 공식 문서에 없다.** 이후 빌드 중 어떤 것이 다시 심사에 걸리는지(변경 규모? 권한 추가? 무작위?) 확인하지 못했다. **"통과 후에는 심사가 사라진다"고 읽으면 안 된다.**

**함의(개인 판단).** 첫 심사를 일찍 통과시켜 두면 유리한 것은 맞다 — 최소한 **첫 빌드분의 대기와 리젝 리스크를 8월에 처리**하게 된다. 다만 이후 빌드가 무조건 심사를 건너뛴다는 전제로 일정을 짜면 안 되고, **W5 직전 빌드가 다시 심사에 걸릴 가능성을 남겨둬야 한다.**

**대가는 하나** — 첫 심사에 낼 빌드가 **최소한의 기능은 갖춰야 한다.** `[확인 필요]` 껍데기 빌드가 [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) **4.2 (Minimum Functionality)** 로 리젝될 가능성이 있다. 회의록상 **W2 종료(8/25)에 "코어 루프 관통(데이터 → 결과물 1편)"** 이 목표이므로, 그 직후가 첫 제출의 현실적 하한이다.

### 4-3. 공개 링크

- **Open to Anyone** (누구나) 또는 **Filter by Criteria** (기기·OS 버전 필터) 선택
- 테스터 수 상한을 **1~10,000 사이**로 설정 가능. 언제든 비활성화 가능
- 공개 링크로 들어온 테스터는 **App Store Connect에 익명으로 표시**된다 (설치일·세션·크래시는 보임)

**함의(개인 판단).** 이 링크를 인스타·카톡에 그대로 뿌릴 수 있다. **TestFlight 공개 링크가 "출시"의 제3 정의가 될 수 있다** — 팀 목표가 *"인스타 스토리에 올렸을 때 '우와' 1회 이상"* 이라면 앱스토어 정식 등재 없이도 성립한다. → [배포 형태 결론](2026-08-17-release-mode-decision.md)에서 다룬다.

`[확인 필요]` **빌드 유효기간은 확인하지 못했다** (최대 100개 빌드 공유 가능만 명시). 통념은 90일이나 공식 근거를 찾지 못했다. **9/1 첫 제출 → 9/22 출시라면 3주이므로 90일 안에 들어와 문제되지 않는다.**

---

## 5. 9/22 역산

### 5-1. 계산 전제

- 심사 1회 = **2~5일** (§3-2, 신규 앱 기준)
- **리젝 1회분 왕복을 반드시 확보** — 신규 앱 최초 제출이라 통과를 가정할 수 없다
- 리젝 대응(수정+재제출) = 2~3일
- 9/22(화) 당일이 아니라 **9/19(금)** 을 승인 목표로 둔다 — 주말 버퍼
- **W5 실사용에 TestFlight가 필요**하고, **첫 빌드는 전체 심사를 받아야 한다**(§4-2)
- 첫 베타 심사에 낼 빌드의 하한은 **W2 종료(8/25) "코어 루프 관통"** 직후

### 5-2. 역산 결과 — 첫 베타 심사를 앞으로 당긴다

| 날짜 | 마일스톤 | 회의록 주차 |
|---|---|---|
| **8/18 (화)** | **Apple Developer Program 등록 착수** (담당: jminkkk) | W1 종료 |
| 8/19~8/21 | 등록 승인 대기 · 승인 직후 §3-3 신속 심사 조건 확인 | W2 시작 |
| 8/25 (월) | 코어 루프 관통 = **첫 심사에 낼 최소 기능 확보** | W2 종료 |
| **~9/1 (월)** | **TestFlight 첫 빌드 제출 → 베타 심사 통과** | **W3 중** |
| 9/2~9/8 | 개발 계속. 빌드 갱신 — **심사가 다시 걸릴 수 있음**(§4-2) | W4 |
| 9/8 (화) | 기능 동결 (회의록 원안 유지) | W4 종료 |
| 9/9~9/15 | **W5 실사용** | W5 |
| **9/15 (월)** | **App Store 정식 제출** | W6 시작 |
| 9/17~9/19 | 정식 심사 통과. **리젝 시 이 구간에서 1회 대응** | W6 |
| **9/22 (화)** | **출시** | — |

### 5-3. 이 역산이 말해주는 것

**첫 심사를 9/8에 넣는 것보다 9/1에 넣는 쪽이 낫다.** 9/8에 처음 넣으면 그 심사가 리젝될 때 W5 실사용이 밀린다. 9/1에 통과해두면 **첫 빌드분의 대기와 리젝은 8월에 끝난다.**

다만 §4-2의 `might not` 때문에 **W5 직전 빌드가 다시 심사에 걸릴 가능성은 남는다.** 이 역산은 "9/1 이후 심사가 없다"가 아니라 **"9/1 이후에는 첫 빌드 심사만큼의 리스크는 없다"** 는 뜻으로 읽어야 한다.

**회의록의 W 구조는 그대로 둘 수 있다.** 기능 동결은 9/8로 유지되고, 앞당기는 것은 첫 심사뿐이다. 추가되는 작업은 **"W3 중에 심사용 빌드를 한 번 낸다"** 하나다.

⚠️ **다만 TestFlight 베타 심사 통과가 정식 심사 통과를 보장하지는 않는다.** 별개 심사다. `[확인 필요]` 통념상 베타 심사가 관문이 낮다고 하나 공식 근거를 찾지 못했다 — 한 번 통과한 이력이 정식 심사에 유리하게 작용하는지도 **확인되지 않은 개인 추측**이다.

그리고 제출 가능한 빌드는 기능이 멈춘 빌드보다 요구사항이 많다:

- 앱 아이콘·스크린샷·설명·개인정보 처리방침 URL
- HealthKit을 쓴다면 usage description 문구 (§[08-11 노트 1-2](2026-08-11-platform-tech-review.md))
- 위치 권한 사용 정당성 설명
- 인스타 공유용 **Facebook App ID** (§[08-11 노트 3](2026-08-11-platform-tech-review.md))

**함의(개인 판단).** 이 부수 작업들은 코드가 아니라서 아무도 잡지 않을 위험이 크다. 그리고 **첫 베타 심사를 9/1로 당기면 이것들도 8월 안에 필요해진다.** → **W2~W3에 스토어 제출물 준비를 별도 트랙으로 두는 것을 제안한다.**

### 5-4. 깨지는 조건

| 조건 | 결과 |
|---|---|
| 등록이 8/21을 넘김 (지연 사유 §2-4) | W2 착수가 밀린다. 복구 가능 |
| 첫 베타 심사가 4.2로 리젝 (§4-2) | 재제출. **W3에 여유가 있어 흡수 가능** |
| 9/1 베타 통과 실패 → 9/8까지 밀림 | 원래 계획으로 돌아갈 뿐. **W5가 위태로워진다** |
| **9/15 정식 제출 실패** | **리젝 1회 여유가 사라진다.** 이후 리젝 = 9/22 불가 |
| 정식 심사 리젝 2회 | **9/22 정식 등재 불가.** → **TestFlight 공개 링크로 전환하는 판단 지점**(§4-3). 베타를 이미 통과해뒀다면 이 경로는 쓸 수 있다 |

**함의(개인 판단).** 9/1에 베타 심사를 통과시켜 두면 **정식 심사가 실패해도 9/22에 배포할 수단이 남는다.** 첫 심사를 앞당기는 이유는 일정 단축이 아니라 이쪽이다.

---

## 6. 미확인 항목

- **크로스플랫폼 실기기 검증** — 회의록이 이 트랙에 남긴 두 항목 중 하나. Expo로 최소 앱을 만들어 30분 러닝 트랙 정확도·배터리를 재는 **실기기 스파이크**가 필요해 이 노트 범위 밖이다. [08-11 노트 §6](2026-08-11-platform-tech-review.md)의 `[확인 필요]`가 그대로 열려 있다
- **신속 심사 신청 폼의 원문** (§3-3) — 로그인 필요. 횟수 제한은 **공식 수치가 없다**는 것까지는 확인
- **`might not`의 조건** (§4-2) — 같은 버전의 이후 빌드 중 무엇이 다시 심사에 걸리는지 공식 문서에 없다. **역산의 전제라 확인 값어치가 크다**
- **TestFlight 베타 심사 vs 정식 심사의 관문 차이** (§5-3) — 통념만 있고 공식 근거 없음
- **미완성 빌드의 4.2 리젝 가능성** (§4-2) — 첫 제출 시점을 언제까지 당길 수 있는지가 여기 걸림
- TestFlight 빌드 유효기간 (§4-3) — 3주 일정이라 실질 영향 없음
- D-U-N-S 발급 기간 (§2-1) — 조직 경로를 접었으므로 확인 불요

---

## 7. 다음 액션

- [ ] **8/18: Apple Developer Program 개인 등록 착수** — §2-5 체크리스트대로. 담당: jminkkk
- [ ] 승인 직후 **§3-3 신속 심사 신청 폼 확인** (로그인 후) — 마지막 카드의 조건을 미리 알아둔다
- [ ] **회의 안건**: **첫 TestFlight 베타 심사를 W3(~9/1)로 당길 것인가** — §5-2. 이 트랙의 핵심 제안
- [ ] **회의 안건**: W2~W3에 스토어 제출물 준비 트랙을 넣을 것인가 (§5-3) — 아이콘·스크린샷·개인정보 처리방침·Facebook App ID
- [ ] **회의 안건**: 정식 심사가 무너졌을 때 **TestFlight 공개 링크를 "출시"로 인정할 것인가**(§5-4) — [배포 형태 결론](2026-08-17-release-mode-decision.md) §4와 같은 질문

---

## 출처

**외부 링크는 전부 2026-08-17에 확인했다.** (예외: `developer.apple.com/contact/app-store/?topic=expedite` 는 Apple 로그인 리다이렉트로 열지 못했다.) "1차 출처"는 Apple 공식 문서이고, 이 노트의 사실 주장은 원칙적으로 여기에만 근거한다.

### 1차 출처 (Apple 공식 문서) — 검증하려면 여기부터

**등록**
- [Become a member — Apple Developer Program](https://developer.apple.com/programs/enroll/) ★ $99/년, 2단계 인증·법적 본명·P.O. Box 불가 원문
- [Apple Developer Program 등록 (한국어)](https://developer.apple.com/kr/programs/enroll/) ★ "연간 미화 99달러 · 등록 과정에서 현지 통화로 표시" 원문 / 개인·조직 비교 / D-U-N-S 요구 원문
- [Enrollment — Membership — Account Help](https://developer.apple.com/help/account/membership/program-enrollment) ★ "24시간 내 확인 메일 없으면 문의" · 조직 D-U-N-S·binding authority · 지연 사유(이름 오기·타인 명의 카드) 원문
- [Choosing a Membership](https://developer.apple.com/support/compare-memberships/)
- [연회비 면제](https://developer.apple.com/help/account/membership/fee-waivers/) — 우리는 해당 없음

**심사**
- [App Review (Distribute)](https://developer.apple.com/distribute/app-review/) ★ **"On average, 90% of submissions are reviewed in less than 24 hours."** 원문
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**TestFlight**
- [TestFlight](https://developer.apple.com/testflight/) ★ 내부 100명(심사 불필요) / 외부 10,000명 / 공개 링크 원문
- [Invite external testers — App Store Connect Help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) ★★ *"External testers are people you invite to test your app who aren't App Store Connect users"* (§2-3) · *"The first build you submit requires a full review, but later builds for the same version **might not**"* (§4-2) · 한 버전당 동시 심사 1건 · 24시간 6빌드 제한 · 공개 링크 옵션·익명 표시 원문
- [Add internal testers — App Store Connect Help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [TestFlight overview — App Store Connect Help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)

### 2차 자료 (사실 근거 아님 — 배경·방향 참고용)

- [App Store Review Time in 2026: Expected Approval Windows and Delays — Aerious](https://aerious.uk/blog/app-store-review-time-in-2026-expected-approval-windows-and-delays) — 신규 앱 2~5일, "Waiting for Review" 대기 2~3일
- [App Store Review Time for Mobile Apps in 2026 — LOW/CODE](https://www.lowcode.agency/blog/app-store-review-time)
- [App Store Review Delays in 2026 — Appbot](https://appbot.co/blog/app-store-app-review-approval-vibe-coded-delays-2026/) — 계정 이력에 따른 심사 속도 차이
- [Mac App Store Review Times Increasing — Michael Tsai](https://mjtsai.com/blog/2026/03/02/mac-app-store-review-times-increasing/)

**신속 심사 (§3-3) — 전부 2차 자료. 공식 횟수 제한은 확인되지 않음**
- [Apple Developer Forums — Expedited review times and limits](https://developer.apple.com/forums/thread/29582) · [Any restrictions for how often…](https://developer.apple.com/forums/thread/115193) — 포럼이라 Apple 공식 입장이 아님
- [How to Request Expedited App Store Review (And When It Works)](https://iossubmissionguide.com/expedited-app-store-review-request/) — "연 1~2회로 아껴 쓰라" 권고의 출처
- [How to expedite an app review on the App Store — Pol Piella](https://www.polpiella.dev/expedited-app-reviews)
- 원화 ₩129,000 보고 (커뮤니티, **공식 확인 안 됨**): [Threads @liko.koala](https://www.threads.com/@liko.koala/post/DECuz_NSouM?hl=ko) · [Threads @seonggoos](https://www.threads.com/@seonggoos/post/DVKxujxjoEI/) · [카페24 Help Center](https://support.cafe24.com/hc/ko/articles/25401873784089)

### 팀 내부 문서

- [2026-08-11 통합 회의 종합](https://github.com/everyware-ie/mechuri-docs/blob/main/meetings/2026-08-11/synthesis.md) — 9/22 데드라인·1주차 분담·6주 역산 (`mechuri-docs` private repo)
- [플랫폼 기술 검토 (08-11)](2026-08-11-platform-tech-review.md) — HealthKit·인스타 공유·네이티브 필요성. 이 노트의 전제
- [여정형 러닝 (07-28)](2026-07-28-journey-running-concept.md)
