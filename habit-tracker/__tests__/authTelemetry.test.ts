import {
  createAuthAttemptId,
  getGoogleSignInResponseTelemetry,
  logGoogleSignInResponseTelemetry,
  logAuthStage,
  logRestorePhase,
  safeAuthErrorCode,
} from '../src/lib/authTelemetry';

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
});
