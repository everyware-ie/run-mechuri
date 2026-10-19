import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import ResultDetailScreen from '../app/result/[id]';
import { getResult, type SavedResult } from './results-store';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';

let mockID = 'first';
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({ id: mockID }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/internal-run-entry', () => ({ AppPermissionsLink: () => null }));
jest.mock('@/components/instagram-missing-sheet', () => ({ InstagramMissingSheet: () => null }));
jest.mock('@/components/route-thumbnail', () => ({ RouteThumbnail: () => null }));
jest.mock('@/components/result-video-preview', () => ({ ResultVideoPreview: () => null }));
const mockLoadDraft = jest.fn(), mockSelect = jest.fn();
jest.mock('@/state/creation-flow', () => ({ useCreationFlow: () => ({ loadDraft: mockLoadDraft, setSelectedRun: mockSelect }) }));
jest.mock('@/hooks/use-instagram-share', () => ({ useInstagramShare: () => ({ sharing: false, share: jest.fn() }) }));
jest.mock('@/hooks/use-save-to-photos', () => ({ useSaveToPhotos: () => ({ saving: false, saveStatus: null, saveToPhotos: jest.fn() }) }));
jest.mock('./results-store', () => ({ getResult: jest.fn(), deleteResult: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const result = (id: string): SavedResult => ({ id, distanceMeters: 5000, runDate: '2026-10-19', outputPath: `file:///${id}.mp4`, backgroundImagePath: '',
  run: { id, date: '2026-10-19', distanceMeters: 5000, durationSeconds: 1800, averagePaceSecPerKm: 360, hasRoute: true },
  track: { coordinates: [] }, preset: 'default-drawing', transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 }, smoothOptions: { smooth: 0, corner: 0 },
  stampConfig: { mode: 'always', layout: 'row', enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true }, caption: '', placeName: '', position: { x: 0, y: 0 } }, createdAt: '2026-10-19' });
const text = () => renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
beforeEach(() => { jest.clearAllMocks(); mockID = 'first'; mockSelect.mockResolvedValue(undefined); });
afterEach(async () => { await act(async () => renderer?.unmount()); });

it('조회 실패에는 재시도를 제공하고 보관 결과물을 다시 불러온다', async () => {
  jest.mocked(getResult).mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(result('first'));
  await act(async () => { renderer = create(<ResultDetailScreen />); });
  expect(text()).toContain('결과물을 불러오지 못했어요');
  const retry = renderer.root.findAll(node => node.props.title === '다시 불러오기' && typeof node.props.onPress === 'function')[0];
  await act(async () => { retry.props.onPress(); });
  expect(getResult).toHaveBeenCalledTimes(2);
  expect(text()).toContain('인스타그램 스토리로 공유');
  expect(text()).not.toContain('결과물을 불러오지 못했어요');
});

it('다른 결과물로 이동하면 이전 조회의 늦은 완료를 무시한다', async () => {
  let finish!: (result: SavedResult) => void;
  jest.mocked(getResult).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(result('second'));
  await act(async () => { renderer = create(<ResultDetailScreen />); });
  mockID = 'second';
  await act(async () => { renderer.update(<ResultDetailScreen />); });
  await act(async () => { finish({ ...result('first'), runDate: '1999-01-01' }); });
  expect(text()).not.toContain('1999-01-01');
  expect(text()).toContain('인스타그램 스토리로 공유');
});

it.each(['다시 편집', '같은 기록으로 새로 만들기'])('%s 준비 중 나가면 초안과 화면을 바꾸지 않는다', async label => {
  jest.mocked(getResult).mockResolvedValueOnce(result('first'));
  let finish!: () => void;
  if (label === '다시 편집') jest.mocked(FileSystem.getInfoAsync).mockReturnValueOnce(new Promise(resolve => { finish = () => resolve({ exists: true, isDirectory: false, uri: '', modificationTime: 0, size: 10 }); }));
  else mockSelect.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { renderer = create(<ResultDetailScreen />); });
  const button = renderer.root.findAll(node => node.props.title === label && typeof node.props.onPress === 'function')[0];
  await act(async () => { button.props.onPress(); });
  const isCurrent = label === '같은 기록으로 새로 만들기' ? mockSelect.mock.calls[0][2] : null;
  await act(async () => renderer.unmount());
  await act(async () => { finish(); });
  expect(mockLoadDraft).not.toHaveBeenCalled();
  if (isCurrent) expect(isCurrent()).toBe(false);
  expect(router.push).not.toHaveBeenCalled();
});
