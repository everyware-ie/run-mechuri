# 러닝 기록 선택

- FRD: ../../specs/frd/run-record-selection.md
- 이슈: -
- 구현 상태: 진행 중

## 구현 노트

`frontend/modules/health-kit-bridge`에 HealthKit 읽기 전용 로컬 네이티브 모듈을 만들었다.

- `requestAuthorization()` — 공통 규칙 §1-2: 목록을 열려 할 때 권한을 묻는다
- `getOutdoorRuns()` — §2-1 실외 달리기만(`HKMetadataKeyIndoorWorkout` 필터), §2-3 목록 항목(날짜·거리·시간·페이스·심박), §2-4 최신순 정렬
- `getRoute(workoutId)` — §5 고른 다음에만 호출, 실제 좌표를 가져온다(목록 화면에서는 안 부름)
- `hasRoute` 플래그로 §2-2(좌표 없는 기록은 보이되 고를 수 없음)를 화면 쪽에서 처리할 수 있게 함

### 화면 (`record-selection.tsx`) — "3안" 시안 S3 (2026-09-01)

- 헤더 우측 ↻ 새로고침. 상단 "APPLE 건강 · 실외 러닝" 라벨
- 행: 자리표시 아이콘(52px) + 제목 "8월 22일 (토) 저녁"(`formatRunTitle` — 날짜 + 요일 + 시간대 버킷) + 메타 한 줄(거리·시간·페이스·심박, `stamp-format` 재사용)
- **경로 썸네일은 안 그린다**: 시안엔 경로 모양 썸네일이 있지만 §5(좌표는 고른 뒤에만 조회)라 목록에서 전부 조회하면 비싸다 — 아이콘 자리표시로 대체. 아이콘: 좌표 있음 `〜` / 없음 `—` / 실패 `!`
- §2-2 좌표 없는 기록 → 점선 테두리 + 흐린 제목 + "좌표가 저장되어 있지 않음"
- §6 좌표 조회 실패 → `failedIds`에 담아 그 줄에 accent 점선 + "다시 시도" 인라인 버튼(다시 `handleSelect`)
- 하단 안내: "실내 러닝은 이 목록에 오지 않아요. 점선은 보이지만 고를 수 없는 상태예요."

**아직 안 한 것**: §5 트랙 좌표를 앱에 복사해 보관하는 로컬 저장, `[확인 필요]` 항목(좌표 없는 워크아웃이 얼마나 흔한지)은 실기기 확인 전.

`app.json`에 `NSHealthShareUsageDescription`, `com.apple.developer.healthkit` entitlement 추가함. 실제 권한 흐름과 데이터 형식은 development build로 실기기 테스트해야 확인된다(2026-08-25 결정 §7 확인하고 넘어간 것 참고).

## 어긋남 기록

(아직 없음)
