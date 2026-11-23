import { router } from 'expo-router';

/** 직접 진입한 화면에는 이전 화면이 없을 수 있다. 초안은 유지한 채 홈으로 나간다. */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** 쌓인 화면을 모두 닫고 홈으로. 로그인 관문처럼 홈이 스택에 없으면 홈으로 교체한다. */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}
