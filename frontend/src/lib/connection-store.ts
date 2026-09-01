import AsyncStorage from '@react-native-async-storage/async-storage';

// connect.tsx(시안 S0)를 "처음 한 번"만 보여주기 위한 로컬 플래그.
// FRD엔 없는 화면이라(§[확인 필요] connect.tsx 참고) 별도 문서 없이 여기 적어둔다.
const KEY = 'mechuri.hasConnectedOnce';

export async function hasConnectedOnce(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}

export async function markConnectedOnce(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}
