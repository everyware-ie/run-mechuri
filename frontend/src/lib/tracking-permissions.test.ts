import { readAppPermissions, toggleText, writePermissionText } from './tracking-permissions';
import type { TrackingState } from '../../modules/run-tracking/src/RunTracking';
const state = { locationPermission: 4, preciseLocation: true, motionSupported: true, motionPermission: 3,
  healthWorkoutWrite: 2, healthRouteWrite: 2, healthHeartWrite: 2, healthExportEnabled: true } as TrackingState;
const titles = (result: Awaited<ReturnType<typeof readAppPermissions>>) => result.items.map(item => item.title);
const statusOf = (result: Awaited<ReturnType<typeof readAppPermissions>>, title: string) => result.items.find(item => item.title === title)?.status;
test('a camera lookup failure preserves GPS, motion, photos and system-picker guidance', async () => {
  const result = await readAppPermissions([Promise.resolve(state), Promise.reject(new Error('camera')), Promise.resolve({ status: 'granted' })]);
  expect(result.failed).toBe(true);
  expect(result.items.map(item => item.status)).toEqual(['정확한 위치 허용', '허용됨', '건강 앱에서 권한 확인', '허용됨', '허용됨', '허용됨', '켜짐', '확인 실패', '허용됨', '시스템 사진 선택 사용']);
});
test('tracking failure does not label GPS denied or conceal camera permissions', async () => {
  const result = await readAppPermissions([Promise.reject(new Error('bridge')), Promise.resolve({ status: 'denied' }), Promise.resolve({ status: 'undetermined' })]);
  expect(result.items.map(item => item.status)).toEqual(['확인 실패', '확인 실패', '건강 앱에서 권한 확인', '확인 실패', '확인 실패', '확인 실패', '확인 실패', 'OS 설정 확인', '아직 요청하지 않음', '시스템 사진 선택 사용']);
});
test('re-querying after recovery clears failure without requesting broader access', async () => {
  const result = await readAppPermissions([Promise.resolve({ ...state, preciseLocation: false, motionSupported: false }), Promise.resolve({ status: 'undetermined' }), Promise.resolve({ status: 'granted' })]);
  expect(result.failed).toBe(false);
  expect(result.items[0].status).toBe('대략적인 위치');
  expect(result.items[1].status).toBe('기기 미지원');
});
test('health write permissions are listed with their own status, apart from read guidance', async () => {
  const result = await readAppPermissions([Promise.resolve({ ...state, healthWorkoutWrite: 1, healthRouteWrite: 0, healthHeartWrite: 2, healthExportEnabled: false }),
    Promise.resolve({ status: 'granted' }), Promise.resolve({ status: 'granted' })]);
  expect(titles(result)).toEqual(expect.arrayContaining(['건강 앱 운동 저장', '건강 앱 경로 저장', '건강 앱 심박 저장', '건강 앱 자동 저장']));
  expect(statusOf(result, '건강 앱 운동 저장')).toBe('허용 안 됨');
  expect(statusOf(result, '건강 앱 경로 저장')).toBe('아직 요청하지 않음');
  expect(statusOf(result, '건강 앱 심박 저장')).toBe('허용됨');
  expect(statusOf(result, '건강 앱 자동 저장')).toBe('꺼짐');
  expect(statusOf(result, '건강 기록·워치 심박')).toBe('건강 앱에서 권한 확인');
});
test('a native build without the write fields is not reported as denied', async () => {
  const legacy = { locationPermission: 4, preciseLocation: true, motionSupported: true, motionPermission: 3 } as TrackingState;
  const result = await readAppPermissions([Promise.resolve(legacy), Promise.resolve({ status: 'granted' }), Promise.resolve({ status: 'granted' })]);
  expect(statusOf(result, '건강 앱 운동 저장')).toBe('새 빌드 필요');
  expect(statusOf(result, '건강 앱 자동 저장')).toBe('새 빌드 필요');
});
test('write permission text maps every HealthKit value and a failed lookup', () => {
  expect([0, 1, 2, undefined].map(value => writePermissionText(state, value))).toEqual(['아직 요청하지 않음', '허용 안 됨', '허용됨', '새 빌드 필요']);
  expect(writePermissionText(null, 2)).toBe('확인 실패');
});
test('toggle text shows the current state, never the next action', () => {
  expect([true, false, undefined].map(toggleText)).toEqual(['켜짐', '꺼짐', '확인 중']);
});
