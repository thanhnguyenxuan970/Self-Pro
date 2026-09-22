jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles: unknown) => styles },
}));

import { AuthRecoveryScreen } from '../src/components/AuthRecoveryScreen';
import { restoreStoredGoogleSession } from '../src/hooks/useAuth';

const storedUser = JSON.stringify({
  sub: 'google-sub',
  email: 'recovery@example.com',
  name: 'Recovery User',
  picture: 'https://example.invalid/avatar.png',
});

function childrenOf(element: { props?: { children?: unknown } }): unknown[] {
  const children = element.props?.children;
  return Array.isArray(children) ? children : [children];
}

describe('startup recovery behavior', () => {
  test('test-only timeout fault reaches the real recovery screen, then Retry succeeds', async () => {
    const ensureSession = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('test timeout'), { status: 504 }))
      .mockResolvedValueOnce(undefined);
    let state: 'recovering' | 'retryable' | 'ready' = 'recovering';

    try {
      await restoreStoredGoogleSession('true', storedUser, ensureSession);
      state = 'ready';
    } catch {
      state = 'retryable';
    }
    expect(state).toBe('retryable');

    let retryResolve!: () => void;
    const recoveryScreen = AuthRecoveryScreen({
      backgroundColor: '#fff',
      textColor: '#111',
      buttonColor: '#0a0',
      buttonTextColor: '#fff',
      message: 'recovery failed',
      buttonLabel: 'Retry',
      busy: false,
      onRetry: () => {
        retryResolve = () => { state = 'ready'; };
        void restoreStoredGoogleSession('true', storedUser, ensureSession).then(retryResolve);
      },
    });
    const [message, button] = childrenOf(recoveryScreen) as Array<{ type: string; props: { children?: unknown; onPress?: () => void } }>;
    expect(recoveryScreen.type).toBe('View');
    expect(message.type).toBe('Text');
    expect(message.props.children).toBe('recovery failed');
    expect(button.type).toBe('TouchableOpacity');
    expect(button.props.children).toBeDefined();

    button.props.onPress?.();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(ensureSession).toHaveBeenCalledTimes(2);
    expect(state).toBe('ready');
  });

  test('busy recovery renders the busy label and disables Retry', () => {
    const recoveryScreen = AuthRecoveryScreen({
      backgroundColor: '#fff',
      textColor: '#111',
      buttonColor: '#0a0',
      buttonTextColor: '#fff',
      message: 'retrying',
      buttonLabel: 'Retry',
      busyLabel: 'Retrying…',
      busy: true,
      onRetry: jest.fn(),
    });
    const [, button] = childrenOf(recoveryScreen) as Array<{ props: { children?: unknown; disabled?: boolean; accessibilityLabel?: string } }>;

    expect(button.props.children).toBeDefined();
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityLabel).toBe('Retrying…');
  });
});
