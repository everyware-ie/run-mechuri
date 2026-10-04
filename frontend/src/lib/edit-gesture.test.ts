import { dragTargetFor, dropZoneFor, selectedTarget, tapActionFor } from './edit-gesture';

const caption = (id: string) => ({ kind: 'caption' as const, id });
const stamp = { kind: 'stamp' as const };

describe('selectedTarget', () => {
  it('is the target of the open sheet', () => {
    expect(selectedTarget('stamp')).toBe('stamp');
    expect(selectedTarget('route')).toBe('route');
  });

  it('is nothing for the background sheet or when closed', () => {
    expect(selectedTarget('background')).toBeNull();
    expect(selectedTarget(null)).toBeNull();
  });
});

describe('dragTargetFor', () => {
  it('moves the text the finger lands on, whatever is selected', () => {
    for (const selected of [null, 'route', 'stamp'] as const) {
      for (const onRoute of [true, false]) {
        expect(dragTargetFor(stamp, selected, onRoute)).toEqual(stamp);
        expect(dragTargetFor(caption('a'), selected, onRoute)).toEqual(caption('a'));
      }
    }
  });

  it('moves the selected running data when dragging near it, not the route', () => {
    expect(dragTargetFor(null, 'stamp', true)).toEqual({ kind: 'stamp' });
    expect(dragTargetFor(null, 'stamp', false)).toEqual({ kind: 'stamp' });
  });

  it('moves the selected route from anywhere so a small route is easy to pinch', () => {
    expect(dragTargetFor(null, 'route', false)).toEqual({ kind: 'route' });
  });

  it('moves the route only inside its area when nothing is selected', () => {
    expect(dragTargetFor(null, null, true)).toEqual({ kind: 'route' });
    expect(dragTargetFor(null, null, false)).toBeNull();
  });
});

describe('tapActionFor', () => {
  it('edits the tapped caption in place', () => {
    expect(tapActionFor(caption('b'), true, true)).toEqual({ kind: 'editCaption', id: 'b' });
  });

  it('opens the running data sheet when tapping it', () => {
    expect(tapActionFor(stamp, true, false)).toEqual({ kind: 'open', tool: 'stamp' });
  });

  it('opens the route sheet when tapping the route area', () => {
    expect(tapActionFor(null, true, false)).toEqual({ kind: 'open', tool: 'route' });
    expect(tapActionFor(null, true, true)).toEqual({ kind: 'open', tool: 'route' });
  });

  it('closes the open sheet when tapping empty space', () => {
    expect(tapActionFor(null, false, true)).toEqual({ kind: 'close' });
  });

  it('does nothing when tapping empty space with nothing open', () => {
    expect(tapActionFor(null, false, false)).toEqual({ kind: 'none' });
  });
});

describe('dropZoneFor', () => {
  it('hides running data, deletes captions, and has no zone for the route', () => {
    expect(dropZoneFor(stamp)).toBe('hide');
    expect(dropZoneFor(caption('a'))).toBe('delete');
    expect(dropZoneFor({ kind: 'route' })).toBeNull();
  });
});

it('손그림 획은 직접 선택·이동하고 주변 빈 곳에서 선택을 유지해 움직인다', () => {
  const ink = { kind: 'ink' as const, id: 'ink-a' };
  expect(dragTargetFor(ink, 'route', true)).toEqual(ink);
  expect(dragTargetFor(null, ink, false)).toEqual(ink);
  expect(dragTargetFor(stamp, ink, true)).toEqual(stamp);
  expect(dragTargetFor(caption('a'), ink, true)).toEqual(caption('a'));
  expect(tapActionFor(ink, true, true)).toEqual({ kind: 'editInk', id: 'ink-a' });
  expect(dropZoneFor(ink)).toBe('delete');
});
