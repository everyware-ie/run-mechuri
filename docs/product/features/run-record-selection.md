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

**아직 안 한 것**: 화면(`frontend/src/app`) 연결, §5 트랙 좌표를 앱에 복사해 보관하는 로컬 저장, 심박 없을 때 빈 자리 안 남기는 렌더링, `[확인 필요]` 항목(좌표 없는 워크아웃이 얼마나 흔한지)는 실기기 확인 전이라 미해결.

`app.json`에 `NSHealthShareUsageDescription`, `com.apple.developer.healthkit` entitlement 추가함. 실제 권한 흐름과 데이터 형식은 development build로 실기기 테스트해야 확인된다(2026-08-25 결정 §7 확인하고 넘어간 것 참고).

## 어긋남 기록

(아직 없음)
