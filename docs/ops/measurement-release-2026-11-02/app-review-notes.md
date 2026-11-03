---
title: 측정 버전 App Review 메모
product: running
type: ops
status: draft
updated: 2026-11-03
---

# 다음 제출용 심사 메모

2026-11-03 사용자 요청으로 [한국어 제출용 메모](../app-store-review-notes.md)를 현재 정본으로 작성했다. 아래는 영문 참고안이며 실제 입력 시 한국어 정본과 47번의 동작을 기준으로 한다.

측정 기능을 담은 1.0.1(47) 제출용 메모입니다. 공개 개인정보 처리방침과 사용자 안내는 2026.11.03 개정본에 맞췄습니다.\
기존 1.0.0(39)의 메모나 선택 빌드는 변경하지 않았으며 아래 내용은 새 버전의 정식 제출 화면에 입력할 준비 자료입니다.

## App Store Connect에 입력할 내용

Runary records outdoor runs and turns running routes into short animated videos. No account or login is required. An Apple Watch is optional.

Review video creation without a personal workout:

1. On first launch, tap “샘플 기록으로 만들어 보기” (Try a sample record). Alternatively, tap “영상 만들기” (Create video) in the “보관함” (Library) tab and select the heart sample.
2. Choose a built-in background and edit the route and running data.
3. Tap “완료” (Done) to generate the video.
4. Save it to Photos using the save button. Photo-add permission is required only when saving. Instagram sharing is optional and requires Instagram to be installed.

The heart sample is synthetic, clearly labeled and available to all users. It does not read or write HealthKit records or simulate live sensor readings. It is not a recommended real-world route. Declining HealthKit access does not prevent sample use.

Review recording while stationary:

1. Tap the “러닝” (Run) tab to open the recording preparation screen, then tap the start button. The tab opens the current run if one is already in progress.
2. Allow location access when prompted. Elapsed time starts immediately; distance and route points are added only when valid GPS samples arrive. While indoors or stationary, distance may remain zero and pace may be unavailable.
3. Use the pause and play icons to pause and resume the same run.
4. Tap the square stop icon, then confirm “종료” (Finish). The run is saved locally. A run without sufficient route coordinates cannot be used to create a route video; use the heart sample to review that flow.

When supported and allowed by iOS, a Live Activity shows running status and pause/resume controls. Finishing from the Live Activity opens the same run in the app for confirmation. The app does not override the user's Live Activity permission choice.

Optional Apple Watch integration:

On the recording preparation screen, tap Apple Watch and enable “워치 운동 연동” (Watch workout integration). The Watch app requests the workout and heart-rate permissions it needs. It joins the same iPhone run to provide heart rate, status and controls. The user carries the iPhone; this is not a standalone Watch GPS recorder. Enabling the Runary Watch workout may end another Watch workout. A real, permitted Watch session is needed for continuous heart-rate availability; the app does not fabricate readings.

Optional Apple Health export:

Enable “건강 앱 자동 저장” (Automatically save to Health) and grant the requested write access. Completed Runary runs started after enabling the setting are exported as running workouts with recorded distance, duration and available route data. Existing heart-rate samples may be associated with that workout; no duplicate heart-rate samples are created. HealthKit requires heart-rate write authorization for this association. The iPhone is the sole final workout writer; the Watch does not save a second completed workout. Samples and imported workouts are not re-exported. Local saving and video creation remain available if Health export is declined or fails.

Location is used in the background during an active run. Health, fitness and route data are not uploaded to a developer-operated backend or used for advertising. Apple map and place-name services, Expo updates, Notion documentation and user-selected Instagram sharing are described in the privacy policy.

Privacy policy: https://runary.notion.site/privacy
Support: https://runary.notion.site/runary

## 팀 적용 메모

위 영문은 측정 버전용입니다. 공개 방침의 개정 내용과 적용 버전을 확정한 뒤 사용합니다. 연락처와 스크린샷은 실제 응대 담당자와 제출 빌드에 맞춰 확인합니다.
