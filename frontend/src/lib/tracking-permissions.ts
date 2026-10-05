import type { TrackingState } from '../../modules/run-tracking/src/RunTracking';

type Permission = { status: string };
export type PermissionItem = { title: string; status: string; reason: string };

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
    { title: '건강 기록·워치 심박', status: '건강 앱에서 권한 확인', reason: '읽기 허용 여부를 앱이 확정할 수 없습니다. 건강 앱의 Runary 데이터 접근과 워치의 심박 설정을 확인해 주세요.' },
    { title: '카메라', status: permission(camera), reason: '직접 찍은 사진을 배경으로 사용할 때 필요합니다.' },
    { title: '사진 저장', status: permission(photos), reason: '완성한 영상·촬영 소재를 사진 앱에 저장할 때 필요합니다.' },
    { title: '갤러리 가져오기', status: '시스템 사진 선택 사용', reason: '선택한 사진만 가져오는 방식으로 별도 사진 읽기 권한을 요구하지 않습니다.' },
  ];
  return { items, failed: [tracking, camera, photos].some(result => result.status === 'rejected') };
}
