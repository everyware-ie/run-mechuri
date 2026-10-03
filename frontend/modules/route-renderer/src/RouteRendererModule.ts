import { NativeModule, requireNativeModule } from 'expo';

import type { PreparedVideo, RenderClipOptions, RenderClipResult, RenderProgressEvent } from './RouteRenderer.types';

type RouteRendererEvents = {
  /** export-and-share FRD §2-3 인코딩 진행률. */
  onRenderProgress: (event: RenderProgressEvent) => void;
};

declare class RouteRendererModule extends NativeModule<RouteRendererEvents> {
  /**
   * §5 애니메이션 · §8 배경 합성 · §9 출력 규격.
   * 12초(9s 그리기 + 3s 정지), 1080x1920, 30fps. 배경은 사진 또는 영상.
   */
  renderClip(options: RenderClipOptions): Promise<RenderClipResult>;
  /** 배경 선택 FRD §5. 고른 영상의 앞 `maxSeconds`만 잘라 보관하고 첫 장면 이미지를 만든다. 소리는 뺀다. */
  prepareVideoBackground(inputUri: string, maxSeconds: number): Promise<PreparedVideo>;
  /** export-and-share FRD §2-3·F2. 진행 중인 renderClip을 취소한다(응답은 reject로 온다). */
  cancelRender(): void;
  /** 보관함 저장까지 끝난 뒤 백그라운드 실행 권한을 반환한다. */
  finishRender(jobId: string, persisted: boolean): void;
}

export default requireNativeModule<RouteRendererModule>('RouteRenderer');
