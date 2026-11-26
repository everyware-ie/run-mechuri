// 로그인 FRD §7-2 탈퇴: Apple은 취소하면 멈추고, 카카오 연결 끊기가 실패해도 우리 계정은 지운다
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const mockSignInAsync = jest.fn();
jest.mock('expo-apple-authentication', () => ({ signInAsync: mockSignInAsync }));
jest.mock('@react-native-kakao/core', () => ({ initializeKakaoSDK: jest.fn().mockResolvedValue(undefined) }));
const mockUnlink = jest.fn();
jest.mock('@react-native-kakao/user', () => ({ unlink: mockUnlink, login: jest.fn(), me: jest.fn() }));

process.env.EXPO_PUBLIC_API_URL = 'http://server';
process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY = 'key';
// account.ts는 불러올 때 서버 주소를 읽는다. 위에서 환경변수를 넣은 뒤에 불러와야 해서 require를 쓴다
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withdraw } = require('./account') as typeof import('./account');

const fetchMock = jest.fn();
global.fetch = fetchMock;

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
  mockSignInAsync.mockReset();
  mockUnlink.mockReset();
});

it('Apple은 다시 로그인해 받은 code를 함께 보낸다', async () => {
  mockSignInAsync.mockResolvedValue({ authorizationCode: 'code-1' });
  await expect(withdraw('t', 'APPLE')).resolves.toBe('done');
  expect(fetchMock).toHaveBeenCalledWith('http://server/me', expect.objectContaining({
    method: 'DELETE', body: JSON.stringify({ appleAuthorizationCode: 'code-1' }),
  }));
});

it('Apple 화면에서 취소하면 서버에 탈퇴를 보내지 않는다', async () => {
  mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
  await expect(withdraw('t', 'APPLE')).resolves.toBe('cancelled');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('카카오 연결 끊기가 실패해도 계정은 지운다', async () => {
  mockUnlink.mockRejectedValue(new Error('kakao token expired'));
  await expect(withdraw('t', 'KAKAO')).resolves.toBe('done');
  expect(mockUnlink).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith('http://server/me', expect.objectContaining({ method: 'DELETE' }));
});

it('네트워크가 없으면 실패로 알린다', async () => {
  mockUnlink.mockResolvedValue(undefined);
  fetchMock.mockRejectedValue(new TypeError('Network request failed'));
  await expect(withdraw('t', 'KAKAO')).rejects.toThrow();
});
