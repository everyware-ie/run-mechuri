import { router } from 'expo-router';

/** 직접 진입한 화면에는 이전 화면이 없을 수 있다. 초안은 유지한 채 홈으로 나간다. */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
