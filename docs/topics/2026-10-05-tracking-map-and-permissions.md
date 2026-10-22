# 러닝 지도와 권한 이동 보완안

2026-10-05 · 지도 구현·화면 QA 완료, 권한 이동은 검토 초안

사용자는 다른 앱에서 권한 항목을 눌러 바로 활성화 화면으로 이동한 경험을 알렸고, 이번 내부 측정에 지도도 포함하자고 제안했다. 사용자가 이어서 지도 추가 작업을 요청했다. 지도 범위는 PRD·FRD에 반영하고 구현·실기기 화면 QA를 진행했다. 야외 GPS·배터리 실측 완료를 뜻하지 않는다. 권한별 이동과 워치 기본 연결 변경은 아직 별도 검토안이다. 구현·검증 결과는 [내부 측정 구현 노트](../product/features/internal-run-tracking.md)에 모은다.

근거: [내부 측정 PRD](../specs/prd/internal-run-tracking.md) §2 범위, [FRD](../specs/frd/internal-run-tracking.md) §1-1 실제 러닝을 위한 화면 구성·§2-1 앱 권한 화면.

## 1. 권한 화면 이동은 항목과 상태에 따라 다르다

앞선 답변의 개별 설정 이동 제한을 모든 권한에 적용하면 부정확하다. 알림은 앱별 알림 설정으로 직접 이동하는 공식 API가 있다. Runary에는 현재 알림 기능이 없으므로 이 예외 때문에 알림 권한을 새로 추가하지 않는다. [Apple 알림 설정 이동](https://developer.apple.com/documentation/uikit/uiapplication/opennotificationsettingsurlstring).

처음 요청하는 위치·카메라는 시스템 허용 창을 앱에서 띄울 수 있다. 이는 설정 앱의 기존 토글 화면으로 이동하는 것과 다르다. 이미 거부한 위치 등은 Runary 앱 설정으로 안내한다. 이번 조사에서 위치·카메라·동작의 개별 토글로 직접 이동하는 공개 API는 확인하지 못했다. 어떤 앱에서 어떤 권한을 봤는지는 사용자 답변을 받으면 추가 비교한다. [Apple 위치 요청](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services), [카메라 최초 요청](https://developer.apple.com/documentation/avfoundation/avauthorizationstatus/notdetermined), [앱 설정 이동](https://developer.apple.com/documentation/uikit/uiapplication/opensettingsurlstring).

권장 버튼은 아직 요청하지 않은 항목의 `허용하기`, 거부된 항목의 `Runary 설정 열기`다. 설정 이동 전에 바꿀 항목을 한 줄로 알려주고 복귀 시 실제 상태를 다시 읽는다. 위치 서비스 전체 비활성·기기 제한·미지원과 앱별 거부는 구분한다. 버튼만 눌렀다고 허용 완료로 표시하지 않는다. 권한 요청으로 운동 기록이나 GPS 수집을 시작하지 않는다.

대략적인 위치만 허용한 사용자에게는 일시적인 정확한 위치 요청도 검토할 수 있다. 영구적으로 정확한 위치 토글을 켜는 방식은 아니며, Info.plist의 사용 이유와 OS 허용 조건이 필요하다. 첫 지도 버전의 필수 구현으로 확정하지 않는다. [Apple 일시적인 정확한 위치 요청](https://developer.apple.com/documentation/corelocation/cllocationmanager/requesttemporaryfullaccuracyauthorization(withpurposekey:completion:)).

건강 데이터는 OS 권한 요청과 건강 앱의 앱별 접근 관리로 다룬다. 읽기 허용·거부를 앱에서 단정하지 않는다. 임의의 설정 주소로 직접 이동이 보장된 것처럼 표시하지 않는다. [Apple 건강 권한 안내](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

## 2. 이번 지도 범위 추천

현재 위치와 실제 지나온 경로가 보이면 측정 경험이 분명해지고, 내부 러닝에서 GPS 누락도 알아차리기 쉽다. 지도 화면은 기존 네이티브 GPS 수집에 표시를 붙이는 역할을 맡는다.

| 화면 | 추천 동작 |
|---|---|
| 준비 | GPS 준비 후 현재 위치를 지도에 표시. 위치가 없으면 준비 안내를 표시하고 임의의 장소를 현재 위치처럼 보여주지 않음 |
| 측정 | 지도에 현재 위치·채택된 경로·출발점을 표시. 지도 아래 시간·거리·페이스·심박을 동일한 중요도로 배치하고 일시정지·종료는 하단 고정 |
| 지도 탐색 | 손으로 지도를 움직이면 따라가기 중지. 현재 위치 버튼으로 따라가기 복귀 |
| 완료·이전 기록 | 전체 경로를 화면 안에 맞춤. 지도와 러닝 요약을 먼저 보여주고 메모·진단은 접어서 유지 |

일시정지·중단·실제 GPS 누락 구간을 직선으로 연결하지 않는다. 현재 위치가 오래되면 최신 위치처럼 움직이지 않고 수신 지연을 표시한다. 기록 종료 후 현재 위치를 새로 수집하지 않는다. 완료 기록의 좌표가 없으면 작은 안내를 보여준다.

첫 지도에는 길 찾기·코스 추천·위성 전환·오프라인 지도 다운로드·워치 지도를 넣지 않는 안을 추천한다. 준비·측정·완료의 실제 경로 확인을 먼저 내부 운동에서 검증한다.

## 3. 구현과 검증

iOS 지도는 Apple Maps를 쓰는 안을 추천한다. Expo 57은 `react-native-maps`를 안내하며 iOS에서 Apple Maps를 지원한다. 현재 프로젝트에는 지도 패키지가 없고, 지도 모듈 추가 후 아이폰 개발 앱을 새로 빌드해야 한다. SDK 57에서 `expo-maps`는 Alpha로 안내되어 첫 검증의 기본 선택으로 삼지 않는다. [Expo 57 지도 라이브러리](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), [Expo Maps](https://docs.expo.dev/versions/v57.0.0/sdk/maps/).

현재 측정 상태 API는 요약만 반환하고 좌표는 기록 상세에서 반환한다. 실시간 지도에는 준비 위치·채택 좌표·구간 식별자를 읽는 표시용 경로가 추가로 필요하다. 지도 자체의 위치 수집을 켜서 기존 엔진과 중복 수집하지 않는다. 표시를 위해 매초 전체 로그를 다시 읽거나 화면이 잠긴 상태에서 지도를 계속 갱신하지 않는다. 긴 경로의 표시량을 줄여도 원본 좌표·계산은 바꾸지 않는다.

지도 배경은 Apple 지도 서비스의 네트워크 요청을 사용한다. 내부 기록을 Runary 서버에 올리지 않는 보관 규칙과 지도 제공자의 요청은 구분해 개인정보 안내를 보완한다. 지도 배경 로딩이 실패해도 기존 GPS 측정·저장·종료는 계속 사용할 수 있게 한다.

검증 대상은 준비 위치·이동 반영·지도 탐색 후 따라가기 복귀·누락 구간 미연결·완료 전체 경로, 긴 기록의 표시 성능, 잠금 후 복귀, 지도 추가 전후의 배터리 경향이다. 화면만 확인해 GPS 정확도나 배터리 검증을 통과 처리하지 않는다. 지도 범위 확인 후 PRD·FRD·구현 노트·내부 QA 계획을 같은 작업에서 보완한다.
