import { liveRunDestination, validLiveRunID } from './live-run-link';

const run = '3f740e80-14f9-810c-a034-ed575d3959a8';
const next = '3f840e80-14f9-8005-bce2-ccb8fd60ac5e';
test('an active card and a previously saved card resolve to their own records', () => {
  expect(liveRunDestination(run, run, [])).toBe('/internal-run');
  expect(liveRunDestination(run, next, [run])).toBe(`/internal-run/${run}`);
});
test('a deleted card never becomes a new run', () => {
  expect(liveRunDestination(run, next, [])).toBe('/internal-run');
  expect(liveRunDestination(run, undefined, [])).toBe('/');
});
test('malformed or ambiguous links cannot reach native storage', () => {
  for (const id of ['../secret', 'resume', '', [run], undefined, `${run}?action=finish`]) expect(validLiveRunID(id)).toBe(false);
  expect(liveRunDestination('../secret', next, [])).toBe('/');
});
