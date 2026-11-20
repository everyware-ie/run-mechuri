import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin, me as kakaoMe } from '@react-native-kakao/user';

import type { NicknameError } from '@/lib/nickname';

// 로그인 FRD §3 가입과 로그인. 이름·이메일은 요청하지 않고 식별자만 쓴다(§3-3).

export type Provider = 'apple' | 'kakao';
export type ProviderCredential = { provider: Provider; userId: string; token: string };
export type Me = { nickname: string | null; provider: 'APPLE' | 'KAKAO' };

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
const TOKEN_KEY = 'account.token';

/** 서버 주소가 들어간 빌드에서만 계정 입구를 보인다. 서버 배포 전까지 스토어 빌드에는 나오지 않는다. */
export const accountEnabled = !!API_URL;

let kakaoReady: Promise<void> | null = null;

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;

/** 사용자가 취소하면 null. 그 외 실패는 throw. */
export async function signInWithApple(): Promise<ProviderCredential | null> {
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

/** 토큰이 더는 유효하지 않으면 null. 네트워크 실패는 throw. */
export async function fetchMe(token: string): Promise<Me | null> {
  const res = await request('/me', { token });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`내 계정 조회 실패 ${res.status}`);
  return res.json();
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
