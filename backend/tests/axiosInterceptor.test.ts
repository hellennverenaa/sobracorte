import test from 'node:test';
import assert from 'node:assert/strict';

test('Interceptor Axios: Sobrescrita de cabeçalho Authorization em requisições concorrentes pós-refresh', async () => {
  // Mock do localStorage
  const storage: Record<string, string> = {
    user: JSON.stringify({
      id: 1,
      usuario: 'OPERADOR01',
      token: 'old-expired-token-123',
      unit: { code: 'UNIDADE_01' }
    })
  };

  // Simulação de fila de requisições concorrentes
  type QueueItem = {
    resolve: () => void;
    reject: (reason: unknown) => void;
  };
  let queue: QueueItem[] = [];
  let isRefreshing = false;

  const enqueue = () => {
    return new Promise<void>((resolve, reject) => queue.push({ resolve, reject }));
  };

  // Requisições paralelas que chegam com o token antigo
  const reqA: { url: string; headers: Record<string, string>; _retry?: boolean } = {
    url: '/dashboard/summary',
    headers: { Authorization: 'Bearer old-expired-token-123', 'X-Dass-Unit': 'UNIDADE_01' }
  };
  const reqB: { url: string; headers: Record<string, string>; _retry?: boolean } = {
    url: '/materials',
    headers: { Authorization: 'Bearer old-expired-token-123', 'X-Dass-Unit': 'UNIDADE_01' }
  };
  const reqC: { url: string; headers: Record<string, string>; _retry?: boolean } = {
    url: '/stock-items',
    headers: { Authorization: 'Bearer old-expired-token-123', 'X-Dass-Unit': 'UNIDADE_01' }
  };

  // Simula reqA iniciando o refresh
  reqA._retry = true;
  isRefreshing = true;

  // Função simulada para processar requisições concorrentes (reqB e reqC)
  const processConcurrentRequest = async (req: typeof reqB) => {
    req._retry = true;
    if (isRefreshing) {
      await enqueue();
      const refreshedUser = JSON.parse(storage['user'] || '{}');
      if (refreshedUser.token) {
        req.headers = req.headers || {};
        req.headers.Authorization = `Bearer ${refreshedUser.token}`;
        if (refreshedUser.unit?.code) {
          req.headers['X-Dass-Unit'] = refreshedUser.unit.code;
        }
      }
      return req;
    }
    return req;
  };

  // Dispara reqB e reqC em paralelo enquanto reqA está em refresh
  const promiseB = processConcurrentRequest(reqB);
  const promiseC = processConcurrentRequest(reqC);

  assert.equal(queue.length, 2, 'ReqB e ReqC devem estar enfileiradas aguardando o refresh');

  // ReqA conclui o refresh com novo token
  const newToken = 'new-refreshed-token-999';
  const currentUser = JSON.parse(storage['user']);
  storage['user'] = JSON.stringify({ ...currentUser, token: newToken });

  // ReqA atualiza seu próprio cabeçalho
  reqA.headers.Authorization = `Bearer ${newToken}`;

  // Descarrega a fila
  queue.forEach(p => p.resolve());
  queue = [];
  isRefreshing = false;

  const [resB, resC] = await Promise.all([promiseB, promiseC]);

  // Validações
  assert.equal(reqA.headers.Authorization, 'Bearer new-refreshed-token-999', 'ReqA deve ter o novo token');
  assert.equal(resB.headers.Authorization, 'Bearer new-refreshed-token-999', 'ReqB enfileirada deve ter o cabeçalho sobrescrito com o novo token');
  assert.equal(resC.headers.Authorization, 'Bearer new-refreshed-token-999', 'ReqC enfileirada deve ter o cabeçalho sobrescrito com o novo token');
  assert.equal(reqA._retry, true);
  assert.equal(reqB._retry, true);
  assert.equal(reqC._retry, true);
});

test('Interceptor Axios: Rejeição em cascata quando a renovação da sessão falha', async () => {
  const storage: Record<string, string> = {
    user: JSON.stringify({
      id: 1,
      usuario: 'OPERADOR01',
      token: 'expired-token'
    })
  };

  type QueueItem = {
    resolve: () => void;
    reject: (reason: unknown) => void;
  };
  let queue: QueueItem[] = [];
  let isRefreshing = true;

  const enqueue = () => {
    return new Promise<void>((resolve, reject) => queue.push({ resolve, reject }));
  };

  const reqB = { headers: { Authorization: 'Bearer expired-token' } };
  const reqC = { headers: { Authorization: 'Bearer expired-token' } };

  const promiseB = (async () => {
    await enqueue();
    return reqB;
  })();

  const promiseC = (async () => {
    await enqueue();
    return reqC;
  })();

  assert.equal(queue.length, 2);

  // Simula erro no refresh de token
  const refreshError = new Error('Sessão expirada no servidor de autenticação');
  queue.forEach(p => p.reject(refreshError));
  queue = [];
  delete storage['user'];
  isRefreshing = false;

  await assert.rejects(promiseB, /Sessão expirada no servidor de autenticação/);
  await assert.rejects(promiseC, /Sessão expirada no servidor de autenticação/);
  assert.equal(storage['user'], undefined, 'Sessão do usuário deve ser limpa');
});
