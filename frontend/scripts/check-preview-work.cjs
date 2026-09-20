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
  __esModule: true,
  default: { View: 'ReanimatedView' },
  useAnimatedStyle: fn => ({ get transform() { return fn().transform; } }),
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
const preview = load('src/components/route-preview.tsx', '\nexport {useUIThreadProgress, LightRunnerLayer, StampPreviewLayer, StampPreviewText, StampTextsSvg, stampLayoutDescriptors};');
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

// Newly selected one-line stamps must fit with all six fields, including the place.
const { estimateOneLineTextWidth } = load('src/lib/stamp-columns.ts');
const lineKeys = ['distance', 'time', 'pace', 'heartRate', 'date', 'place'];
for (const run of [
  { ...props.run, distanceMeters: 6010, durationSeconds: 2516, averagePaceSecPerKm: 418, averageHeartRate: 156 },
  { ...props.run, distanceMeters: 100000, durationSeconds: 39600, averagePaceSecPerKm: 396, averageHeartRate: 199 },
]) {
  for (const placeName of ['신대방동', '서울특별시 동작구 신대방제2동']) {
    for (let mask = 1; mask < 64; mask++) {
      const enabled = Object.fromEntries(lineKeys.map((key, i) => [key, Boolean(mask & (1 << i))]));
      const config = { ...preview.IDENTITY_STAMP, layout: 'line', mode: 'always', scale: 1, position: { x: 0, y: 0 }, enabled, placeName, caption: '' };
      let finalSize;
      for (const progress of [0, .15, .5, .99, 1]) {
        const node = preview.stampLayoutDescriptors(run, config, progress, progress === 1 ? run.averagePaceSecPerKm : 600).texts.find(n => n.key === 'oneLine');
        assert(node, 'enabled one-line fields must remain visible');
        assert(estimateOneLineTextWidth(node.text, node.size) <= 1080 - 24 * 3.6 + 1e-7, 'one-line stamp overflows its default width');
        assert.equal(node.x, 540);
        assert.equal(node.anchor, 'middle');
        if (enabled.place) assert(node.text.includes(placeName), 'place must not be truncated');
        if (finalSize !== undefined) assert.equal(node.size, finalSize, 'count-up must not resize text');
        finalSize = node.size;
      }
      for (const scale of [.5, 1.75]) {
        const node = preview.stampLayoutDescriptors(run, { ...config, scale, position: { x: 75, y: -100 } }, 1).texts.find(n => n.key === 'oneLine');
        assert.equal(node.x, 615, 'manual position is preserved');
        assert(Math.abs(node.size - finalSize * scale) < 1e-7, 'manual scale is preserved');
      }
    }
  }
}
const noLine = preview.stampLayoutDescriptors(props.run, { ...preview.IDENTITY_STAMP, layout: 'line', enabled: Object.fromEntries(lineKeys.map(k => [k, false])), caption: '달리기 완료' }, 1);
assert(!noLine.texts.some(n => n.key === 'oneLine'));
assert(noLine.texts.some(n => n.key.startsWith('caption')));
console.log('PASS: one-line defaults fit all 63 field combinations, Korean places and long runs; stable count-up font; manual scale/position preserved; caption-only works.');

// Hit regions must leave the empty center of the corner preset available to the route.
const hitRun = { ...props.run, distanceMeters: 6010, durationSeconds: 2516, averagePaceSecPerKm: 418, averageHeartRate: 156 };
const hitConfig = { ...preview.IDENTITY_STAMP, enabled: Object.fromEntries(lineKeys.map(key => [key, true])), placeName: '신대방동', caption: '', position: { x: 0, y: 0 }, scale: 1 };
const containsPoint = (rect, x, y) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
for (const layout of ['corner', 'glass', 'rail', 'stack', 'bar', 'line', 'row']) {
  for (const scale of [.5, 1, 3]) {
    const config = { ...hitConfig, layout, scale };
    const regions = preview.computeStampHitRects(hitRun, config);
    const descriptors = preview.stampLayoutDescriptors(hitRun, config, 1);
    for (const text of descriptors.texts) {
      const x = text.x + (text.anchor === 'end' ? -.2 : text.anchor === 'middle' ? 0 : .2) * text.size;
      assert(regions.some(rect => containsPoint(rect, x, text.y - text.size * .3)), `${layout}: visible text must be selectable`);
      if (text.text === '신대방동' && text.anchor === 'end') {
        assert(regions.some(rect => containsPoint(rect, text.x - 3 * text.size, text.y - text.size * .3)), 'Korean place names need their full glyph width');
      }
    }
    const moved = preview.computeStampHitRects(hitRun, { ...config, position: { x: 75, y: -100 } });
    assert.equal(moved.length, regions.length);
    regions.forEach((rect, i) => {
      for (const [key, delta] of [['x', 75], ['y', -100], ['width', 0], ['height', 0]]) {
        assert(Math.abs(moved[i][key] - rect[key] - delta) < 1e-7, `${layout}: hit regions must follow movement`);
      }
    });
    if (layout === 'glass') {
      const card = descriptors.rects.find(rect => rect.key === 'glass-bg');
      assert(regions.some(rect => containsPoint(rect, card.x + 5, card.y + card.height / 2)), 'glass background remains selectable');
    } else {
      assert(regions.length > 1, `${layout}: separated content must not become one envelope`);
    }
    if (layout === 'corner' && scale === 1) {
      const time = descriptors.texts.find(text => text.key === 'stat-value-0');
      assert(!regions.some(rect => containsPoint(rect, 300, time.y)), 'empty space left of corner stats must select the route');
      const date = descriptors.texts.find(text => text.key === 'date');
      assert(!regions.some(rect => containsPoint(rect, 540, date.y)), 'date must not fill the empty header');
    }
  }
}
const dateOnly = { ...hitConfig, layout: 'corner', enabled: Object.fromEntries(lineKeys.map(key => [key, key === 'date'])) };
assert.equal(preview.computeStampHitRects(hitRun, dateOnly).length, 1);
assert.equal(preview.computeStampHitRects(hitRun, { ...dateOnly, enabled: Object.fromEntries(lineKeys.map(key => [key, false])) }).length, 0);
console.log('PASS: all stamp presets keep text selectable, separate empty areas, follow scale/movement, preserve glass card selection and omit disabled items.');

// Committing a dragged stamp must not add its displacement a second time.
slots = [];
const stampPositionShared = { x: { value: 100 }, y: { value: -50 } };
const dragProps = { ...props, stampSelected: true, stampPositionShared,
  stampConfig: { ...hitConfig, layout: 'corner', position: { x: 100, y: -50 } } };
function stampWrapper(p) {
  return nodes(render(() => preview.RoutePreview(p))).find(node => node.type === 'ReanimatedView');
}
let wrapper = stampWrapper(dragProps);
assert(wrapper, 'stamp content must use one animated position wrapper');
const fitScale = preview.computeFitTransform(props.viewWidth, props.viewHeight, 'contain').fitScale;
const stampLayer = node => nodes(node).find(child => child.type?.name === 'StampPreviewLayer');
assert.deepEqual(stampLayer(wrapper).props.config.position, { x: 0, y: 0 });
stampPositionShared.x.value = 280;
stampPositionShared.y.value = 75;
const beforeCommit = wrapper.props.style[1].transform;
assert.deepEqual(beforeCommit, [{ translateX: 280 * fitScale }, { translateY: 75 * fitScale }]);
wrapper = stampWrapper({ ...dragProps, stampConfig: { ...dragProps.stampConfig, position: { x: 280, y: 75 } } });
assert.deepEqual(wrapper.props.style[1].transform, beforeCommit, 'persisting position must leave displayed position unchanged');
assert.deepEqual(stampLayer(wrapper).props.config.position, { x: 0, y: 0 }, 'committed position must not also enter SVG layout');
stampPositionShared.x.value = -20;
stampPositionShared.y.value = 10;
assert.deepEqual(wrapper.props.style[1].transform, [{ translateX: -20 * fitScale }, { translateY: 10 * fitScale }], 'next drag must not inherit delayed offset resets');
const regular = stampWrapper({ ...dragProps, stampPositionShared: undefined });
assert.deepEqual(stampLayer(regular).props.config.position, dragProps.stampConfig.position, 'non-editor previews retain stored layout coordinates');
console.log('PASS: stamp drag and commit share one absolute translation without double movement; repeated drag and non-editor previews preserve position.');

// Slider callbacks must receive the last finger position even before React renders again.
React.useRef = initial => retainSlot(() => ({ current: initial }), []);
deps['react-native'].PanResponder = { create: callbacks => ({ panHandlers: callbacks }) };
deps['react-native'].StyleSheet = { create: styles => styles };
deps['@/constants/theme'] = { Colors: { border: '#333', accent: '#ff5722' } };
const { Slider } = load('src/components/slider.tsx');
for (const [minimumValue, maximumValue, startValue] of [[0, 100, 40], [50, 300, 100]]) {
  slots = [];
  const changes = [], commits = [];
  let options = { value: startValue, minimumValue, maximumValue, onChange: v => changes.push(v), onSlidingComplete: v => commits.push(v) };
  let slider = render(() => Slider(options));
  slider.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
  slider.props.onPanResponderGrant({ nativeEvent: { locationX: 20 } });
  const at20 = Math.round(minimumValue + .2 * (maximumValue - minimumValue));
  assert.equal(changes.at(-1), at20);
  slider.props.onPanResponderRelease();
  assert.equal(commits.at(-1), at20, 'tap release must commit without waiting for a render');
  slider.props.onPanResponderMove({}, { dx: 20 });
  assert.equal(changes.at(-1), Math.round(minimumValue + .4 * (maximumValue - minimumValue)), 'drag starts at the tapped value');
  slider.props.onPanResponderMove({}, { dx: -500 });
  assert.equal(changes.at(-1), minimumValue);
  slider.props.onPanResponderMove({}, { dx: 500 });
  assert.equal(changes.at(-1), maximumValue);
  slider.props.onPanResponderTerminate();
  assert.equal(commits.at(-1), maximumValue, 'interrupted drag must also commit');
  const midpoint = (minimumValue + maximumValue) / 2;
  const latestCommits = [];
  options = { ...options, value: midpoint, onSlidingComplete: v => latestCommits.push(v) };
  slider = render(() => Slider(options));
  assert.equal(slider.props.accessibilityValue.now, midpoint, 'external pinch/reset value must be reflected');
  slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  assert.equal(latestCommits.at(-1), midpoint + 1, 'latest callback and current value must be used');
}
console.log('PASS: smoothing and stamp-size slider ranges; tap/drag clamping; immediate release/termination commits; external values and latest callbacks.');
