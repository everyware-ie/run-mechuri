import { registerWebModule, NativeModule } from 'expo';

// InstagramStoryShareModule is not available on the web platform.
class InstagramStoryShareModule extends NativeModule<{}> {}

export default registerWebModule(InstagramStoryShareModule, 'InstagramStoryShareModule');
