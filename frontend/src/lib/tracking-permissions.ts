import type { TrackingState } from '../../modules/run-tracking/src/RunTracking';

type Permission = { status: string };
export type PermissionItem = { title: string; status: string; reason: string };

// HealthKit reports write authorization as 0 not requested, 1 denied, 2 allowed.
// A native build without the field must not be shown as denied.
export function writePermissionText(state: TrackingState | null, value: number | undefined) {
  if (!state) return '확인 실패';
  return value === 2 ? '허용됨' : value === 1 ? '허용 안 됨' : value === 0 ? '아직 요청하지 않음' : '새 빌드 필요';
}
export function toggleText(enabled: boolean | undefined) {
  return enabled === undefined ? '확인 중' : enabled ? '켜짐' : '꺼짐';
}

// A failed provider must not hide permissions supplied by the other providers.
export async function readAppPermissions(queries: [Promise<TrackingState>, Promise<Permission>, Promise<Permission>]) {
  const [tracking, camera, photos] = await Promise.allSettled(queries);
  const state = tracking.status === 'fulfilled' ? tracking.value : null;
  const permission = (result: PromiseSettledResult<Permission>) => result.status === 'rejected' ? '확인 실패'
    : result.value.status === 'granted' ? '허용됨' : result.value.status === 'undetermined' ? '아직 요청하지 않음' : 'OS 설정 확인';
  const location = !state ? '확인 실패' : state.locationPermission === 3 || state.locationPermission === 4
    ? state.preciseLocation ? '정확한 위치 허용' : '대략적인 위치'
    : state.locationPermission === 0 ? '아직 요청하지 않음' : 'OS 설정 확인';
  const motion = !state ? '확인 실패' : !state.motionSupported ? '기기 미지원'
    : state.motionPermission === 3 ? '허용됨' : state.motionPermission === 0 ? '아직 요청하지 않음' : 'OS 설정 확인';
  const items: PermissionItem[] = [
    { title: '위치', status: location, reason: '러닝 위치·시각을 저장해 경로와 거리를 측정합니다.' },
    { title: '동작 및 피트니스', status: motion, reason: '걸음 수·케이던스에 사용합니다. 없어도 GPS 러닝은 가능합니다.' },
    { title: '건강 기록·워치 심박', status: '건강 앱에서 권한 확인', reason: '읽기 허용 여부를 앱이 확정할 수 없습니다. 아이폰 건강 앱과 워치 Runary에서 심박 읽기 권한을 확인해 주세요. 워치에 저장된 심박을 아이폰에 전달하려면 워치에서도 읽기 권한이 필요합니다.' },
    { title: '건강 앱 운동 저장', status: writePermissionText(state, state?.healthWorkoutWrite), reason: '완료한 러닝을 건강 앱의 운동으로 저장할 때 필요합니다. 허용되지 않으면 저장되지 않습니다. 건강 앱의 앱별 데이터 접근에서 Runary의 운동 쓰기를 허용해 주세요.' },
    { title: '건강 앱 경로 저장', status: writePermissionText(state, state?.healthRouteWrite), reason: '러닝 경로를 건강 앱 운동에 붙일 때 필요합니다. 허용되지 않으면 운동은 저장되고 경로만 빠집니다.' },
    { title: '건강 앱 심박 저장', status: writePermissionText(state, state?.healthHeartWrite), reason: '건강 앱에 있는 심박을 Runary 운동에 연결할 때 필요합니다. 허용되지 않으면 운동은 저장되고 심박 연결만 빠집니다.' },
    { title: '건강 앱 자동 저장', status: !state ? '확인 실패' : state.healthExportEnabled === undefined ? '새 빌드 필요' : toggleText(state.healthExportEnabled), reason: '꺼져 있으면 권한이 있어도 완료한 러닝이 건강 앱에 저장되지 않습니다. 측정 화면의 심박 가져오기에서 켤 수 있습니다.' },
    { title: '카메라', status: permission(camera), reason: '직접 찍은 사진을 배경으로 사용할 때 필요합니다.' },
    { title: '사진 저장', status: permission(photos), reason: '완성한 영상·촬영 소재를 사진 앱에 저장할 때 필요합니다.' },
    { title: '갤러리 가져오기', status: '시스템 사진 선택 사용', reason: '선택한 사진만 가져오는 방식으로 별도 사진 읽기 권한을 요구하지 않습니다.' },
  ];
  return { items, failed: [tracking, camera, photos].some(result => result.status === 'rejected') };
}
