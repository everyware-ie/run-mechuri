import { NativeModule, requireNativeModule } from 'expo';

declare class InstagramStoryShareModule extends NativeModule<{}> {
  /** §3-2: 공유 직전 한 번 더 확인 — JS의 Linking.canOpenURL 확인 이후에도 지울 수 있다. */
  canShare(): boolean;
  /**
   * §3-1: mp4 결과물을 스토리 배경 영상으로 얹고 인스타그램을 연다.
   * backgroundImagePath(2026-09-08 추가): 진단·폴백용 — backgroundVideo 키가
   * 인스타그램에서 안 먹히는 경우를 대비해 정적 배경 사진도 같이 실어 보낸다.
   */
  shareToStory(videoPath: string, backgroundImagePath?: string): Promise<void>;
}

export default requireNativeModule<InstagramStoryShareModule>('InstagramStoryShare');
