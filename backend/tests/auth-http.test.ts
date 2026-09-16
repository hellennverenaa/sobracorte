import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { vars } from '../src/config/dotenv';

// Provedor simulado: assinatura local com chave exclusiva de teste.
const secret = 'point01-provider-test-key';
const claims: Record<string, string> = { usuario: 'USER.TESTE', matricula: '100', unidade: 'SEST' };
const issue = (payload: Record<string, unknown> = claims, key = secret) => jwt.sign(payload, key, { expiresIn: '5m' });

test('rotas reais de autenticação com provedor e persistência simulados', async (t) => {
  const previousKey = vars.PRIVATE_KEY;
  const previousAdmins = vars.GLOBAL_ADMIN_IDENTITIES;
  vars.PRIVATE_KEY = secret;
  vars.GLOBAL_ADMIN_IDENTITIES = new Set();
  let inactive = false;
  let syncCount = 0;
  let lookupCalls = 0;
  let storedIdentity: Record<string, unknown> | null = null;
  let storedBinding: Record<string, unknown> | null = null;

  const origUnitFindFirst = prisma.factoryUnit.findFirst;
  const origUserFindMany = prisma.user.findMany;
  const origIdentityFindUnique = prisma.authIdentity.findUnique;
  const origIdentityUpsert = prisma.authIdentity.upsert;
  const origBindingFindUnique = prisma.userRoleBinding.findUnique;
  const origBindingUpsert = prisma.userRoleBinding.upsert;
  const origBindingFindMany = prisma.userRoleBinding.findMany;

  (prisma.authIdentity as any).findUnique = async () => {
    lookupCalls++;
    return storedIdentity;
  };
  (prisma.factoryUnit as any).findFirst = async (args: any) => {
    return inactive ? null : ({
      id: args.where.code === 'STJ' ? 2 : 1,
      code: args.where.code,
      name: 'Unidade de teste',
      enableRequisitions: true,
    });
  };
  (prisma.authIdentity as any).upsert = async (args: any) => {
    syncCount++;
    storedIdentity = storedIdentity
      ? { ...storedIdentity, ...args.update }
      : { id: 1, ...args.create, matriculaDass: 100n };
    return storedIdentity;
  };
  (prisma.userRoleBinding as any).findUnique = async () => storedBinding;
  (prisma.userRoleBinding as any).upsert = async (args: any) => {
    storedBinding ||= { id: 1, ...args.create };
    return storedBinding;
  };
  (prisma.user as any).findMany = async () => [];
  (prisma.userRoleBinding as any).findMany = async () => storedBinding && storedIdentity
    ? [{ ...storedBinding, identity: storedIdentity }]
    : [];

  const server = http.createServer(createApp({ corsOrigins: ['http://localhost'] }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const check = (headers: Record<string, string> = {}) => fetch(`${url}/auth/check-user`, {
    method: 'POST', headers,
  });
  const listUsers = (headers: Record<string, string> = {}) => fetch(`${url}/users`, { headers });
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
      const response = await check({ Authorization: `Bearer ${issue({ ...claims, role: 'admin', assignedSector: 'CORTE' })}`, Cookie: 'token=old-cookie' });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.user.usuario, claims.usuario);
      assert.equal(body.user.matriculaDass, 100);
      assert.equal(body.user.role, 'leitor', 'claims do provedor não concedem papel local');
      assert.equal(body.identity.authUserId, claims.usuario);
      assert.equal(body.binding.role, 'leitor');
      assert.equal(body.effectiveContext.identityId, body.identity.id);
      assert.equal(body.effectiveContext.bindingId, body.binding.id);
      assert.equal(body.nativeUnit.code, 'SEST');
      assert.equal(body.unit.code, 'SEST');
      assert.equal(body.isGlobalAdmin, false);
    });
    await t.test('RBAC usa somente vínculo local e ignora papel recebido no token', async () => {
      const providerAdmin = { Authorization: `Bearer ${issue({ ...claims, role: 'admin', assignedSector: 'CORTE' })}` };
      assert.equal((await listUsers(providerAdmin)).status, 403);

      storedIdentity = {
        id: 7,
        nativeUnitId: 1,
        authOrigin: 'LEGADO',
        authUserId: claims.usuario,
        usuario: claims.usuario,
        nome: 'Admin local',
        email: 'admin@teste.local',
        matriculaDass: 100n,
      };
      storedBinding = {
        id: 7,
        identityId: 7,
        factoryUnitId: 1,
        role: 'admin',
        assignedSector: null,
      };
      assert.equal((await listUsers({ Authorization: `Bearer ${issue()}` })).status, 200);
      storedIdentity = null;
      storedBinding = null;
    });
    await t.test('cookie válido funciona apenas sem Authorization; Bearer inválido não usa cookie', async () => {
      assert.equal((await check({ Cookie: `token=${issue()}` })).status, 200);
      for (const authorization of ['Bearer invalid', 'Basic abc', 'Bearer']) {
        assert.equal((await check({ Authorization: authorization, Cookie: `token=${issue()}` })).status, 401);
      }
    });
    await t.test('troca de fábrica é negada a usuário comum e permitida apenas ao admin global configurado', async () => {
      const headers = { Authorization: `Bearer ${issue()}`, 'X-Dass-Unit': 'STJ' };
      assert.equal((await check(headers)).status, 403);
      vars.GLOBAL_ADMIN_IDENTITIES = new Set(['SEST:100']);
      assert.equal((await check(headers)).status, 200);
      vars.GLOBAL_ADMIN_IDENTITIES = new Set();
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
    (prisma.factoryUnit as any).findFirst = origUnitFindFirst;
    (prisma.user as any).findMany = origUserFindMany;
    (prisma.authIdentity as any).findUnique = origIdentityFindUnique;
    (prisma.authIdentity as any).upsert = origIdentityUpsert;
    (prisma.userRoleBinding as any).findUnique = origBindingFindUnique;
    (prisma.userRoleBinding as any).upsert = origBindingUpsert;
    (prisma.userRoleBinding as any).findMany = origBindingFindMany;
    vars.PRIVATE_KEY = previousKey;
    vars.GLOBAL_ADMIN_IDENTITIES = previousAdmins;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
