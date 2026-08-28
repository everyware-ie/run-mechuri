import { NativeModule, requireNativeModule } from 'expo';

import type { RenderClipOptions, RenderClipResult } from './RouteRenderer.types';

declare class RouteRendererModule extends NativeModule<{}> {
  /**
   * §5 애니메이션 · §8 배경 합성 · §9 출력 규격.
   * v0: 기본 드로잉 프리셋 + 정지 이미지 배경만. 12초(9s 그리기 + 3s 정지), 1080x1920, 30fps.
   */
  renderClip(options: RenderClipOptions): Promise<RenderClipResult>;
}

export default requireNativeModule<RouteRendererModule>('RouteRenderer');
