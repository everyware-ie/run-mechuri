---
title: App Store 분석 수치 모으기
product: running
type: marketing
status: draft
updated: 2026-11-10
---

# App Store 분석 수치 모으기

App Store Connect 분석 탭의 노출, 페이지 조회, 다운로드를 매주 모아 두는 곳이다.
최신 수치는 [stats.md](stats.md), 원본은 [snapshots/](snapshots/2026-11-10.json)에 있다.

## 언제

회의 안건을 쓰기 전에 한 번. 스레드 통계([threads/README.md](../../threads/README.md))와 같이 갱신한다.

## 어떻게

API 키 없이 브라우저로 읽는다. 크롬에 App Store Connect가 로그인되어 있으면 Claude가 Claude in Chrome으로 아래 주소를 열어 읽는다.

주소의 앞부분은 같다. `dateSpec=r:시작일:끝일`로 기간을 정한다.

```
https://appstoreconnect.apple.com/apps/6807295594/analytics/metrics?chartType=singleaxis&frequency=day&dateSpec=r%3A20261103%3A20261108&measureKey=units
```

| 보고 싶은 것 | 붙이는 값 |
|---|---|
| 최초 다운로드 | `measureKey=units` |
| 노출 | `measureKey=impressionsTotal` |
| 제품 페이지 조회 | `measureKey=pageViewCount` |
| 유입 경로별로 나누기 | `groupByDimensionKey=source` 추가 |

재다운로드, 업데이트, 전환율은 개요 화면(`/analytics/overview?dateSpec=...`)에 합계로 나온다.

읽은 값은 `snapshots/<수집일>.json`에 저장하고 [stats.md](stats.md)에 주별로 한 줄씩 더한다.

## 읽을 때 주의

- **하루는 UTC 기준.** 한국 시간 오전 9시에 날짜가 바뀐다
- **하루 이틀 늦게 잡힌다.** 수집일 전날, 전전날은 비어 있을 수 있다
- **세션, 활성 기기, 유지율, 충돌**은 데이터 공유에 동의한 사용자만 집계한다. 수가 적으면 "데이터 부족"으로 안 보인다
- **"앱 추천 방문"**은 다른 앱(카톡, 스레드 등) 안의 링크로 들어온 것. 어느 앱인지는 수가 적으면 안 보인다
- 팀원 본인 다운로드도 숫자에 들어간다
