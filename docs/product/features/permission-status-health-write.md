# 앱 권한 화면의 건강 앱 저장 권한 표시

- FRD: [자체 러닝 측정 내부 검증](../../specs/frd/internal-run-tracking.md) §2-1 앱 권한 화면(2026-10-29 개정, "건강 앱에 저장하는 권한은 상태를 확정해서 보여준다")
- 근거 QA: [QA 기록](../../ops/qa-log.md) 2026-10-27 "지민·지응 기기에서 건강 앱 저장이 안 됨"(지응). [10/27 회의](../../meetings/2026-10-27/synthesis.md)에서 "확인 필요"
- 구현 상태: **구현했다**(2026-10-29, 사용자가 FRD 개정안을 확인). 실기기 확인 대기. 새 TestFlight 내부 측정 빌드가 필요하다

## 왜 하나

지응·지민의 기기에서는 Runary 기록이 건강 앱에 저장되지 않는다. 앱 권한 화면에는 건강 항목이 "건강 앱에서 권한 확인"이라고만 나와서, 쓰기 권한이 꺼진 것인지 자동 저장 설정이 꺼진 것인지 알 수 없다. 저장 코드([TrackingHealthExport.swift](../../../frontend/modules/run-tracking/ios/TrackingHealthExport.swift))는 운동 쓰기 권한이 허용이 아니면 오류를 화면에 알리지 않고 저장 상태를 `failed`로 남기고 끝낸다.

## 정할 것

- HealthKit은 쓰기 권한 상태를 알려준다(`HKHealthStore.authorizationStatus(for:)`). 운동·경로·심박 세 가지를 각각 읽어 `허용됨`, `허용 안 됨`, `아직 요청하지 않음`으로 보여준다.
- 건강 앱 자동 저장 설정(`healthExportEnabled`)의 켜짐·꺼짐을 같이 보여준다.
- 읽기 권한은 허용 여부를 알 수 없으므로 지금 문구를 그대로 둔다.
- 표시만 한다. 앱에 토글을 만들지 않는다.
- 측정 화면의 `워치 운동 연동`·`건강 앱 자동 저장` 버튼 위에 `켜짐`·`꺼짐` 문구를 더한다. 버튼 문구(`끄기`/`켜기`)는 누르면 일어날 동작이라 현재 상태처럼 읽혀 헷갈린다는 지적(2026-10-29)에 따른 것이다. 자동 저장이 켜져 있는데 운동 쓰기가 허용 안 됨이면 경고를 보여준다.

## 구현 방향

- `TrackingManager.swift`의 `state()`(`healthExportEnabled`를 이미 내려주는 곳)에 세 권한의 원시 값을 추가한다.
- `RunTracking.ts`의 `TrackingState` 타입에 필드를 추가하고, `tracking-permissions.ts`의 `readAppPermissions`가 항목을 만든다.
- `app-permissions.tsx`는 항목 배열을 그대로 그리므로 화면 코드는 거의 바뀌지 않는다.
- 상태 값을 문구로 바꾸는 규칙은 `tracking-permissions.ts`에 두고 Jest로 검사한다.

## 구현

- `TrackingHealthExport.swift`: `workoutWriteStatus`, `routeWriteStatus`, `heartWriteStatus`(쓰기 권한 원시 값, 0 요청 전, 1 거부, 2 허용)
- `TrackingManager.swift`의 `snapshot()`: 위 세 값을 `healthWorkoutWrite`, `healthRouteWrite`, `healthHeartWrite`로 내려준다
- `RunTracking.ts`: `TrackingState`에 세 필드(옛 네이티브 빌드에는 없을 수 있어 선택값)
- `tracking-permissions.ts`: `writePermissionText`, `toggleText`와 항목 네 개(운동 저장, 경로 저장, 심박 저장, 자동 저장). 필드가 없는 옛 빌드는 `새 빌드 필요`로 표시하고 거부로 단정하지 않는다
- `internal-run.tsx`: 두 버튼 위에 현재 상태 문구와 경고

## 검증 (2026-10-29)

- Jest `tracking-permissions.test.ts` 7개 통과(권한 항목 순서, 거부·미요청·허용 매핑, 옛 빌드 처리, 조회 실패)
- 타입 검사 통과, ESLint 오류 0개(기존 경고 30개 그대로), 기존 Swift 검사(측정 137개, 잠금화면 36개) 통과
- 시뮬레이터용 전체 빌드 성공(`TrackingHealthExport.swift`와 `TrackingManager.swift` 컴파일 확인). 이 브랜치로 바꾼 뒤 `pod install`을 한 번 해야 한다
- **실기기 화면 확인은 못 했다.** 서명 문제로 Xcode Run으로는 내부 측정 빌드를 올릴 수 없다

## 확인할 것

- 실기기: 이 표시가 지응·지민 기기에서 어떻게 나오는지. Swift 변경이라 **Xcode Run이 아니라 내부 측정 빌드(TestFlight)로만 볼 수 있다.**
- `HKSeriesType.workoutRoute()`의 쓰기 권한 상태가 운동과 따로 나오는지.

## 어긋남 기록

없음.
