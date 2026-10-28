---
title: 스레드 통계 가져오기
product: running
type: marketing
status: draft
updated: 2026-10-20
---

# 스레드 통계 가져오기

팀 스레드 계정(@team.mechuri)의 조회수, 상호작용, 팔로워를 모아 두는 곳이다.
최신 수치는 [stats.md](stats.md)에 있다.

| 파일 | 내용 |
|---|---|
| [stats.md](stats.md) | 최신 요약, 팔로워 추이, 주별 조회, 게시물별 수치. 자동으로 만든다 |
| `snapshots/날짜.json` | 그날 받은 원본 수치. 추이를 볼 때 쓴다 |
| [scripts/threads-insights.py](../../../scripts/threads-insights.py) | 수치를 가져오는 스크립트 |

## 수치 갱신하기

회의 안건을 쓰기 전에 한 번 돌린다. 터미널에서 직접 해도 되고, Claude나 Codex에게 "스레드 통계 갱신해 줘"라고 해도 된다.

```bash
python3 scripts/threads-insights.py snapshot
```

오늘 날짜의 스냅숏이 생기고 `stats.md`가 다시 만들어진다. 같은 날 다시 돌리면 그날 파일을 덮어쓴다. 둘 다 커밋한다.

저장하지 않고 터미널에서만 보려면 `report`를 쓴다.

## 처음 한 번 연결하기

토큰은 실행하는 사람의 맥에만 둔다. 다른 맥에서 쓰려면 아래를 그 맥에서 한 번 한다.

1. [Meta 개발자 사이트](https://developers.facebook.com)의 팀 앱(사용 사례: Threads API 액세스)으로 들어간다. 앱은 팀 구글 계정으로 만든 페이스북 계정에 있다
2. **사용 사례 → Threads API 액세스 → 설정 → 사용자 토큰 생성기**에서 팀 스레드 계정의 토큰을 만든다
3. 터미널에서 저장한다. 토큰은 붙여 넣어도 화면에 보이지 않는다

```bash
python3 scripts/threads-insights.py set-token
```

**토큰과 앱 시크릿은 레포, 채팅, 카톡 어디에도 붙여 넣지 않는다.** 레포가 공개라서다. 스크립트는 `~/.config/runary-threads/`에만 저장한다.

토큰은 60일 동안 쓸 수 있다. 만료 2주 전부터는 `snapshot`을 돌릴 때 자동으로 60일 연장된다. 두 달 넘게 안 돌려서 만료되면 2번부터 다시 한다.

### "API access blocked"가 나올 때

토큰이 유효한데도 `Threads API 오류: 400 API access blocked.`가 나올 수 있다. 2026-10-27에 한 번 있었고, 팀 페이스북 계정에 로그인해 사람 인증을 다시 하자 풀렸다. 그래도 안 되면 Meta 개발자 사이트의 "필수 조치"를 확인하고 토큰을 새로 만든다.

### 앱 설정 (이미 해 둠)

새로 만들어야 할 때만 본다.

- 권한: `threads_basic`, `threads_manage_insights`
- 앱 역할: 팀 스레드 계정을 **Threads 테스터**로 추가하고, 스레드 앱의 **설정 → 더보기 → 웹사이트 권한 → 초대**에서 수락
- 앱이 개발 모드여도 된다. 우리 계정만 읽으니 앱 심사는 필요 없다
- 비용은 없다. API 사용료가 없고, 하루 호출 한도는 우리 사용량보다 훨씬 크다

## 숫자 읽는 법

| 지표 | 주의할 것 |
|---|---|
| 계정 전체 조회 | Meta 문서에는 "프로필 조회"라고 돼 있다. 하지만 실제 값이 모든 게시물 조회의 합보다 크다. 우리가 단 답글까지 들어간 계정 전체 노출로 본다 |
| 계정 전체 좋아요·답글 | 우리가 단 답글에 달린 반응까지 들어가서 게시물 합계보다 조금 크다 |
| 게시물 조회·공유 | Meta 문서에 "개발 중"으로 표시된 지표다. 값이 비거나 기준이 바뀔 수 있다 |
| 게시물 답글 | 그 글에 바로 달린 답글만 센다. 답글의 답글은 빠진다 |
| 주별 조회 | 미국 태평양 시간 기준으로 하루가 나뉜다. 한국 시간과 몇 시간 어긋난다 |
| 링크 클릭 | 우리 게시물에 넣은 링크를 누른 횟수다. 프로필 방문 수가 아니다. 프로필 링크 클릭이 들어가는지는 API 문서에 없다. 스레드 앱 인사이트에서는 프로필 링크 클릭을 볼 수 있다 |
| 팔로워 분포 | 나라·나이·성별 분포는 팔로워가 100명이 넘어야 볼 수 있다. 지금은 가져오지 않는다 |

## 분석할 때

- **추이는 스냅숏끼리 비교한다.** `stats.md`의 괄호 숫자가 지난 수집 대비 늘어난 값이다. 더 긴 기간은 `snapshots/` 파일들을 비교한다
- **글 하나의 성과는 올리고 일주일쯤 지나서 본다.** 스레드 글은 며칠 동안 조회가 계속 붙는다
- **결과물 글과 질문 글을 나눠 본다.** 첫 수집(10/20)에서 질문형 글은 조회 수천~2만, 결과물 자랑 글은 수십~수백이었다
- **조회와 팔로우는 따로 본다.** 2차 스프린트 목표는 팔로워 50명이다([결정](../../decisions/2026-10-06-second-sprint-app-store.md)). 조회가 늘어도 팔로워가 그대로면 이어지는 장치가 없다는 뜻이다

## 출처

- [Threads Insights API](https://developers.facebook.com/docs/threads/insights/): 지표 목록과 "개발 중" 표시
- [Threads API 시작하기](https://developers.facebook.com/docs/threads/get-started): 앱, 테스터, 권한
- [장기 토큰](https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens): 60일 유효, 연장 조건
- [Threads API 개요](https://developers.facebook.com/docs/threads/overview): 호출 한도
- [Threads API 변경 이력](https://developers.facebook.com/docs/threads/changelog): 2025-07-02 링크 클릭 지표 추가
- [TechCrunch (2025-05-15)](https://techcrunch.com/2025/05/15/threads-now-lets-creators-add-up-to-5-links-to-profiles-track-clicks): 프로필 링크 5개와 앱 인사이트의 클릭 추적
