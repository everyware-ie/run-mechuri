import { NativeModule, requireNativeModule } from 'expo';

import type { RenderClipOptions, RenderClipResult, RenderProgressEvent } from './RouteRenderer.types';

type RouteRendererEvents = {
  /** export-and-share FRD §2-3 인코딩 진행률. */
  onRenderProgress: (event: RenderProgressEvent) => void;
};

declare class RouteRendererModule extends NativeModule<RouteRendererEvents> {
  /**
   * §5 애니메이션 · §8 배경 합성 · §9 출력 규격.
   * v0: 기본 드로잉 프리셋 + 정지 이미지 배경만. 12초(9s 그리기 + 3s 정지), 1080x1920, 30fps.
   */
  renderClip(options: RenderClipOptions): Promise<RenderClipResult>;
  /** export-and-share FRD §2-3·F2. 진행 중인 renderClip을 취소한다(응답은 reject로 온다). */
  cancelRender(): void;
}

export default requireNativeModule<RouteRendererModule>('RouteRenderer');
