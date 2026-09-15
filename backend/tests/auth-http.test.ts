import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { prisma, prismaWithoutTenant } from '../src/prisma';
import { vars } from '../src/config/dotenv';

// Provedor simulado: assinatura local com chave exclusiva de teste.
const secret = 'point01-provider-test-key';
const claims = { usuario: 'USER.TESTE', matricula: '100', unidade: 'SEST' };
const issue = (payload = claims, key = secret) => jwt.sign(payload, key, { expiresIn: '5m' });

test('rotas reais de autenticação com provedor e persistência simulados', async (t) => {
  const previousKey = vars.PRIVATE_KEY;
  const previousAdmins = vars.GLOBAL_ADMIN_REGISTRATIONS;
  vars.PRIVATE_KEY = secret;
  vars.GLOBAL_ADMIN_REGISTRATIONS = new Set();
  let dbAdmin = false;
  let inactive = false;
  let syncCount = 0;
  let lookupCalls = 0;

  const origUserFindFirst = prismaWithoutTenant.user.findFirst;
  const origUnitFindFirst = prisma.factoryUnit.findFirst;
  const origUserUpsert = prisma.user.upsert;

  (prismaWithoutTenant.user as any).findFirst = async (args: any) => {
    lookupCalls++;
    return dbAdmin ? { role: 'admin' } : null;
  };
  (prisma.factoryUnit as any).findFirst = async (args: any) => {
    return inactive ? null : ({
      id: args.where.code === 'STJ' ? 2 : 1,
      code: args.where.code,
      name: 'Unidade de teste',
      enableRequisitions: true,
    });
  };
  (prisma.user as any).upsert = async (args: any) => {
    syncCount++;
    return { id: 1, ...args.create, matriculaDass: 100n };
  };

  const server = http.createServer(createApp({ corsOrigins: ['http://localhost'] }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const check = (headers: Record<string, string> = {}) => fetch(`${url}/auth/check-user`, {
    method: 'POST', headers,
  });
  try {
    await t.test('login local não emite token nem consulta/grava usuário', async () => {
      for (const body of [{ usuario: 'USER.TESTE', unitCode: 'SEST' }, { username: '100', factoryUnitId: 1 }]) {
        const response = await fetch(`${url}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          error: 'Login local desabilitado. Autentique-se pelo serviço oficial de autenticação.',
        });
        assert.equal(response.headers.get('set-cookie'), null);
      }
      assert.equal(lookupCalls, 0);
      assert.equal(syncCount, 0);
    });
    await t.test('ausente, malformado, expirado e assinatura incorreta retornam 401 sem DB', async () => {
      for (const token of [undefined, 'invalid', issue(claims, 'wrong'), jwt.sign(claims, secret, { expiresIn: -1 })]) {
        const response = await check(token ? { Authorization: `Bearer ${token}` } : {});
        assert.equal(response.status, 401);
        if (token?.includes('.') && jwt.decode(token) && (jwt.decode(token) as any).exp < Date.now() / 1000) {
          assert.equal((await response.json()).expired, true);
        }
      }
      assert.equal(lookupCalls, 0);
      assert.equal(syncCount, 0);
    });
    await t.test('Bearer renovado prevalece sobre cookie antigo e preserva sincronização', async () => {
      const response = await check({ Authorization: `Bearer ${issue()}`, Cookie: 'token=old-cookie' });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.user.usuario, claims.usuario);
      assert.equal(body.user.matriculaDass, 100);
      assert.equal(body.user.role, 'leitor');
      assert.equal(body.unit.code, 'SEST');
      assert.equal(body.isGlobalAdmin, false);
    });
    await t.test('cookie válido funciona apenas sem Authorization; Bearer inválido não usa cookie', async () => {
      assert.equal((await check({ Cookie: `token=${issue()}` })).status, 200);
      for (const authorization of ['Bearer invalid', 'Basic abc', 'Bearer']) {
        assert.equal((await check({ Authorization: authorization, Cookie: `token=${issue()}` })).status, 401);
      }
    });
    await t.test('troca de fábrica negada a usuário comum e mantida para admins configurados ou locais', async () => {
      const headers = { Authorization: `Bearer ${issue()}`, 'X-Dass-Unit': 'STJ' };
      assert.equal((await check(headers)).status, 403);
      vars.GLOBAL_ADMIN_REGISTRATIONS = new Set([100]);
      assert.equal((await check(headers)).status, 200);
      vars.GLOBAL_ADMIN_REGISTRATIONS = new Set();
      dbAdmin = true;
      assert.equal((await check(headers)).status, 200);
      // Admin identificado pelo usuário pode selecionar unidade mesmo sem matrícula/unidade no JWT.
      assert.equal((await check({ Authorization: `Bearer ${jwt.sign({ usuario: claims.usuario }, secret, { expiresIn: '5m' })}`, 'X-Dass-Unit': 'STJ' })).status, 200);
      dbAdmin = false;
      inactive = true;
      assert.equal((await check({ Authorization: `Bearer ${issue()}` })).status, 403);
      inactive = false;
    });
    await t.test('configuração ausente falha fechada', async () => {
      vars.PRIVATE_KEY = undefined;
      assert.equal((await check({ Authorization: `Bearer ${issue()}` })).status, 500);
      vars.PRIVATE_KEY = secret;
    });
  } finally {
    (prismaWithoutTenant.user as any).findFirst = origUserFindFirst;
    (prisma.factoryUnit as any).findFirst = origUnitFindFirst;
    (prisma.user as any).upsert = origUserUpsert;
    vars.PRIVATE_KEY = previousKey;
    vars.GLOBAL_ADMIN_REGISTRATIONS = previousAdmins;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
