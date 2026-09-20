/* global __dirname */
// Focused React-boundary/clock contract checks; native FPS still needs a device comparison.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
globalThis.__DEV__ = false;
const jsx = (type, props) => ({ type, props });
let slots = [], cursor = 0, effects = [], focused = true, appListener;
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const React = {
  Fragment: 'Fragment', memo: (fn, compare) => { fn.compare = compare; return fn; },
  useState(initial) {
    const i = cursor++;
    if (!slots[i]) {
      const slot = { value: typeof initial === 'function' ? initial() : initial };
      slot.set = next => { slot.value = typeof next === 'function' ? next(slot.value) : next; };
      slots[i] = slot;
    }
    return [slots[i].value, slots[i].set];
  },
  useMemo(fn, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
    return slots[i].value;
  },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) {
      const old = slots[i];
      slots[i] = { deps };
      effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    }
  },
};
// This is a test slot allocator, not a React hook dependency contract.
const retainSlot = React.useMemo;
let lastFrame, reaction;
const reanimated = {
  useSharedValue: value => retainSlot(() => ({ value, set(next) { this.value = next; } }), []),
  useDerivedValue: fn => retainSlot(() => ({ get value() { return fn(); } }), []),
  useAnimatedReaction: (prepare, react) => { reaction = { prepare, react }; },
  useFrameCallback: (callback, active = true) => {
    lastFrame = retainSlot(() => ({ active, setActive(value) { this.active = value; } }), []);
    lastFrame.callback = callback;
    return lastFrame;
  },
};
const deps = {
  react: React,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'expo-router': { useIsFocused: () => focused },
  'react-native': { Animated: { View: 'AnimatedView' }, View: 'View', AppState: {
    currentState: 'active', addEventListener: (_event, fn) => { appListener = fn; return { remove() { appListener = undefined; } }; },
  } },
  'react-native-reanimated': reanimated,
  'react-native-worklets': { scheduleOnRN: (fn, ...args) => fn(...args) },
  '@shopify/react-native-skia': { Canvas: 'Canvas', Group: 'Group', RoundedRect: 'RoundedRect', DashPathEffect: 'DashPathEffect', Skia: { Path: { Make: () => ({ moveTo() {}, lineTo() {} }) } } },
  'react-native-svg': {},
};
const cache = {};
function load(file, extra = '') {
  const absolute = path.resolve(root, file);
  if (cache[absolute]) return cache[absolute];
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const result = cache[absolute] = {};
  new Function('exports', 'require', output)(result, name => {
    if (name in deps) return deps[name];
    const next = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
    return load(next + (fs.existsSync(next + '.ts') ? '.ts' : '.tsx'));
  });
  return result;
}
const preview = load('src/components/route-preview.tsx', '\nexport {useUIThreadProgress, LightRunnerLayer, StampPreviewLayer, StampPreviewText, StampTextsSvg};');
const props = {
  points: [{ latitude: 37, longitude: 127 }, { latitude: 37.001, longitude: 127.002 }, { latitude: 37.002, longitude: 127 }],
  preset: 'default-drawing', transform: preview.IDENTITY_TRANSFORM, smoothOptions: preview.IDENTITY_SMOOTH,
  run: { distanceMeters: 5000, durationSeconds: 1800, date: '2026-09-13', averagePaceSecPerKm: 360 },
  stampConfig: preview.IDENTITY_STAMP, isInteracting: false, viewWidth: 300, viewHeight: 533,
};
function render(fn) { cursor = 0; effects = []; const result = fn(); effects.forEach(f => f()); return result; }
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
}
function canvas(p = props) {
  return nodes(render(() => preview.RoutePreview(p))).find(n => n.type?.name === 'RouteDrawingCanvas');
}
const first = canvas();
assert(first, 'Canvas must have an independent memo boundary');
for (let i = 1; i <= 12; i++) {
  first.props.onProgressSample(i / 12);
  const next = canvas();
  assert.deepEqual(Object.keys(next.props), Object.keys(first.props));
  for (const key of Object.keys(first.props)) assert(Object.is(first.props[key], next.props[key]), `stamp sample changed Canvas prop: ${key}`);
}
focused = false;
assert.equal(canvas().props.pauseAnimation, true);
focused = true;
assert.equal(canvas().props.pauseAnimation, false);
appListener('background');
assert.equal(canvas().props.pauseAnimation, true);
appListener('active');
assert.equal(canvas().props.pauseAnimation, false);
assert.equal(canvas({ ...props, isInteracting: true }).props.pauseAnimation, true);
assert.notEqual(canvas({ ...props, preset: 'light-runner' }).props.preset, first.props.preset);

// Both animation clocks must stop while paused, preserve elapsed time, and stop on cleanup.
for (const clock of ['default/segment', 'light-runner']) {
  slots = []; let paused = false;
  const draw = () => clock === 'default/segment'
    ? preview.useUIThreadProgress(paused, true, () => {})
    : preview.LightRunnerLayer({ projected: [], cumulative: [], totalDistance: 0, fullPath: {}, rawFullPath: {},
      isInteracting: paused, playing: true, blurScale: .7, onProgressSample: () => {} });
  render(draw);
  assert.equal(lastFrame.active, true);
  lastFrame.callback({ timeSincePreviousFrame: 16 });
  const elapsed = slots[0].value.value;
  assert(elapsed > 0);
  paused = true; render(draw); assert.equal(lastFrame.active, false);
  paused = false; render(draw); assert.equal(lastFrame.active, true);
  assert.equal(slots[0].value.value, elapsed, 'resume must preserve elapsed time');
  for (const slot of slots) slot?.cleanup?.();
  assert.equal(lastFrame.active, false);
}

// A timestamp gap or duplicate coordinates alone do not introduce playback pauses.
const projection = load('src/lib/route-projection.ts');
const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }];
const distance = projection.cumulativeCanvasDistances(points);
for (let i = 0; i <= 100; i++) assert(Math.abs(projection.pointAtDistance(i, points, distance).x - i) < 1e-9);
console.log('PASS: 12 stamp samples leave all memoized Canvas props unchanged; focus/app/gesture pause; both clock lifecycles; distance interpolation across duplicate/sparse points. No native FPS claim.');

// Prevent the per-text native filter passes that caused 100ms+ device stalls.
for (const { id: layout } of preview.STAMP_LAYOUTS) {
  const layer = preview.StampLayerSvg({ run: props.run, config: { ...preview.IDENTITY_STAMP, layout }, progressFraction: .5 });
  const textNode = nodes(layer).find(node => node.type === preview.StampTextsSvg);
  assert.equal(nodes(textNode.type(textNode.props)).filter(node => node.props?.filter).length, 1, `${layout}: static filter must be batched`);
}
console.log('PASS: each stamp preset batches native shadow filtering into one pass.');

// Numeric samples use the same 270-frame drawing timeline as the 30fps video.
slots = [];
const samples = [];
render(() => preview.useUIThreadProgress(false, true, value => samples.push(value)));
let bucket = null;
for (let frame = 0; frame <= 545; frame++) {
  if (frame) lastFrame.callback({ timeSincePreviousFrame: 1000 / 60 });
  const next = reaction.prepare();
  reaction.react(next, bucket); bucket = next;
}
assert.equal(samples[0], 0);
assert.equal(samples.at(-1), 1);
assert.equal(samples.length, 271);
assert(samples.every((value, i) => Math.abs(value - i / 270) < 1e-9));

// Every text keeps its native viewport; dates/labels skip numeric rerenders.
for (const { id: layout } of preview.STAMP_LAYOUTS) {
  slots = [];
  const input = { run: props.run, config: { ...preview.IDENTITY_STAMP, layout },
    fitScale: .25, offsetX: 5, offsetY: 10, viewWidth: 280, viewHeight: 480 };
  const draw = progressFraction => nodes(render(() => preview.StampPreviewLayer({ ...input, progressFraction })))
    .filter(node => node.type === preview.StampPreviewText);
  const initial = draw(0), final = draw(1);
  assert.equal(initial.length, final.length);
  for (let i = 0; i < initial.length; i++) {
    const a = initial[i].props, b = final[i].props;
    assert.equal(a.viewport, b.viewport, `${layout}: viewport changed during count-up`);
    if (a.node.text === b.node.text) assert(preview.StampPreviewText.compare(a, b), `${layout}: static text must skip updates`);
    else assert(!preview.StampPreviewText.compare(a, b), `${layout}: changed value must update`);
    const tree = preview.StampPreviewText(b);
    const glyph = nodes(tree).find(node => node.type === preview.StampTextsSvg);
    assert.equal(nodes(glyph.type(glyph.props)).filter(node => node.props?.filter).length, 0, `${layout}: live glyphs must avoid SVG filters`);
  }
}
console.log('PASS: 30fps samples from 0 to 1; stable text viewports; static labels memoized; live text avoids SVG filter work.');

// Pace uses real GPS timing, handles broken timestamps, and ends at the workout average.
const { buildPaceTimeline, paceAtProgress } = load('src/lib/pace-timeline.ts');
const origin = Date.parse('2026-01-01T00:00:00Z');
const timed = Array.from({ length: 201 }, (_, i) => ({ latitude: 37 + i * .00003, longitude: 127,
  timestamp: new Date(origin + (i <= 100 ? i : 100 + (i - 100) * 2) * 1000).toISOString() }));
const avg = 450;
const pace = buildPaceTimeline(timed, avg);
assert.equal(pace.length, 271);
assert(pace[30] < pace[210], 'slower GPS section must show a slower pace');
assert.equal(pace.at(-1), avg);
assert.equal(paceAtProgress(pace, 1, avg), avg);
assert.equal(paceAtProgress(pace, 2, avg), avg);
assert.equal(paceAtProgress([], .5, avg), avg);
assert.deepEqual(buildPaceTimeline(timed.map(({ latitude, longitude }) => ({ latitude, longitude })), avg), []);
assert.deepEqual(buildPaceTimeline([{ latitude: NaN, longitude: 0 }, timed[1]], avg), []);
const uniform = timed.map((p, i) => ({ ...p, timestamp: new Date(origin + i * 1000).toISOString() }));
const gap = uniform.map((p, i) => ({ ...p, timestamp: new Date(Date.parse(p.timestamp) + (i >= 100 ? 120000 : 0)).toISOString() }));
assert.equal(buildPaceTimeline(gap, avg)[135], avg, 'gap window falls back to average');
const backwards = uniform.map((p, i) => i === 100 ? { ...p, timestamp: uniform[90].timestamp } : p);
assert(buildPaceTimeline(backwards, avg).every(p => Number.isFinite(p) && p > 0));
console.log('PASS: GPS-derived pace changes with speed; gaps/invalid data fallback; exact final average.');

// A selection box must inherit the route's live transform, including between React commits.
function applyTransform(point, transforms) {
  let { x, y } = point;
  for (const op of [...transforms].reverse()) {
    if ('translateX' in op) x += op.translateX;
    if ('translateY' in op) y += op.translateY;
    if ('scale' in op) { x *= op.scale; y *= op.scale; }
    if ('rotate' in op) {
      const c = Math.cos(op.rotate), s = Math.sin(op.rotate);
      [x, y] = [x * c - y * s, x * s + y * c];
    }
  }
  return { x, y };
}
for (const fit of ['contain', 'cover', 'cover-safe']) {
  slots = [];
  const live = { x: { value: 0 }, y: { value: 0 }, scale: { value: 1 }, rotationDeg: { value: 0 } };
  const selected = { ...props, drawingSelected: true, transformShared: live, fit, bottomInset: 100 };
  const selectedCanvas = canvas(selected);
  const tree = selectedCanvas.type(selectedCanvas.props);
  const group = nodes(tree).find(n => n.type === 'Group');
  const box = group.props.children.find(n => n?.type === 'RoundedRect');
  assert(box, 'selection must be a direct child of the same Group as the route');
  assert(group.props.children.some(n => n?.type?.name === 'DefaultDrawingLayer'));
  assert.equal(box.props.transform, undefined, 'no independent transform on selection');
  assert.equal(box.props.style, 'stroke');
  assert.equal(box.props.children.type, 'DashPathEffect');
  const bounds = selectedCanvas.props.selectionBounds;
  for (const p of projection.projectPoints(props.points)) {
    assert(p.x >= box.props.x && p.x <= box.props.x + box.props.width);
    assert(p.y >= box.props.y && p.y <= box.props.y + box.props.height);
  }
  const fitResult = preview.computeFitTransform(props.viewWidth, props.viewHeight, fit, 100);
  for (const [x, y, scale, rotation] of [[180, -650, 1, 0], [-220, 310, .6, 45], [90, -100, 1.8, -90], [0, 0, 1, 0]]) {
    live.x.value = x; live.y.value = y; live.scale.value = scale; live.rotationDeg.value = rotation;
    // No render here: the original parent transform must read the current gesture values.
    const actual = applyTransform({ x: bounds.cx, y: bounds.cy }, group.props.transform.value);
    const angle = rotation * Math.PI / 180;
    const dx = (bounds.cx - 540) * scale, dy = (bounds.cy - 960) * scale;
    const expectedX = fitResult.offsetX + fitResult.fitScale * (540 + x + dx * Math.cos(angle) - dy * Math.sin(angle));
    const expectedY = fitResult.offsetY + fitResult.fitScale * (960 + y + dx * Math.sin(angle) + dy * Math.cos(angle));
    assert(Math.abs(actual.x - expectedX) < 1e-7 && Math.abs(actual.y - expectedY) < 1e-7);
  }
  for (let i = 1; i <= 12; i++) {
    selectedCanvas.props.onProgressSample(i / 12);
    const next = canvas(selected);
    for (const key of Object.keys(next.props)) assert(Object.is(next.props[key], selectedCanvas.props[key]), `selected Canvas prop changed: ${key}`);
  }
  const unselected = canvas({ ...selected, drawingSelected: false });
  assert.equal(unselected.props.selectionBounds, null);
  assert(!nodes(unselected.type(unselected.props)).some(n => n.type === 'RoundedRect'));
}
console.log('PASS: selected route and box share one live transform for move/scale/rotation/reset and all fits; selected Canvas props remain stable; no box when unselected. Native device QA still required.');
