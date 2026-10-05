import { requireOptionalNativeModule } from 'expo';

export type RunSummary = {
  id: string; started: number; status: 'running' | 'paused' | 'interrupted' | 'saving' | 'completed';
  duration: number; elapsed: number; distance: number; pace?: number | null; averagePace?: number | null;
  heartRate?: number | null; averageHeartRate?: number | null; maxHeartRate?: number | null;
  steps: number; cadence?: number | null; averageCadence?: number | null;
  lastLocation?: number | null; lastHeart?: number | null; lastMotion?: number | null; lastSaved?: number | null;
  segments: number; rawCount: number; acceptedCount: number; rejected: Record<string, number>;
  backgroundCount: number; foregroundCount: number; maxSampleGap: number; maxReceiptGap: number;
  meanAccuracy?: number | null; incomplete: boolean; errors: string[];
  batteryStart?: number | null; batteryEnd?: number | null; charging: boolean; watchEnabled: boolean; feedback?: string; preparedAt?: number; readyAt?: number; lowPower: boolean; metricVersion: number;
};
export type RunPoint = { latitude: number; longitude: number; time: number; segment: number };
export type RunMapPage = {
  revision: string; runId: string | null; reset: boolean;
  fromIndex: number; nextIndex: number; total: number; points: RunPoint[]; position: RunPoint | null;
};
export type TrackingState = {
  enabled: boolean; phase: string; notice?: string | null; summary?: RunSummary | null;
  watchState: string; storageError: boolean; unsavedEvents: number;
  locationPermission: number; preciseLocation: boolean; motionPermission: number; motionSupported: boolean;
  watchPaired: boolean; watchInstalled: boolean;
};
type Module = {
  enabled: boolean;
  appVersion: string; buildVersion: string;
  state(): Promise<TrackingState>; prepare(): Promise<TrackingState>; cancelPreparation(): Promise<void>;
  mapSnapshot?(revision: string | null, after: number): Promise<RunMapPage>;
  start(watch: boolean): Promise<TrackingState>; pause(): Promise<void>; resume(): Promise<void>; finish(): Promise<void>;
  retrySave(): Promise<void>; keepSaved(): Promise<void>; recover(id: string): Promise<void>;
  records(): Promise<{ records: RunSummary[]; damaged: string[] }>;
  detail(id: string): Promise<{ summary: RunSummary; points: RunPoint[] }>;
  deleteRecord(id: string): Promise<void>; feedback(id: string, text: string): Promise<void>; connectWatch(): Promise<void>;
  copySummary(text: string): Promise<void>;
};
// Optional import lets an older development client show its existing screens.
// Immutable native build flag, rather than a JS-only flag, guards every API.
export const Tracking = requireOptionalNativeModule<Module>('RunTracking');
export const trackingEnabled = Tracking?.enabled === true;
