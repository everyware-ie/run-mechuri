# 최초 베타 제출 — 개인정보 문서와 지민 인계

작성: 2026-09-09 / phs00 요청, Codex 작성  
상태: 공개 Notion 수정·재조회 검증 완료. 제출 빌드 검증 및 App Store Connect 등록은 미완료.

## 이번 제출의 기준

- 사용자 결정(2026-09-09): 최초 제출 빌드는 **기본 배경만 제공**하고 갤러리 사진 선택·카메라 촬영은 제외한다.
- 2026-09-22 출시 목표의 사진 선택·촬영 계획은 유지한다. 최초 제출 범위와 출시 목표 범위를 구분한 결정이며, 승인된 FRD의 장기 범위를 축소하지 않는다.
- 대조한 원격 main: `335d0de2b8b519d20fb06b6dd3e73289b998e570`. 실제 제출 아카이브의 버전·빌드 번호와 commit SHA는 아직 확인하지 않았다.
- 기존 처리방침 시행일 2026-09-10은 유지했다. 그 전에 외부 베타를 배포하거나 일정이 바뀌면 시행일과 적용 빌드를 함께 조정한다.
- 관련 [9월 8일 회의](https://github.com/everyware-ie/run-mechuri/pull/46), [배경 선택 FRD](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/docs/specs/frd/background-selection.md), [내보내기·공유 FRD](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/docs/specs/frd/export-and-share.md). 문서 작업으로 앱 구현이나 제출 상태가 바뀐 것은 아니다.

## 바로 열어볼 문서

- [공개 안내 허브](https://phs00.notion.site/mechuri-run?source=copy_link)
- [수정한 개인정보 처리방침](https://app.notion.com/p/3d540e8014f981caae27cb1eee320423)
- [수정한 FAQ](https://app.notion.com/p/3d540e8014f981f488f8c83c128657dd)
- [사진 선택·카메라 후속 계획](./photo-camera-rollout.md)
- [처리방침 변경 전](./privacy-before.md) / [변경 후](./privacy-current.md)
- [FAQ 변경 전](./faq-before.md) / [변경 후](./faq-current.md)

스냅샷은 9월 9일 수정 시점의 이력이다. 이후 현재 안내를 고치면 새 변경 이력을 남기고 적용 버전을 기록한다. 내부 인계 문서와 후속 초안은 공개 Notion 허브에 올리지 않았다.

## 이번에 고친 내용과 코드 근거

| 항목 | 반영한 내용 | 근거 |
| --- | --- | --- |
| 이번 빌드의 사진 권한 | 사진 앱에 결과물 추가만 설명. 갤러리 선택·촬영 기능과 카메라 권한 안내 제외 | [share.tsx](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/src/app/share.tsx), 사용자 제출 범위 결정 |
| 건강 데이터 | 워크아웃 식별자·러닝 수치·심박·경로와 좌표 시각을 읽음. HealthKit에 쓰지 않음 | [HealthKit 브리지](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/modules/health-kit-bridge/ios/HealthKitBridgeModule.swift) |
| 로컬 저장 | 결과물과 초안에 러닝 기록·경로·편집 상태 보관 | [results-store](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/src/lib/results-store.ts), [draft-store](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/src/lib/draft-store.ts) |
| 장소 이름 | 편집 중 장소명 부재 시 경로 중간 좌표를 Apple에 조회. 장소 표시 선택 전에도 실행 가능 | [edit.tsx](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/src/app/edit.tsx) |
| Instagram | 동영상과 배경 이미지가 전달됨. 첫 빌드의 이미지는 기본 배경. 영상에는 경로와 각인 정보 포함 가능 | [공유 브리지](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/modules/instagram-story-share/ios/InstagramStoryShareModule.swift) |
| 업데이트 | 자체 사용자 데이터 서버 부재와 Expo 업데이트 통신을 구분. 개인정보가 전혀 오가지 않는다는 단정 삭제 | [app.json](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/app.json), Expo 공식 문서 |
| 보관함 삭제 | 항목을 AsyncStorage에서 제외하지만 mp4 파일의 즉시 삭제는 구현되어 있지 않음 | [results-store](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/src/lib/results-store.ts) |
| 생성 영상 | 임시 경로에 생성되어 OS 정리 가능. 사진 앱 저장 사본은 별도 | [렌더러](https://github.com/everyware-ie/run-mechuri/blob/335d0de2b8b519d20fb06b6dd3e73289b998e570/frontend/modules/route-renderer/ios/RouteRendererModule.swift) |
| 베타·문의 | TestFlight 진단·사용 정보와 직접 문의를 팀이 확인할 수 있는 예외 추가 | Apple TestFlight 개인정보 안내, 기존 문의 주소 |
| FAQ | 전송이 전혀 없다는 설명 교정. 첫 빌드 배경 범위·저장 권한·삭제 한계 안내 추가 | 위 코드·처리방침과 대조 |

## 지민이 이번 제출 전에 확인할 사항

아래는 완료로 간주하지 않는다. 확인 담당자는 제안이며 실제 작업 배정은 팀에서 확정한다.

- [ ] **지민·빌드 담당:** 제출할 버전 / 빌드 번호 / commit SHA / EAS update channel·runtime을 기록한다. 이후 업데이트로 제출 대상 기능이 바뀌지 않는지 확인한다.
- [ ] **지민·빌드 담당:** 설치한 제출 빌드에서 기본 배경만 보이고 갤러리 선택·카메라 진입 및 권한 팝업이 없는지 확인한다. 배포 설명·스크린샷도 같은 범위여야 한다.
- [ ] **개발 담당:** 앱 안에서 개인정보 처리방침을 쉽게 열 수 있도록 링크를 연결한다. 대조한 main의 `frontend/src`에서 `privacy|notion.site|처리방침` 검색 결과는 없었다. 링크가 다른 방식으로 들어갔는지도 실제 빌드에서 확인한다.
- [ ] **지민:** App Store Connect에 제출할 URL은 비로그인 Safari에서 열리는 공개 처리방침 주소를 사용한다. 위 `app.notion.com/p/`는 편집·검토 링크이므로 그대로 심사용 공개 URL로 확정하지 않는다. 허브에서 정책·FAQ·문의로 이동 가능하고 조직 로그인/접근 요청이 없는지 확인한다.
- [ ] **지민:** App Privacy 응답은 실제 제출 바이너리와 SDK의 처리에 맞춰 작성한다. 자체 서버가 없다는 이유만으로 모든 항목을 '수집 안 함'으로 확정하지 않는다. 기기 내 처리와 Apple의 수집 정의, 제3자 SDK, 사용자 선택 공유의 예외를 각각 검토한다.
- [ ] **phs00·운영 담당:** 문의 메일 수신, 열람·삭제 요청 대응 담당, TestFlight 접근 권한을 확인한다. 수정된 정책의 문의·피드백 별도 사본 삭제 원칙을 실제로 운영하고, Apple 측 보관과 팀이 내려받은 사본의 처리를 구분한다.
- [ ] **개발 담당:** HealthKit에서 복사한 경로·심박 등의 iCloud/기기 백업 제외 설정을 확인한다. 현재 코드를 읽은 것만으로 백업 차단 여부를 확정하지 않았다. Apple의 건강정보 관련 제한과 실제 설정을 대조한다.
- [ ] **지민·개발 담당:** 건강 기록이 없는 심사 기기에서 재현할 경로와 심사 설명을 정한다. 실제 데모 모드가 없는 상태에서 데모 모드나 테스트 계정이 있다고 쓰지 않는다.
- [ ] **지민:** 사진 저장 허용/거절, HealthKit 거절/경로 없음, 오프라인 장소 조회 실패, Instagram 설치/미설치, 결과물 삭제 후 상태를 제출 빌드에서 확인한다.
- [ ] **phs00:** 배포 시작일과 정책 시행일, 대상 연령 및 제출 정보의 일치 여부를 확인한다.

Apple은 TestFlight 앱에도 심사 가이드라인 준수를 요구하며, 개인정보 처리방침의 접근성·데이터 항목·목적·제3자 공유·보관/삭제 설명을 요구한다. 문서 수정만으로 승인 가능 여부를 확정하지 않는다. [App Review Guidelines 2.2, 2.3, 5.1.1](https://developer.apple.com/app-store/review/guidelines/)

## 함께 넘길 서비스 소개 초안

> 메추리 런은 iOS 건강 앱의 실외 달리기 기록과 경로를 불러와 러닝 경로 영상을 만드는 앱입니다. 기본 배경 위에서 경로와 각인을 편집하고, 완성한 영상을 사진 앱에 저장하거나 Instagram 스토리로 공유할 수 있습니다. 회원가입과 로그인은 필요하지 않습니다. 이번 베타에는 갤러리 사진 선택과 카메라 촬영이 포함되지 않습니다.

서비스 소개용 초안이다. 제출 화면별 글자 수와 언어에 맞춰 조정하고, 실제 제출 빌드 확인 후 사용한다. 위 내용만으로 심사 재현 절차가 완성되는 것은 아니다.

## 검증 기록과 범위

- Notion 처리방침 및 FAQ를 수정 전 읽고, 대상 구문만 변경했다. 수정 뒤 재조회한 본문이 작성한 본문과 정확히 일치함을 확인했다.
- 공개 안내 허브의 하위 페이지 구성과 공지사항은 변경하지 않았다.
- 코드 근거는 위 SHA에 고정했다. Windows에서 `scripts/check-docs.py` 문서 정합성 검사를 실행해 통과했다. 실제 iOS 빌드 실행·네트워크 캡처·익명 Notion 접근·App Store Connect 입력은 수행하지 않았다.
- 기존 로컬 회의 안건의 미커밋 변경은 이 문서 변경과 별개로 보존했다.

## 공식 참고 자료

- [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/): 업데이트 요청의 플랫폼·런타임 등 프로토콜 정보. 특정 빌드의 모든 전송 헤더를 확정하는 자료는 아니다.
- [Expo Privacy Policy](https://expo.dev/privacy): Expo 서비스의 정보 처리. 모든 항목이 이 앱의 최종 사용자에게 동일하게 적용된다고 가정하지 않는다.
- [TestFlight 및 개인정보 보호](https://www.apple.com/legal/privacy/data/en/test-flight/): Apple을 통한 사용·충돌 정보 및 피드백 제공과 초대 방식별 식별 정보 차이.
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/): App Store의 수집 정의와 응답 기준. 실제 제출 시 확인.
