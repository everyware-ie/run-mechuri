// 1080×1920 결과물 전체를 가용 영역에 맞춘다. 여백은 캔버스 바깥에 둔다.
export function fitPortraitPreview(availableWidth: number, availableHeight: number) {
  const height = Math.max(0, Math.min(availableHeight - 16, (availableWidth - 24) * 16 / 9));
  return { width: height * 9 / 16, height };
}
