---
title: 측정 버전 TestFlight와 다음 정식 심사 준비
product: running
type: ops
status: draft
updated: 2026-11-03
---

# 측정 버전 배포 준비

측정 화면의 문구 검토와 다음 정식 심사용 자료 작성을 마쳤다. 첫 TestFlight 시도는 Apple 개발자 계약 동의 요구로 멈췄으며, 11월 3일 저녁에는 계약과 기존 서명 확인을 통과해 재개했다.

11월 3일 저녁의 새 조회에서 기존 `1.0.0(39)`은 `READY_FOR_DISTRIBUTION`으로 바뀌었다. 선택 빌드 ID는 이전과 같다. 이번 작업에서 기존 버전, 공개 개인정보 처리방침과 FAQ, App Privacy 답변은 변경하지 않았다.

## 11월 3일 하단 탭과 배포 재개

사용자 승인을 받은 보관함·러닝 탭을 구현하고 코드 리뷰와 실기기 화면 전환 QA를 마쳤다. 전체 Jest 53개 묶음 391개, 타입·린트·구성·문서 검사를 통과했다. 보관함의 스크롤 위치와 같은 러닝의 시간 유지, 측정 중 탭 숨김, 일시정지·종료 뒤 1:39 QA 기록의 저장을 확인했다. [하단 탭 구현 노트](../product/features/home-running-tabs.md)에 상세 범위를 남긴다.

새 배포 소스는 `1b55232d2a7bf53a8db3f7cffc0f0c6d41a63053`이다. 먼저 요청한 `1.0.0(46)`은 기존 버전의 정식 출시 상태를 확인한 뒤 취소했고, 앱 버전을 `1.0.1`로 올려 새 빌드를 요청했다. 아래 41c627a 표와 중단 지점은 첫 시도의 이력이다. 새 빌드와 업로드의 최종 결과는 [빌드 기록](build-and-dev-commands.md)에 남긴다.

새 소스 사본은 `/private/tmp/runary-tabs-release-1b55232-source.tar.gz`이며 SHA-256은 `8276c9df652bacec24263f190448aa73bda238cd94719d6f2e2a63bcf70bbad6`이다. 개인 설정은 포함하지 않았다.

최종 배포는 **TestFlight `1.0.1(47)`**다. EAS 빌드와 제출이 모두 완료됐고 세 타깃 구성과 서명 검증을 통과했다. Apple `VALID / IN_BETA_TESTING`, 미만료와 기존 내부 그룹 3명 연결까지 확인했다. 외부 배포와 정식 제출 선택은 유지했다. 새 TestFlight 설치 검증은 남아 있다.

## 첫 시도에서 보관한 소스

| 항목 | 값 |
|---|---|
| 브랜치 | `codex/feature/tracking-screen-refinement` |
| 앱 소스 | `41c627a` |
| 빌드용 깨끗한 체크아웃 | `/private/tmp/runary-release-41c627a` |
| 프로필 / 채널 | `internal-tracking` / `internal-tracking` |
| 구성 | 아이폰 측정, 워치 운동 연동, 실시간 현황, 건강 저장 |
| 소스 사본 | `/private/tmp/runary-release-41c627a-source.tar.gz` |
| 사본 SHA-256 | `56a7d4e643fbbfe4a00deda6e6f4c1b0ccbe75fdf4821e86d4192b4074d455bb` |

`internal-tracking`은 production을 상속한 스토어 배포 프로필이다. 측정 플래그를 포함하며, 팀 테스트 배지와 진단은 Debug에서만 표시한다. 기존 production 프로필과 현재 심사 빌드의 구성은 유지했다. 개인 파일 `.claude/launch.json`은 빌드 소스와 커밋에서 제외했다.

임시 폴더는 OS가 정리할 수 있다. 재개 시 없으면 위 커밋을 새 깨끗한 체크아웃으로 복원한다. 이후 문서 커밋은 이 앱 소스를 바꾸지 않는다.

## 첫 시도의 검토 결과

연결 설정, GPS와 심박 대기, 워치 충돌, 건강 저장, 삭제와 오류 안내를 다듬었다. 설명과 조건이 갈리는 곳에서 줄을 나누고 짧게 이어지는 문장은 함께 두었다. 아이콘 제어와 측정 정책은 유지했다.

`humanize-korean` 공개 지침의 임시 사본으로 진단, 윤문, 원문 대조를 진행했다. Claude 플러그인을 설치하거나 Opus를 실행한 것은 아니다. 마지막 대조에서 UI의 강제 줄바꿈 7곳, 문서의 강제 줄바꿈 15곳을 줄였다. 그 뒤 코드와 다시 대조해 건강 자동 저장이 ‘설정을 켠 뒤 새로 시작한 러닝’부터 적용된다는 조건을 분명히 했다.

최종 구조 검사는 UI 문자 변경률 3.6%, 문서 1.9%이며 수치·인용 검사와 서법 보존 검사를 통과했다. 이 수치는 자연스러움의 등급이나 법률 검토 결과가 아니다.

| 검사 | 결과 |
|---|---|
| TypeScript | 통과 |
| ESLint | 오류 0개, 기존 경고 30개 |
| 전체 Jest | 기존 51개 묶음, 381개 통과 |
| 추가 표시 조건과 관련 Jest | 새 3개를 포함한 14개 통과. 전체 384개를 다시 실행한 결과와 구분 |
| 측정 빌드 구성과 확장 생성 | 통과 |
| Swift | 기존 측정·실시간 현황 192개와 워치 예외 33개 통과 |
| 문서 정합성과 공백 | 통과 |

실기기에서는 로컬 개발 앱 47·48의 심박 수신, 앱 목록 이후 측정 화면 자동 복귀, 응답 지연 중 종료 요청의 최초 시각과 단일 저장을 확인했다. 기존 기록도 보존됐다. 첫 시도에서는 스토어 바이너리를 만들지 못했으며 11월 3일 재개 결과는 위의 별도 절에 기록한다. 새 TestFlight 설치 검증, OS 권한 철회와 다른 운동 앱의 실제 충돌 화면은 남은 확인이다.

Notion에서는 개인정보 처리방침, FAQ와 공지의 실제 데스크톱 화면에서 문단과 줄바꿈을 확인했다. 비공개 편집 화면은 390px에서 고정 여백 때문에 본문이 좁아져 실제 공개 모바일 화면의 검증을 대신하지 못했다. 공개 적용 시 비로그인 모바일 화면을 다시 확인한다.

## 첫 시도의 중단 지점과 재개 절차

첫 요청에서 EAS 원격 번호가 44에서 45로 증가했다. Apple의 최신 Program License Agreement 미동의로 서명 준비가 실패했으며 EAS 빌드 ID, IPA와 TestFlight 등록은 생성되지 않았다. 45번은 예약 번호일 뿐이다. 로컬 개발 앱 45·48과 이 원격 번호는 별개다.

대화형 `eas credentials` 조회도 자동 승인 검토에서 거절됐다. 인증서·프로파일을 생성하거나 바꿀 수 있는 관리 명령이라는 이유다. 이 명령은 실행하지 않았고 다른 경로로 우회하지 않았다. 계약 동의, 신규 서명 자산이나 기기 등록도 진행하지 않았다.

계정 소유자가 [Apple Developer 계정](https://developer.apple.com/account/)에서 계약을 직접 확인하고 동의하도록 안내했으며 다음 절차를 준비했다. 실제 재개에서는 11월 3일의 새 앱 소스와 1.0.1 버전을 사용한다.

1. 새 배포 소스와 깨끗한 체크아웃을 확인한다. 기존 심사 결과도 다시 읽어 현재 버전을 확인한다.
2. `frontend/`에서 기존 CLI로 `eas build --platform ios --profile internal-tracking --non-interactive --freeze-credentials --json --wait`를 실행한다. 서명 자산 변경이 필요하면 멈추는 옵션이다. Apple의 번들 확인은 그대로 필요하므로 계약 동의를 대신하지 않는다. 번호는 다시 증가할 수 있다. 45로 되돌리지 않는다.
3. 생성된 빌드 ID와 커밋, 완료 상태를 확인한다. IPA의 앱·워치·실시간 현황 확장, 측정 플래그, 권한 설명과 개인정보 매니페스트를 점검한다.
4. `eas submit --platform ios --profile production --id <새 빌드 ID> --non-interactive`로 그 빌드만 업로드한다. `--latest`로 이전 빌드를 고르지 않는다.
5. Apple의 `VALID / IN_BETA_TESTING`, 미만료와 내부 설치 가능 상태를 확인한다. 이 단계가 끝나야 TestFlight 등록 완료로 안내한다.
6. 실제 TestFlight에서 준비·측정·종료 저장, 워치 심박·제어·화면 복귀를 확인하고 확정된 버전 번호로 팀 공유 문안을 작성한다.

현재 제출의 빌드 교체, 심사 취소, 외부 테스터 그룹 변경은 이 절차에 포함하지 않는다. 서명 자산 변경이 새로 필요하면 해당 범위를 별도로 확인한다.

실패 로그: `/private/tmp/runary-tf-new-build.log`. Apple 전후 조회: `/private/tmp/runary-asc-review-before-release.json`, `/private/tmp/runary-asc-review-after-release.json`. 다음 작업자가 임시 파일의 존재만으로 업로드 성공을 판단하지 않도록 상태를 구분한다.

## 다음 정식 심사용 문서

[비공개 Notion 준비 페이지](https://app.notion.com/p/40c40e8014f98182b4f8e4f016558bd0)에 다섯 문서를 보관했다. 공개 Runary 허브의 하위 페이지로 만들거나 사이트에 게시하지 않았다.

| 문서 | 저장소 사본 | Notion 초안 |
|---|---|---|
| 개인정보 처리방침 | [개정안](measurement-release-2026-11-02/privacy-draft.md) | [개정안](https://app.notion.com/p/40c40e8014f98114bc84f916c9aaf2f5) |
| FAQ | [개정안](measurement-release-2026-11-02/faq-draft.md) | [개정안](https://app.notion.com/p/40c40e8014f9813aa3ebef5fa0d5b1be) |
| 공지 | [게시 전 초안](measurement-release-2026-11-02/release-notice-draft.md) | [공지안](https://app.notion.com/p/40c40e8014f981478d50e043c038e4d0) |
| 영문 심사 메모 | [입력안](measurement-release-2026-11-02/app-review-notes.md) | [심사 메모](https://app.notion.com/p/40c40e8014f981f58efcfd1acc8ad8d8) |
| App Privacy | [제출 전 대조](measurement-release-2026-11-02/app-privacy-review.md) | [대조표](https://app.notion.com/p/40c40e8014f9818b917de6e26ed02336) |

측정 버전의 정식 제출 전에 다음을 확정한다.

- 현재 39번의 심사 결과와 새 제출 버전. 1.0.0이 출시됐다면 새 마케팅 버전으로 다시 빌드한다.
- 시행일과 적용 버전. 현재 방침을 먼저 보관하고 고정 URL에서 개정하며 이력과 하위 보관본은 최신순으로 유지한다. [개정 절차](public-policy-versioning.md)를 따른다.
- App Privacy 답변. 설치 SDK와 Expo·Notion 등의 실제 처리를 대조해야 하며 ‘자체 서버 없음’만으로 ‘데이터 수집 안 함’을 확정하지 않는다.
- 지민이 준비한 소개와 스크린샷이 새 측정 화면·워치 구성과 맞는지 확인한다.
- 공개 방침·FAQ·공지의 비로그인 데스크톱·모바일 표시와 링크, 제출 IPA의 실제 동작을 확인한다.

그 뒤 새 버전에만 메모와 빌드를 선택한다. [Apple의 제출 빌드 선택 안내](https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit/)에 따라 업로드와 정식 심사 빌드 선택을 구분한다.
