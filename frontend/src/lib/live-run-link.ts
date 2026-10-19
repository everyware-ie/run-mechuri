const runIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validLiveRunID(id: unknown): id is string {
  return typeof id === 'string' && runIDPattern.test(id);
}
// Links only select a screen. They never prepare, start or resume a record.
export function liveRunDestination(id: string, currentID: string | undefined, savedIDs: string[]): '/' | '/internal-run' | `/internal-run/${string}` {
  if (!validLiveRunID(id)) return '/';
  if (id === currentID) return '/internal-run';
  if (savedIDs.includes(id)) return `/internal-run/${id}`;
  return currentID ? '/internal-run' : '/';
}
