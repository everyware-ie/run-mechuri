import * as SecureStore from 'expo-secure-store';

import type { NicknameError } from '@/lib/nickname';

// 로그인 FRD §3 가입과 로그인. 이름·이메일은 요청하지 않고 식별자만 쓴다(§3-3).
// Apple·카카오 모듈은 로그인할 때만 불러온다. 홈·측정 화면도 이 파일을 쓰는데, 이 모듈이 없는 앱(예: 이전 버전 바이너리)에서 함께 로드되면 앱이 시작하자마자 꺼진다.

export type Provider = 'apple' | 'kakao';
export type ProviderCredential = { provider: Provider; userId: string; token: string };
export type Me = { nickname: string | null; provider: 'APPLE' | 'KAKAO' };
type MeWithToken = Me & { token: string };

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
const TOKEN_KEY = 'account.token';

/** 서버 주소가 들어간 빌드에서만 계정 입구를 보인다. 서버 배포 전까지 스토어 빌드에는 나오지 않는다. */
export const accountEnabled = !!API_URL;

let kakaoReady: Promise<void> | null = null;

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;

/** 사용자가 취소하면 null. 그 외 실패는 throw. */
export async function signInWithApple(): Promise<ProviderCredential | null> {
  const AppleAuthentication = await import('expo-apple-authentication');
  try {
    const c = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!c.identityToken) throw new Error('Apple identityToken이 없습니다');
    return { provider: 'apple', userId: c.user, token: c.identityToken };
  } catch (e) {
    if (errorCode(e) === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}

/** 사용자가 취소하면 null. 그 외 실패는 throw. */
export async function signInWithKakao(): Promise<ProviderCredential | null> {
  if (!KAKAO_KEY) throw new Error('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY가 없습니다');
  const [{ initializeKakaoSDK }, { login: kakaoLogin, me: kakaoMe }] = await Promise.all([
    import('@react-native-kakao/core'), import('@react-native-kakao/user'),
  ]);
  kakaoReady ??= initializeKakaoSDK(KAKAO_KEY).catch((e) => { kakaoReady = null; throw e; });
  await kakaoReady;
  try {
    const token = await kakaoLogin();
    const user = await kakaoMe();
    return { provider: 'kakao', userId: String(user.id), token: token.accessToken };
  } catch (e) {
    // Cancelled: 카카오계정 화면 취소, AccessDenied: 카카오톡 동의 화면 취소
    const code = errorCode(e);
    if (code === 'Cancelled' || code === 'AccessDenied') return null;
    throw e;
  }
}

function request(path: string, init: RequestInit & { token?: string } = {}) {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL이 없습니다');
  const { token, ...rest } = init;
  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** 서버 로그인. nickname이 null이면 가입 미완료다. */
export async function loginToServer(c: ProviderCredential): Promise<{ token: string; nickname: string | null }> {
  const res = await request(c.provider === 'apple' ? '/auth/apple' : '/auth/kakao', {
    method: 'POST',
    body: JSON.stringify(c.provider === 'apple' ? { identityToken: c.token } : { accessToken: c.token }),
  });
  if (!res.ok) throw new Error(`서버 로그인 실패 ${res.status}`);
  return res.json();
}

/**
 * 토큰이 더는 유효하지 않으면 null. 네트워크 실패는 throw.
 * 서버가 새 토큰을 주므로 저장해 둔다. 30일 안에 한 번만 열어도 로그인이 이어진다(로그인 FRD §2).
 */
export async function fetchMe(token: string): Promise<Me | null> {
  const res = await request('/me', { token });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`내 계정 조회 실패 ${res.status}`);
  const { token: renewed, ...me }: MeWithToken = await res.json();
  await saveToken(renewed);
  return me;
}

/** 기록 한 건을 올린다. 같은 기록을 다시 보내도 서버에 한 건만 남는다(§5-4). */
export async function uploadRecord(token: string, recordId: string, body: unknown): Promise<void> {
  const res = await request(`/me/records/${encodeURIComponent(recordId)}`, { method: 'PUT', token, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`기록 업로드 실패 ${res.status}`);
}

/** 규칙 위반·중복이면 error. 네트워크 실패는 throw. */
export async function saveNickname(token: string, nickname: string): Promise<{ me: Me } | { error: NicknameError }> {
  const res = await request('/me/nickname', { method: 'PUT', token, body: JSON.stringify({ nickname: nickname.trim() }) });
  if (res.status === 400 || res.status === 409) return { error: (await res.json()).code };
  if (!res.ok) throw new Error(`닉네임 저장 실패 ${res.status}`);
  return { me: await res.json() };
}

// 가입을 마친 계정의 토큰만 기기에 저장한다.
// 닉네임을 정하기 전에 나가거나 앱을 닫으면 로그인하지 않은 상태로 남고, 다음 로그인 때 닉네임 입력부터 다시 한다(§3-2 흐름).
let pendingToken: string | null = null;
export const getPendingToken = () => pendingToken;
export const setPendingToken = (token: string | null) => { pendingToken = token; };

export const getSavedToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const saveToken = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearSavedToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

// 로그인 관문(로그인 FRD §2). 앱을 연 뒤 한 번만 서버에 확인한다.
// 로그인하지 못했을 때 "나중에 하기"를 누르면 이번 실행은 묻지 않고, 다음에 앱을 열 때 다시 묻는다.
let sessionCheck: Promise<boolean> | null = null;
let skippedThisLaunch = false;
let loggedIn = false;

/** 측정 화면 문구처럼 화면이 바로 알아야 하는 로그인 상태. 서버 확인이나 로그인이 끝나면 정해진다. */
export const isLoggedIn = () => loggedIn;

export const skipLoginThisLaunch = () => { skippedThisLaunch = true; };

/** 로그인이나 가입을 마쳤다. 토큰을 저장하고 관문을 통과시킨다. */
export async function completeLogin(token: string) {
  await saveToken(token);
  setPendingToken(null);
  loggedIn = true;
  sessionCheck = Promise.resolve(true);
}

/**
 * 로그인 화면으로 보내야 하면 false.
 * 네트워크가 없어 확인하지 못하면 저장된 토큰을 믿고 통과시킨다. 밖에서 측정을 못 하게 되면 안 된다.
 */
export function checkSession(): Promise<boolean> {
  if (!accountEnabled || skippedThisLaunch) return Promise.resolve(true);
  sessionCheck ??= (async () => {
    const token = await getSavedToken();
    if (!token) return false;
    try {
      const me = await fetchMe(token);
      if (!me?.nickname) { await clearSavedToken(); return false; }
    } catch (e) {
      console.warn('[account] session check offline', e);
    }
    loggedIn = true;
    return true;
  })().catch((e) => { sessionCheck = null; throw e; });
  return sessionCheck;
}

/** 서버가 로그인을 거절했다(토큰 만료 등). 다음 확인 때 로그인 화면으로 보낸다. */
export async function forgetSession() {
  await clearSavedToken();
  loggedIn = false;
  sessionCheck = null;
}
