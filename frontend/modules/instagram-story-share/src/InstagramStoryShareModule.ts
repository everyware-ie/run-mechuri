import { NativeModule, requireNativeModule } from 'expo';

declare class InstagramStoryShareModule extends NativeModule<{}> {
  /** §3-2: 공유 직전 한 번 더 확인 — JS의 Linking.canOpenURL 확인 이후에도 지울 수 있다. */
  canShare(): boolean;
  /** §3-1: mp4 결과물을 스토리 배경 영상으로 얹고 인스타그램을 연다. */
  shareToStory(videoPath: string): Promise<void>;
}

export default requireNativeModule<InstagramStoryShareModule>('InstagramStoryShare');
