# 다이어리 탭

- FRD: [다이어리](../../specs/frd/diary.md), [보관함과 러닝 하단 탭](../../specs/frd/home-running-tabs.md)
- PRD: [다이어리 PRD](../../specs/prd/diary.md)
- 결정: [3차 스프린트 결정](../../decisions/2026-11-10-third-sprint-crew-diary.md)
- 구현 상태: 구현했다(2026-11-12). 2026-11-12 지응이 계획을 확인했다. 타입·린트·단위 테스트 통과, 실기기 확인 대기

## 코드 구조

| 파일 | 역할 |
|---|---|
| `frontend/src/lib/diary.ts` | 기록 목록에서 날짜별 러닝을 모으고 월 달력 칸, 요약, 최근 4주를 계산한다. 화면과 무관한 순수 함수 |
| `frontend/src/lib/diary-marker-store.ts` | 뛴 날 표시(메추리/사람) 선택을 AsyncStorage에 저장한다 |
| `frontend/src/components/diary-marker.tsx` | 두 아이콘을 `react-native-svg`로 그린다. SF Symbols에 메추리가 없어서 시안의 선 그림을 코드에 넣었다 |
| `frontend/src/app/(home)/diary.tsx` | 다이어리 화면과 아이콘 선택 시트 |
| `frontend/src/components/home-tabs.tsx` | 세 번째 탭 추가. 기록을 `Tracking.records()`에서 읽으므로 측정 기능이 있는 빌드에만 보인다 |

## 정한 것

- 날짜는 `RunSummary.started`(초 단위)를 기기의 현재 시간대로 바꿔 정한다. 완료(`completed`)된 기록만 센다
- 요약의 "가장 길게"는 하루 합이 아니라 한 번에 뛴 가장 긴 거리다. FRD에 하루 합인지 한 번인지 적혀 있지 않아 한 번으로 구현했다 [확인 필요]
- 뛴 날을 누르면 기록이 하나일 때 측정 상세(`/internal-run/[id]`)로 바로 이동하고, 둘 이상이면 목록 시트를 거친다(2026-11-12 지응). 상세에서 돌아와도 보던 달을 유지한다

- 한 주는 일요일에 시작한다. 2026-11-11에 월요일로 정했다가 2026-11-12 지응이 일월화수목금토로 바꿨다. 달력과 최근 4주가 같은 기준이다

## 어긋남 기록

아직 없음.
