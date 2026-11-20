import * as AppleAuthentication from 'expo-apple-authentication';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin, me as kakaoMe } from '@react-native-kakao/user';

// 로그인 FRD §3 가입과 로그인. 이름·이메일은 요청하지 않고 식별자만 쓴다(§3-3).

export type Provider = 'apple' | 'kakao';
export type ProviderCredential = { provider: Provider; userId: string; token: string };

const KAKAO_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
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
