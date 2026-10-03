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
      expect(dragTargetFor(stamp, selected)).toEqual(stamp);
      expect(dragTargetFor(caption('a'), selected)).toEqual(caption('a'));
    }
  });

  it('moves the selected running data when dragging near it, not the route', () => {
    expect(dragTargetFor(null, 'stamp')).toEqual({ kind: 'stamp' });
  });

  it('moves the route when nothing is selected or the route is selected', () => {
    expect(dragTargetFor(null, null)).toEqual({ kind: 'route' });
    expect(dragTargetFor(null, 'route')).toEqual({ kind: 'route' });
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
