import { readAppPermissions } from './tracking-permissions';
import type { TrackingState } from '../../modules/run-tracking/src/RunTracking';
const state = { locationPermission: 4, preciseLocation: true, motionSupported: true, motionPermission: 3 } as TrackingState;
test('a camera lookup failure preserves GPS, motion, photos and system-picker guidance', async () => {
  const result = await readAppPermissions([Promise.resolve(state), Promise.reject(new Error('camera')), Promise.resolve({ status: 'granted' })]);
  expect(result.failed).toBe(true);
  expect(result.items.map(item => item.status)).toEqual(['정확한 위치 허용', '허용됨', '건강 앱에서 권한 확인', '확인 실패', '허용됨', '시스템 사진 선택 사용']);
});
test('tracking failure does not label GPS denied or conceal camera permissions', async () => {
  const result = await readAppPermissions([Promise.reject(new Error('bridge')), Promise.resolve({ status: 'denied' }), Promise.resolve({ status: 'undetermined' })]);
  expect(result.items.map(item => item.status)).toEqual(['확인 실패', '확인 실패', '건강 앱에서 권한 확인', 'OS 설정 확인', '아직 요청하지 않음', '시스템 사진 선택 사용']);
});
test('re-querying after recovery clears failure without requesting broader access', async () => {
  const result = await readAppPermissions([Promise.resolve({ ...state, preciseLocation: false, motionSupported: false }), Promise.resolve({ status: 'undetermined' }), Promise.resolve({ status: 'granted' })]);
  expect(result.failed).toBe(false);
  expect(result.items[0].status).toBe('대략적인 위치');
  expect(result.items[1].status).toBe('기기 미지원');
});
