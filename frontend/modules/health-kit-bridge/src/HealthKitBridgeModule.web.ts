import { registerWebModule, NativeModule } from 'expo';

// HealthKitBridgeModule is not available on the web platform.
class HealthKitBridgeModule extends NativeModule<{}> {}

export default registerWebModule(HealthKitBridgeModule, 'HealthKitBridgeModule');
