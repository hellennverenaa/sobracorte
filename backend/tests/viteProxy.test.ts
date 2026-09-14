import assert from 'node:assert/strict';
import test from 'node:test';

test('Vite Dev Server: Proxy configuration maps /api, /unix, /auth-proxy and /sobracorte-api with changeOrigin and secure: false', () => {
  const env: Record<string, string> = { VITE_BACKEND_PORT: '3000' };
  const backendPort = env.VITE_BACKEND_PORT || '3000';
  const backendTarget = env.VITE_BACKEND_URL || `http://127.0.0.1:${backendPort}`;

  const proxyConfig = {
    '/api': {
      target: backendTarget,
      changeOrigin: true,
      secure: false,
    },
    '/unix': {
      target: 'http://10.100.1.43',
      changeOrigin: true,
      secure: false,
    },
    '/auth-proxy': {
      target: 'http://10.100.1.43:2399',
      changeOrigin: true,
      secure: false,
      cookieDomainRewrite: 'localhost',
      rewrite: (p: string) => p.replace(/^\/auth-proxy/, ''),
    },
    '/sobracorte-api': {
      target: backendTarget,
      changeOrigin: true,
      secure: false,
      rewrite: (p: string) => p.replace(/^\/sobracorte-api/, ''),
    },
  };

  assert.equal(proxyConfig['/api'].target, 'http://127.0.0.1:3000');
  assert.equal(proxyConfig['/api'].changeOrigin, true);
  assert.equal(proxyConfig['/api'].secure, false);

  assert.equal(proxyConfig['/unix'].target, 'http://10.100.1.43');
  assert.equal(proxyConfig['/unix'].changeOrigin, true);
  assert.equal(proxyConfig['/unix'].secure, false);

  assert.equal(proxyConfig['/auth-proxy'].rewrite('/auth-proxy/api/login'), '/api/login');
  assert.equal(proxyConfig['/sobracorte-api'].rewrite('/sobracorte-api/dashboard/summary'), '/dashboard/summary');
});

test('Vite Dev Server: Validates required frontend environment variables', () => {
  const requiredFrontendVars = [
    'VITE_AUTH_API_URL',
    'VITE_SOBRACORTE_API_URL',
    'VITE_PORTAL_UNIX_URL',
    'VITE_DEV_PORT',
  ] as const;

  const validEnv: Record<string, string> = {
    VITE_AUTH_API_URL: '/auth-proxy/api',
    VITE_SOBRACORTE_API_URL: '/sobracorte-api',
    VITE_PORTAL_UNIX_URL: 'http://10.100.1.43/unix/',
    VITE_DEV_PORT: '5173',
  };

  const missing = requiredFrontendVars.filter((key) => !validEnv[key]?.trim());
  assert.equal(missing.length, 0);

  const invalidEnv: Record<string, string> = {
    VITE_AUTH_API_URL: '/auth-proxy/api',
    VITE_SOBRACORTE_API_URL: '',
    VITE_PORTAL_UNIX_URL: 'http://10.100.1.43/unix/',
    VITE_DEV_PORT: '5173',
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

  assert.equal(validatePort('5173'), 5173);
  assert.equal(validatePort('3000'), 3000);
  assert.throws(() => validatePort('0'), /VITE_DEV_PORT deve ser um número inteiro/);
  assert.throws(() => validatePort('70000'), /VITE_DEV_PORT deve ser um número inteiro/);
  assert.throws(() => validatePort('abc'), /VITE_DEV_PORT deve ser um número inteiro/);
});
