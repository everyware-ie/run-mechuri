import { registerWebModule, NativeModule } from 'expo';

// RouteRendererModule is not available on the web platform.
class RouteRendererModule extends NativeModule<{}> {}

export default registerWebModule(RouteRendererModule, 'RouteRendererModule');
