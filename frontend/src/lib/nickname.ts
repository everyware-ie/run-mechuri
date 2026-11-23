// 로그인 FRD §4 닉네임. 서버(backend Nickname.java)도 같은 규칙으로 다시 검사한다.

export type NicknameError = 'INVALID_LENGTH' | 'INVALID_CHARS' | 'DUPLICATE';

export const NICKNAME_MAX = 10;

export const NICKNAME_MESSAGES: Record<NicknameError, string> = {
  INVALID_LENGTH: '2~10자로 입력해 주세요',
  INVALID_CHARS: '한글, 영문 소문자, 숫자만 쓸 수 있어요',
  DUPLICATE: '이미 쓰고 있는 닉네임이에요',
};

/** 입력하는 대로 영문을 소문자로 바꾼다. */
export const lowercaseNickname = (text: string) => text.toLowerCase();

export const nicknameLength = (text: string) => [...text.trim()].length;

/** 앞뒤 공백을 지운 값으로 검사한다. 규칙에 맞으면 null. */
export function nicknameError(text: string): Exclude<NicknameError, 'DUPLICATE'> | null {
  const value = text.trim();
  // 한글 조합 중의 자모(ㄱ, ㅏ)는 여기서 막지 않는다. 입력하는 동안 오류가 깜빡이기 때문이다. 자모만 남으면 서버가 거른다
  if (/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/.test(value)) return 'INVALID_CHARS';
  const length = nicknameLength(value);
  if (length < 2 || length > NICKNAME_MAX) return 'INVALID_LENGTH';
  return null;
}
