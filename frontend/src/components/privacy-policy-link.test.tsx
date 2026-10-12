import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { PrivacyPolicyLink } from './privacy-policy-link';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const open = jest.mocked(WebBrowser.openBrowserAsync);
const button = () => renderer.root.findAll(node => node.props.accessibilityLabel === '개인정보 처리방침' && typeof node.props.onPress === 'function')[0];
beforeEach(() => { jest.clearAllMocks(); open.mockResolvedValue({ type: 'cancel' } as WebBrowser.WebBrowserResult); });
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); });

it('공개 처리방침을 앱 내 브라우저로 열고 닫은 뒤 다시 열 수 있다', async () => {
  await act(async () => { renderer = create(createElement(PrivacyPolicyLink)); });
  await act(async () => { button().props.onPress(); });
  expect(open).toHaveBeenCalledWith('https://phs00.notion.site/privacy', { dismissButtonStyle: 'close' });
  expect(button().props.disabled).toBe(false);
  await act(async () => { button().props.onPress(); });
  expect(open).toHaveBeenCalledTimes(2);
});

it('브라우저가 열려 있는 동안 연속 탭으로 창을 겹쳐 열지 않는다', async () => {
  let close!: (result: WebBrowser.WebBrowserResult) => void;
  open.mockReturnValueOnce(new Promise(resolve => { close = resolve; }));
  await act(async () => { renderer = create(createElement(PrivacyPolicyLink)); });
  await act(async () => { const press=button().props.onPress; press(); press(); });
  expect(open).toHaveBeenCalledTimes(1);
  expect(button().props.disabled).toBe(true);
  await act(async () => { close({ type: 'cancel' } as WebBrowser.WebBrowserResult); });
  expect(button().props.disabled).toBe(false);
});

it('열기 실패를 알리고 다시 시도 버튼으로 복구한다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  open.mockRejectedValueOnce(new Error('browser unavailable'));
  await act(async () => { renderer = create(createElement(PrivacyPolicyLink)); });
  await act(async () => { button().props.onPress(); });
  expect(alert).toHaveBeenCalledWith('개인정보 처리방침을 열지 못했어요', expect.any(String), expect.any(Array));
  const retry=alert.mock.calls[0][2]?.find(option=>option.text==='다시 시도');
  await act(async () => { retry?.onPress?.(); });
  expect(open).toHaveBeenCalledTimes(2);
  expect(button().props.disabled).toBe(false);
});
