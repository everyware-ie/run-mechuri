import { dragTargetFor, selectedTarget, tapActionFor } from './edit-gesture';

describe('selectedTarget', () => {
  it('is the target of the open sheet', () => {
    expect(selectedTarget('stamp')).toBe('stamp');
    expect(selectedTarget('caption')).toBe('caption');
    expect(selectedTarget('route')).toBe('route');
  });

  it('is nothing for the background sheet or when closed', () => {
    expect(selectedTarget('background')).toBeNull();
    expect(selectedTarget(null)).toBeNull();
  });
});

describe('dragTargetFor', () => {
  it('moves the text the finger lands on, whatever is selected', () => {
    for (const selected of [null, 'route', 'stamp', 'caption'] as const) {
      expect(dragTargetFor('stamp', selected)).toBe('stamp');
      expect(dragTargetFor('caption', selected)).toBe('caption');
    }
  });

  it('moves the selected running data when dragging near it, not the route', () => {
    expect(dragTargetFor(null, 'stamp')).toBe('stamp');
  });

  it('moves the selected caption when dragging off the text', () => {
    expect(dragTargetFor(null, 'caption')).toBe('caption');
  });

  it('moves the route when nothing is selected or the route is selected', () => {
    expect(dragTargetFor(null, null)).toBe('route');
    expect(dragTargetFor(null, 'route')).toBe('route');
  });
});

describe('tapActionFor', () => {
  it('opens the sheet of the tapped text', () => {
    expect(tapActionFor('stamp', true, false)).toEqual({ kind: 'open', target: 'stamp' });
    expect(tapActionFor('caption', false, true)).toEqual({ kind: 'open', target: 'caption' });
  });

  it('opens the route sheet when tapping the route area', () => {
    expect(tapActionFor(null, true, false)).toEqual({ kind: 'open', target: 'route' });
    expect(tapActionFor(null, true, true)).toEqual({ kind: 'open', target: 'route' });
  });

  it('closes the open sheet when tapping empty space', () => {
    expect(tapActionFor(null, false, true)).toEqual({ kind: 'close' });
  });

  it('does nothing when tapping empty space with nothing open', () => {
    expect(tapActionFor(null, false, false)).toEqual({ kind: 'none' });
  });
});
