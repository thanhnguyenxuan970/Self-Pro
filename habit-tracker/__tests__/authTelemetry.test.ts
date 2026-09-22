jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

import {
  createAuthAttemptId,
  getGoogleSignInResponseTelemetry,
  logGoogleSignInResponseTelemetry,
  logAuthStage,
  logRestorePhase,
  safeAuthErrorCode,
  isConfirmedInvalidCredential,
  createAuthStageReporter,
} from '../src/lib/authTelemetry';
import * as Sentry from '@sentry/react-native';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

describe('auth telemetry safety', () => {
  test('maps timeout and server failures without retaining raw error text', () => {
    expect(safeAuthErrorCode(Object.assign(new Error('gateway timeout with token=secret'), { status: 504 })))
      .toBe('HTTP_5XX');
    expect(safeAuthErrorCode({ code: 'untrusted_code', message: 'raw email user@example.com' }))
      .toBe('UNKNOWN');
  });

  test('emits only allowlisted fields and an opaque attempt id', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const attemptId = createAuthAttemptId(1700000000000);

    logAuthStage({
      attemptId,
      stage: 'supabase_exchange',
      outcome: 'failure',
      durationMs: 12.7,
      errorCode: 'untrusted_code',
      status: 503,
    });

    expect(attemptId).toMatch(/^auth-[a-z0-9]+-[a-z0-9]+$/);
    const serialized = String(info.mock.calls[0]?.[1]);
    expect(serialized).toContain('"attempt_id"');
    expect(serialized).toContain('"version_name":"2.0.4.d"');
    expect(serialized).toContain('"version_code":89');
    expect(serialized).toContain('"error_code":"UNKNOWN"');
    expect(serialized).not.toContain('untrusted_code');
    expect(serialized).not.toContain('token');
    info.mockRestore();
  });

  test('uses the release-visible logger path without expanding the allowlist', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const previousDev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      logAuthStage({
        attemptId: createAuthAttemptId(1700000000100),
        stage: 'startup_recovery',
        outcome: 'success',
      });
      expect(warn).toHaveBeenCalledWith('[auth]', expect.stringContaining('"stage":"startup_recovery"'));
      expect(String(warn.mock.calls[0]?.[1])).not.toContain('email');
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = previousDev;
      warn.mockRestore();
    }
  });

  test('logs restore phase status and redacted error details without payloads or tokens', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      logRestorePhase({
        attemptId: createAuthAttemptId(1700000000150),
        phase: 'rpc_load',
        operation: 'restore_my_data_backup_v2',
        outcome: 'failure',
        durationMs: 17.4,
        error: {
          status: 502,
          code: 'PGRST202',
          message: 'request for user@example.com used token abcdefghijklmnopqrstuvwxyz123456',
        },
      });
      const serialized = String(info.mock.calls[0]?.[1]);
      expect(serialized).toContain('"phase":"rpc_load"');
      expect(serialized).toContain('"operation":"restore_my_data_backup_v2"');
      expect(serialized).toContain('"http_status":502');
      expect(serialized).toContain('"error_code":"HTTP_5XX"');
      expect(serialized).toContain('<redacted-email>');
      expect(serialized).toContain('<redacted-token>');
      expect(serialized).not.toContain('user@example.com');
      expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    } finally {
      info.mockRestore();
    }
  });

  test('captures only Google response shape and identifies parser failure', () => {
    const telemetry = getGoogleSignInResponseTelemetry({
      type: 'success',
      data: {
        user: {
          id: 'google-sub-1',
          email: 'user@example.com',
          name: ' ',
        },
        idToken: 'secret-id-token',
      },
      user: { id: 'legacy-outer-user' },
    }, 'extractGoogleUser');

    expect(telemetry).toEqual({
      google_signin_library_version: '16.1.2',
      response_type: 'success',
      has_data: true,
      has_data_user: true,
      has_outer_user: true,
      id_type: 'string',
      id_present: true,
      email_type: 'string',
      email_present: true,
      name_type: 'string',
      name_present: false,
      id_token_type: 'string',
      id_token_present: true,
      id_token_length: 15,
      failure_step: 'extractGoogleUser',
    });
    expect(JSON.stringify(telemetry)).not.toContain('secret-id-token');
    expect(JSON.stringify(telemetry)).not.toContain('user@example.com');
    expect(JSON.stringify(telemetry)).not.toContain('google-sub-1');
  });

  test('records native failure without inventing a response payload', () => {
    expect(getGoogleSignInResponseTelemetry(undefined, 'native_sign_in')).toEqual({
      google_signin_library_version: '16.1.2',
      has_data: false,
      has_data_user: false,
      has_outer_user: false,
      id_type: 'undefined',
      id_present: false,
      email_type: 'undefined',
      email_present: false,
      name_type: 'undefined',
      name_present: false,
      id_token_type: 'undefined',
      id_token_present: false,
      id_token_length: null,
      failure_step: 'native_sign_in',
    });
  });

  test('logs response telemetry without logging the response itself', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      logGoogleSignInResponseTelemetry({
        attemptId: createAuthAttemptId(1700000000200),
        response: {
          type: 'success',
          data: { user: { id: 'subject', email: 'person@example.com', name: 'Person' }, idToken: 'secret-token' },
        },
        failureStep: 'extractGoogleUser',
      });
      const serialized = String(info.mock.calls[0]?.[1]);
      expect(serialized).toContain('"google_signin_library_version":"16.1.2"');
      expect(serialized).toContain('"failure_step":"extractGoogleUser"');
      expect(serialized).toContain('"id_token_length":12');
      expect(serialized).not.toContain('secret-token');
      expect(serialized).not.toContain('person@example.com');
      expect(serialized).not.toContain('subject');
    } finally {
      info.mockRestore();
    }
  });

  test('covers safe error classification boundaries without leaking raw messages', () => {
    expect(safeAuthErrorCode({ status: 401 })).toBe('HTTP_401');
    expect(safeAuthErrorCode({ status: 0 })).toBe('NETWORK_ERROR');
    expect(safeAuthErrorCode({ status: 408 })).toBe('NETWORK_ERROR');
    expect(safeAuthErrorCode({ status: 425 })).toBe('NETWORK_ERROR');
    expect(safeAuthErrorCode({ status: 429 })).toBe('NETWORK_ERROR');
    expect(safeAuthErrorCode({ code: 'GOOGLE_ID_TOKEN_EXPIRED' })).toBe('GOOGLE_ID_TOKEN_EXPIRED');
    expect(safeAuthErrorCode({ message: 'request timed out' })).toBe('AUTH_TIMEOUT');
    expect(safeAuthErrorCode({ message: 'does not match the signed-in Google account' })).toBe('GOOGLE_IDENTITY_MISMATCH');
    expect(safeAuthErrorCode({ message: 'does not match the signed-in user' })).toBe('GOOGLE_EMAIL_MISMATCH');
    expect(safeAuthErrorCode({ message: 'request canceled by user' })).toBe('CANCELLED');
    expect(safeAuthErrorCode({ message: 'network is offline; fetch failed' })).toBe('NETWORK_ERROR');
    expect(safeAuthErrorCode({ message: 'session unavailable' })).toBe('SESSION_UNAVAILABLE');
    expect(safeAuthErrorCode('raw primitive')).toBe('UNKNOWN');

    expect(isConfirmedInvalidCredential({ code: 'GOOGLE_ID_TOKEN_EXPIRED' })).toBe(true);
    expect(isConfirmedInvalidCredential({ code: 'UNTRUSTED' })).toBe(false);
    expect(isConfirmedInvalidCredential({ status: 401 })).toBe(false);
    expect(isConfirmedInvalidCredential({ status: 401, source: 'supabase_auth' })).toBe(true);
    expect(isConfirmedInvalidCredential({ status: 401, stage: 'google_credential' })).toBe(true);
    expect(isConfirmedInvalidCredential({ status: 401, authStage: 'other' })).toBe(false);
  });

  test('handles empty native response shapes and bounded response types', () => {
    expect(getGoogleSignInResponseTelemetry({
      type: 'x'.repeat(65),
      data: null,
      user: null,
    })).toEqual({
      google_signin_library_version: '16.1.2',
      has_data: false,
      has_data_user: false,
      has_outer_user: false,
      id_type: 'undefined',
      id_present: false,
      email_type: 'undefined',
      email_present: false,
      name_type: 'undefined',
      name_present: false,
      id_token_type: 'undefined',
      id_token_present: false,
      id_token_length: null,
    });
    expect(getGoogleSignInResponseTelemetry({
      data: { user: { id: 0, email: ' ', name: null }, idToken: 0 },
    }).id_present).toBe(true);
  });

  test('maps restore diagnostics across HTTP, network, allowlisted, and structured-error paths', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const previousDev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      const errors: unknown[] = [
        { status: 401 },
        { status: 404 },
        { status: 500 },
        { status: 0 },
        { status: 408 },
        { status: 429 },
        { status: 425 },
        { code: 'PGRST202' },
        { code: '23505' },
        { code: 'INVALID_CLOUD_BACKUP_ENVELOPE' },
        { code: '12345' },
        { code: 'untrusted', message: '{"secret":"value"}' },
        { message: '   ' },
        undefined,
      ];
      for (const error of errors) {
        logRestorePhase({ phase: 'validate_payload', outcome: 'success', error });
      }
      expect(warn).toHaveBeenCalledTimes(errors.length);
      expect(String(warn.mock.calls[11]?.[1])).toContain('<redacted-structured-error>');
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = previousDev;
      warn.mockRestore();
    }
  });

  test('reports stage completion with and without a recorded start', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const reporter = createAuthStageReporter(createAuthAttemptId(1700000000300));
      reporter.end('google_native', 'success');
      reporter.start('supabase_exchange');
      reporter.end('supabase_exchange', 'failure', { status: 429, message: 'rate limited' });
      expect(info).toHaveBeenCalledTimes(3);
      expect(String(info.mock.calls[2]?.[1])).toContain('"error_code":"NETWORK_ERROR"');
    } finally {
      info.mockRestore();
    }
  });

  test('sends safe breadcrumbs and keeps diagnostics non-fatal when Sentry throws', () => {
    const addBreadcrumb = (Sentry as typeof Sentry & { addBreadcrumb: jest.Mock }).addBreadcrumb;
    addBreadcrumb.mockReset();
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      logRestorePhase({ phase: 'rpc_load', outcome: 'success' });
      logGoogleSignInResponseTelemetry({ attemptId: 'attempt', response: {}, failureStep: 'native_sign_in' });
      logAuthStage({ attemptId: 'attempt', stage: 'google_native', outcome: 'success' });
      expect(addBreadcrumb).toHaveBeenCalledTimes(3);

      addBreadcrumb.mockImplementation(() => { throw new Error('sentry unavailable'); });
      expect(() => logRestorePhase({ phase: 'rpc_load', outcome: 'failure', error: { status: 500 } })).not.toThrow();
      expect(() => logGoogleSignInResponseTelemetry({ attemptId: 'attempt', response: {} })).not.toThrow();
      expect(() => logAuthStage({ attemptId: 'attempt', stage: 'google_native', outcome: 'failure' })).not.toThrow();
    } finally {
      info.mockRestore();
    }
  });

  test('uses the release logger for Google response telemetry', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const previousDev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      logGoogleSignInResponseTelemetry({ attemptId: 'attempt', response: {} });
      expect(warn).toHaveBeenCalledWith('[auth-google]', expect.any(String));
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = previousDev;
      warn.mockRestore();
    }
  });
});
