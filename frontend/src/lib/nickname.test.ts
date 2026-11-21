import { lowercaseNickname, nicknameError } from './nickname';

describe('닉네임 규칙 (로그인 FRD §4)', () => {
  it('2~10자의 한글·영문 소문자·숫자는 통과한다', () => {
    expect(nicknameError('새벽러너')).toBeNull();
    expect(nicknameError('runner1')).toBeNull();
    expect(nicknameError('가나다라마바사아자차')).toBeNull();
  });

  it('앞뒤 공백은 지운 뒤 센다', () => {
    expect(nicknameError('  러너 ')).toBeNull();
    expect(nicknameError(' 새 ')).toBe('INVALID_LENGTH');
  });

  it('길이가 맞지 않으면 INVALID_LENGTH', () => {
    expect(nicknameError('새')).toBe('INVALID_LENGTH');
    expect(nicknameError('가나다라마바사아자차카')).toBe('INVALID_LENGTH');
  });

  it('공백·특수문자·대문자는 INVALID_CHARS', () => {
    expect(nicknameError('새벽 러너')).toBe('INVALID_CHARS');
    expect(nicknameError('러너!')).toBe('INVALID_CHARS');
    expect(nicknameError('Runner')).toBe('INVALID_CHARS');
  });

  it('입력은 소문자로 바뀐다', () => {
    expect(lowercaseNickname('NightRun')).toBe('nightrun');
    expect(nicknameError(lowercaseNickname('NightRun'))).toBeNull();
  });
});
