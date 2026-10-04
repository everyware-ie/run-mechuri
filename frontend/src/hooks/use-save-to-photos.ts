import { useCallback, useEffect, useRef, useState } from 'react';

type PhotoLibrary = {
  requestPermissionsAsync: (writeOnly: boolean) => Promise<{ status: string }>;
  saveToLibraryAsync: (path: string) => Promise<void>;
};

// 웹에서 화면만 열 때는 네이티브 모듈을 로드하지 않는다.
async function loadPhotoLibrary(): Promise<PhotoLibrary> {
  const { requestPermissionsAsync } = await import('expo-media-library');
  // SDK 57의 실제 파일 저장 함수는 legacy 진입점을 사용한다.
  const { saveToLibraryAsync } = await import('expo-media-library/legacy');
  return { requestPermissionsAsync, saveToLibraryAsync };
}

// FRD: export-and-share §4 기기에 저장, common-rules §3 실패
export function useSaveToPhotos(outputPath: string | null | undefined, loadLibrary = loadPhotoLibrary) {
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const saveToPhotos = useCallback(async () => {
    if (!outputPath || pendingRef.current || !mountedRef.current) return;
    // React가 버튼을 갱신하기 전 연속 탭도 막는다.
    pendingRef.current = true;
    setSaving(true);
    setSaveStatus(null);
    try {
      const { requestPermissionsAsync, saveToLibraryAsync } = await loadLibrary();
      const { status } = await requestPermissionsAsync(true);
      if (status !== 'granted') {
        if (mountedRef.current) setSaveStatus('사진 저장 권한이 필요해요. 설정에서 허용해주세요.');
        return;
      }
      await saveToLibraryAsync(outputPath);
      if (mountedRef.current) setSaveStatus('기기에 저장했어요');
    } catch (error) {
      console.warn('Photo library save failed', error);
      if (mountedRef.current) setSaveStatus('저장하지 못했어요. 저장 버튼을 눌러 다시 시도해주세요.');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [outputPath, loadLibrary]);

  return { saving, saveStatus, saveToPhotos };
}
