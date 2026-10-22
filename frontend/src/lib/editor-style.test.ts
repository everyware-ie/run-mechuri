import { normalizeRouteStyle, resolveRouteStyle, resolveStampColor, resolveStampFont, ROUTE_COLORS, runnerLightColors } from './editor-style';

it('옛 저장분과 기본값을 다시 고른 설정이 같은 스타일이다', () => {
  expect(resolveRouteStyle()).toEqual({ color: '#FFF3EC', widthScale: 1 });
  expect(normalizeRouteStyle({ color: 'warm', widthScale: 1 })).toEqual(normalizeRouteStyle());
  expect(resolveStampColor()).toBe('#FFF3EC');
  expect(resolveStampFont(undefined, 'SpaceGrotesk_700Bold')).toBe('SpaceGrotesk_700Bold');
  expect(resolveStampFont('preset', 'NotoSansKR_500Medium')).toBe('NotoSansKR_500Medium');
});

it('불빛 러너는 모든 선택색에 밝은 중심과 더 진한 같은 계열 빛을 제공한다', () => {
  const rgb = (color: string) => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  for (const choice of ROUTE_COLORS.slice(1)) {
    const body = rgb(choice.hex), light = runnerLightColors(choice.hex);
    const glow = rgb(light.glow), core = rgb(light.core);
    expect(Math.max(...glow) - Math.min(...glow)).toBeGreaterThan(Math.max(...body) - Math.min(...body));
    expect(core.every((v, i) => v >= body[i])).toBe(true);
    expect(core).not.toEqual(glow);
  }
  expect(runnerLightColors('#FFF3EC').colored).toBe(false);
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


it('자유 색은 불투명 6자리 HEX로 정규화하고 기존 팔레트와 호환된다', () => {
  expect(resolveRouteStyle({ color: '#13ac72', widthScale: 1.4 })).toEqual({ color: '#13AC72', widthScale: 1.4 });
  expect(normalizeRouteStyle({ color: '#8ef0ce' })).toEqual(normalizeRouteStyle({ color: 'mint' }));
  expect(normalizeRouteStyle({ color: '#fff3ec' })).toEqual(normalizeRouteStyle());
  for (const color of ['#123', '#12345678', 'red', '#GG0011', '#123456x']) {
    expect(resolveRouteStyle({ color: color as never }).color).toBe('#FFF3EC');
  }
  for (const color of ['#000000', '#FFFFFF', '#808080', '#13AC72']) {
    const light = runnerLightColors(color);
    expect(light.glow).toMatch(/^#[0-9A-F]{6}$/);
    expect(light.core).toMatch(/^#[0-9A-F]{6}$/);
  }
});
