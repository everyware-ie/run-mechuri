import { EditDropGesture } from './edit-drop-gesture';

describe('숨기기·지우기 제스처', () => {
  it('한 손가락으로 영역에 들어가 놓으면 적용한다', () => {
    const gesture = new EditDropGesture();
    gesture.start(1);
    expect(gesture.move(1, true)).toBe(true);
    expect(gesture.finish()).toBe(true);
    expect(gesture.overZone).toBe(false);
  });

  it('영역 밖으로 돌아와 놓으면 적용하지 않는다', () => {
    const gesture = new EditDropGesture();
    gesture.start(1);
    gesture.move(1, true);
    expect(gesture.move(1, false)).toBe(false);
    expect(gesture.finish()).toBe(false);
  });

  it.each([1, 2, 3])('처음 %i개 손가락으로 시작하고 핀치 후 한 손가락을 먼저 떼도 지우지 않는다', (count) => {
    const gesture = new EditDropGesture();
    gesture.start(count);
    gesture.move(2, true);
    expect(gesture.move(1, true)).toBe(false);
    expect(gesture.finish()).toBe(false);
  });

  it('한 손가락을 먼저 뗀 뒤 첫 move 이벤트부터 들어와도 핀치였음을 기억한다', () => {
    const gesture = new EditDropGesture();
    gesture.start(2);
    expect(gesture.move(1, true)).toBe(false);
    expect(gesture.finish()).toBe(false);
  });

  it('숨기기 영역에서 두 손가락 조작으로 바꾸면 강조와 적용이 해제된다', () => {
    const gesture = new EditDropGesture();
    gesture.start(1);
    gesture.move(1, true);
    expect(gesture.move(2, true)).toBe(false);
    expect(gesture.finish()).toBe(false);
  });

  it('시스템이 중단한 조작은 강조 상태여도 숨기거나 지우지 않는다', () => {
    const gesture = new EditDropGesture();
    gesture.start(1);
    gesture.move(1, true);
    expect(gesture.finish(true)).toBe(false);
    expect(gesture.overZone).toBe(false);
  });

  it('핀치가 끝난 뒤 새 한 손가락 끌기에서는 다시 적용한다', () => {
    const gesture = new EditDropGesture();
    gesture.start(2);
    gesture.move(2, true);
    gesture.finish();
    gesture.start(1);
    expect(gesture.move(1, true)).toBe(true);
    expect(gesture.finish()).toBe(true);
  });
});
