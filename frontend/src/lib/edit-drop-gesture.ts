// result-editing FRD §4-2 제스처, §7-2 끌어서 숨기기와 지우기.
// 두 손가락을 쓴 조작에서는 한 손가락을 먼저 떼도 숨기거나 지우지 않는다.
// 위치·크기는 그대로 저장하고, 모든 손가락을 뗀 뒤 새 끌기부터 숨기기를 허용한다.
export class EditDropGesture {
  overZone = false;
  private usedMultipleTouches = false;

  start(touchCount: number) {
    this.overZone = false;
    this.usedMultipleTouches = touchCount > 1;
  }

  move(touchCount: number, overZone: boolean): boolean {
    this.usedMultipleTouches ||= touchCount > 1;
    this.overZone = !this.usedMultipleTouches && touchCount === 1 && overZone;
    return this.overZone;
  }

  finish(cancelled = false): boolean {
    const drop = !cancelled && !this.usedMultipleTouches && this.overZone;
    this.overZone = false;
    this.usedMultipleTouches = false;
    return drop;
  }
}
