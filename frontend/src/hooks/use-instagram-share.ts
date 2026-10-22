import * as FileSystem from 'expo-file-system/legacy';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import InstagramStoryShare from '../../modules/instagram-story-share/src/InstagramStoryShareModule';

type Options = {
  outputPath?: string | null;
  backgroundImagePath?: string;
  onUnavailable: () => void;
  onShared?: () => void;
};

// FRD: export-and-share §3 공유, common-rules §3 실패
export function useInstagramShare({ outputPath, backgroundImagePath, onUnavailable, onShared }: Options) {
  const isFocused = useIsFocused();
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const [sharing, setSharing] = useState(false);

  // 다른 앱을 여는 것은 화면 포커스를 해제하지 않는다. 앱 안에서 화면을 떠났을 때만
  // 이전 요청의 완료·실패가 새 화면에 안내나 이동을 실행하지 못하게 한다.
  useEffect(() => () => { generationRef.current += 1; }, [isFocused]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const share = useCallback(async () => {
    if (!outputPath || !isFocused || pendingRef.current || !mountedRef.current) return;
    pendingRef.current = true;
    setSharing(true);
    const generation = generationRef.current;
    const isCurrent = () => mountedRef.current && generation === generationRef.current;
    try {
      const info = await FileSystem.getInfoAsync(outputPath);
      if (!isCurrent()) return;
      if (!info.exists) {
        Alert.alert('영상을 더 이상 찾을 수 없어요',
          '이 결과물의 영상 파일이 사라졌어요. "다시 편집"이나 "같은 기록으로 새로 만들기"로 다시 만들어주세요.');
        return;
      }
      const canOpen = await Linking.canOpenURL('instagram-stories://share');
      if (!isCurrent()) return;
      if (!canOpen) {
        onUnavailable();
        return;
      }
      await InstagramStoryShare.shareToStory(outputPath, backgroundImagePath);
      if (isCurrent()) onShared?.();
    } catch (error) {
      console.warn('Instagram story share failed', error);
      if (isCurrent()) Alert.alert('인스타그램으로 보내지 못했어요',
        '결과물은 보관함에 그대로 있어요. 다시 공유하거나 기기에 저장해주세요.');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setSharing(false);
    }
  }, [outputPath, backgroundImagePath, isFocused, onUnavailable, onShared]);

  return { sharing, share };
}
