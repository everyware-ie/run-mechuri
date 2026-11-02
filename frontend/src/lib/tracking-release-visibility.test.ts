let mockNativeEnabled: boolean | null = true;
jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockNativeEnabled == null ? null : { enabled: mockNativeEnabled } }));

const originalDev = __DEV__;
afterEach(() => { (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = originalDev; });

test.each([
  { development: false, native: true, enabled: true, diagnostics: false },
  { development: true, native: true, enabled: true, diagnostics: true },
  { development: true, native: null, enabled: false, diagnostics: false },
])('store/development visibility follows native feature availability: %j', ({ development, native, enabled, diagnostics }) => {
  (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = development;
  mockNativeEnabled = native;
  jest.isolateModules(() => {
    const feature = jest.requireActual('../../modules/run-tracking/src/RunTracking');
    expect(feature.trackingEnabled).toBe(enabled);
    expect(feature.trackingDiagnosticsEnabled).toBe(diagnostics);
  });
});
