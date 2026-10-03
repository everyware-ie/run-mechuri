import { INITIAL_PHOTO_CROP } from './photo-crop';
import { freezesAtEnd, videoCrop } from './video-rules';

describe('freezesAtEnd (배경 선택 FRD §5-2)', () => {
  it('3초 미만이면 마지막 장면에서 멈춘다', () => {
    expect(freezesAtEnd(1)).toBe(true);
    expect(freezesAtEnd(2.99)).toBe(true);
  });
  it('3초 이상이면 반복한다', () => {
    expect(freezesAtEnd(3)).toBe(false);
    expect(freezesAtEnd(30)).toBe(false);
  });
  it('길이를 모르면 반복한다', () => {
    expect(freezesAtEnd(undefined)).toBe(false);
    expect(freezesAtEnd(0)).toBe(false);
  });
});

describe('videoCrop', () => {
  it('세로 1080×1920 영상은 처음 구도에서 전체를 쓴다', () => {
    expect(videoCrop({ width: 1080, height: 1920, crop: INITIAL_PHOTO_CROP }))
      .toEqual({ originX: 0, originY: 0, width: 1080, height: 1920 });
  });
  it('가로 1920×1080 영상은 처음 구도에서 가운데 9:16을 쓴다', () => {
    const rect = videoCrop({ width: 1920, height: 1080, crop: INITIAL_PHOTO_CROP });
    expect(rect.height).toBe(1080);
    expect(rect.width).toBe(608);
    expect(rect.originX).toBe(Math.round(960 - 304));
    expect(rect.originY).toBe(0);
  });
  it('확대하면 영역이 줄고 영상 밖으로 나가지 않는다', () => {
    const rect = videoCrop({ width: 1080, height: 1920, crop: { zoom: 2, centerX: 0.95, centerY: 0.05 } });
    expect(rect.width).toBe(540);
    expect(rect.height).toBe(960);
    expect(rect.originX + rect.width).toBeLessThanOrEqual(1080);
    expect(rect.originY).toBeGreaterThanOrEqual(0);
  });
});
