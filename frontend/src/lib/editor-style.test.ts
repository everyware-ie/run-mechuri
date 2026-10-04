import { normalizeRouteStyle, resolveRouteStyle, resolveStampColor, resolveStampFont } from './editor-style';

it('옛 저장분과 기본값을 다시 고른 설정이 같은 스타일이다', () => {
  expect(resolveRouteStyle()).toEqual({ color: '#FFF3EC', widthScale: 1 });
  expect(normalizeRouteStyle({ color: 'warm', widthScale: 1 })).toEqual(normalizeRouteStyle());
  expect(resolveStampColor()).toBe('#FFF3EC');
  expect(resolveStampFont(undefined, 'SpaceGrotesk_700Bold')).toBe('SpaceGrotesk_700Bold');
  expect(resolveStampFont('preset', 'NotoSansKR_500Medium')).toBe('NotoSansKR_500Medium');
});

it('저장된 잘못된 두께와 색은 안전한 범위로 읽는다', () => {
  expect(resolveRouteStyle({ widthScale: NaN })).toEqual(resolveRouteStyle());
  expect(resolveRouteStyle({ widthScale: Infinity })).toEqual(resolveRouteStyle());
  expect(resolveRouteStyle({ widthScale: -4 }).widthScale).toBe(.5);
  expect(resolveRouteStyle({ widthScale: 30 }).widthScale).toBe(2);
  expect(resolveRouteStyle({ color: 'invalid' as never }).color).toBe('#FFF3EC');
});

it('선택한 폰트는 기존 라벨·값 굵기를 유지하고 색을 독립적으로 고른다', () => {
  expect(resolveStampFont('pretendard', 'JetBrainsMono_500Medium')).toBe('Pretendard_500Medium');
  expect(resolveStampFont('noto', 'SpaceGrotesk_700Bold')).toBe('NotoSansKR_700Bold');
  expect(resolveStampColor('black')).toBe('#111111');
  expect(resolveStampColor('white')).toBe('#FFFFFF');
});
