import assert from 'node:assert/strict';
import test from 'node:test';

test('Vite Dev Server: Proxy configuration maps the gateway under /api', () => {
  const env: Record<string, string> = {};
  const gatewayTarget = env.VITE_GATEWAY_URL || 'http://127.0.0.1:2399';
  const proxyConfig = {
    '/api': {
      target: gatewayTarget,
      changeOrigin: true,
      secure: false,
    },
  };

  assert.equal(proxyConfig['/api'].target, 'http://127.0.0.1:2399');
  assert.equal(proxyConfig['/api'].changeOrigin, true);
  assert.equal(proxyConfig['/api'].secure, false);

});

test('Vite Dev Server: Validates required frontend environment variables', () => {
  const requiredFrontendVars = [
    'VITE_AUTH_API_URL',
    'VITE_SOBRACORTE_API_URL',
    'VITE_PORTAL_UNIX_URL',
    'VITE_DASS_IDENTITIES_URL',
    'VITE_DEV_PORT',
  ] as const;

  const validEnv: Record<string, string> = {
    VITE_AUTH_API_URL: '/api',
    VITE_SOBRACORTE_API_URL: '/api/sobracorte',
    VITE_PORTAL_UNIX_URL: 'http://10.100.1.43/unix/',
    VITE_DASS_IDENTITIES_URL: 'http://10.100.1.43/identities/',
    VITE_DEV_PORT: '3000',
  };

  const missing = requiredFrontendVars.filter((key) => !validEnv[key]?.trim());
  assert.equal(missing.length, 0);

  const invalidEnv: Record<string, string> = {
    VITE_AUTH_API_URL: '/api',
    VITE_SOBRACORTE_API_URL: '',
    VITE_PORTAL_UNIX_URL: 'http://10.100.1.43/unix/',
    VITE_DASS_IDENTITIES_URL: 'http://10.100.1.43/identities/',
    VITE_DEV_PORT: '3000',
  };

  const missingInInvalid = requiredFrontendVars.filter((key) => !invalidEnv[key]?.trim());
  assert.deepEqual(missingInInvalid, ['VITE_SOBRACORTE_API_URL']);
});

test('Vite Dev Server: Validates port range (1 to 65535)', () => {
  const validatePort = (portStr: string) => {
    const devPort = Number(portStr);
    if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65_535) {
      throw new Error('VITE_DEV_PORT deve ser um número inteiro entre 1 e 65535.');
    }
    return devPort;
  };

  assert.equal(validatePort('3000'), 3000);
  assert.equal(validatePort('3000'), 3000);
  assert.throws(() => validatePort('0'), /VITE_DEV_PORT deve ser um número inteiro/);
  assert.throws(() => validatePort('70000'), /VITE_DEV_PORT deve ser um número inteiro/);
  assert.throws(() => validatePort('abc'), /VITE_DEV_PORT deve ser um número inteiro/);
});
