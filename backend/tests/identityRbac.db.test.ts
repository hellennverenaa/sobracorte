import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { syncUser, LegacyIdentityConflictError } from '../src/controllers/AuthController';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { vars } from '../src/config/dotenv';
import { userService, UserNotFoundError } from '../src/services/UserService';
import { tenantStorage } from '../src/context/tenantContext';
import { prisma, prismaForInternalUse } from '../src/prisma';
after(async () => { await prisma.$disconnect(); });

const hasDisposableDatabase = Boolean(process.env.TEST_DATABASE_URL)
  && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;

const externalUser = {
  usuario: 'CICLO2.TESTE', matricula: '900100', unidade: 'T1', origem: 'EXTERNO',
  id: 'provider-ciclo-2', nome: 'Usuário Ciclo 2', email: 'ciclo2@teste.local',
} as any;

test('identidade e RBAC permanecem separados em PostgreSQL', {
  skip: hasDisposableDatabase ? false : 'exige TEST_DATABASE_URL igual a DATABASE_URL para banco descartável',
}, async () => {
  const suffix = `${process.pid}_${Date.now()}`;
  const nativeUnit = await prismaForInternalUse.factoryUnit.create({
    data: { code: `N_${suffix}`, name: 'Native identity unit' },
  });
  const visitedUnit = await prismaForInternalUse.factoryUnit.create({
    data: { code: `V_${suffix}`, name: 'Visited identity unit' },
  });

  await tenantStorage.run({ tenantId: nativeUnit.id }, async () => {
    await Promise.all([
      syncUser(externalUser, nativeUnit.id, nativeUnit.id, false),
      syncUser(externalUser, nativeUnit.id, nativeUnit.id, false),
    ]);
  });

  const identity = await prismaForInternalUse.authIdentity.findUniqueOrThrow({
    where: {
      nativeUnitId_authOrigin_authUserId: {
        nativeUnitId: nativeUnit.id,
        authOrigin: 'EXTERNO',
        authUserId: 'provider-ciclo-2',
      },
    },
  });
  const bindings = await prismaForInternalUse.userRoleBinding.findMany({
    where: { identityId: identity.id },
  });
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].factoryUnitId, nativeUnit.id);

  await prismaForInternalUse.userRoleBinding.update({
    where: { id: bindings[0].id },
    data: { role: 'lider', assignedSector: 'CORTE' },
  });
  await tenantStorage.run({ tenantId: nativeUnit.id }, () =>
    syncUser({ ...externalUser, nome: 'Nome sincronizado' }, nativeUnit.id, nativeUnit.id, false),
  );
  const preserved = await prismaForInternalUse.userRoleBinding.findUniqueOrThrow({
    where: { id: bindings[0].id },
  });
  assert.equal(preserved.role, 'lider');
  assert.equal(preserved.assignedSector, 'CORTE');

  await tenantStorage.run({ tenantId: visitedUnit.id }, () =>
    syncUser(externalUser, nativeUnit.id, visitedUnit.id, true),
  );
  assert.equal(await prismaForInternalUse.userRoleBinding.count({
    where: { identityId: identity.id, factoryUnitId: visitedUnit.id },
  }), 0);

  await tenantStorage.run({ tenantId: nativeUnit.id }, () =>
    syncUser({ ...externalUser, origem: 'LEGADO', id: 'provider-ciclo-2' }, nativeUnit.id, nativeUnit.id, false),
  );
  assert.equal(await prismaForInternalUse.authIdentity.count({
    where: { nativeUnitId: nativeUnit.id, authUserId: 'provider-ciclo-2' },
  }), 2);
});

test('bootstrap legado respeita ID estável e recusa ambiguidade em PostgreSQL', {
  skip: hasDisposableDatabase ? false : 'exige banco descartável explícito',
}, async () => {
  const unit = await prismaForInternalUse.factoryUnit.create({
    data: { code: `C7_LEG_${process.pid}_${Date.now()}`, name: 'Legacy bootstrap' },
  });
  const user = { ...externalUser, origem: 'LEGADO', id: 'right-id' };
  await prismaForInternalUse.user.create({ data: {
    factoryUnitId: unit.id, authOrigin: 'LEGADO', authUserId: 'wrong-id',
    usuario: user.usuario, matriculaDass: 900100n, nome: 'Wrong identity', email: 'wrong@test.local', role: 'admin',
  } });
  await tenantStorage.run({ tenantId: unit.id }, async () => {
    const result = await syncUser(user, unit.id, unit.id, false);
    assert.equal(result.binding.role, 'leitor');
    await prismaForInternalUse.user.create({ data: {
      factoryUnitId: unit.id, authOrigin: 'LEGADO', authUserId: 'renamed-id',
      usuario: 'OLD.NAME', matriculaDass: 111n, nome: 'Renamed identity', email: 'renamed@test.local', role: 'lider', assignedSector: 'APOIO',
    } });
    const renamed = await syncUser({ ...user, id: 'renamed-id' }, unit.id, unit.id, false);
    assert.equal(renamed.binding.role, 'lider');
    assert.equal(renamed.binding.assignedSector, 'APOIO');
    for (const usuario of ['AMBIG.ONE', 'AMBIG.TWO']) await prismaForInternalUse.user.create({ data: {
      factoryUnitId: unit.id, usuario, matriculaDass: 222n, nome: 'Ambiguous identity', email: 'ambiguous@test.local', role: 'admin',
    } });
    await assert.rejects(syncUser({ ...user, id: 'ambiguous-id', matricula: '222' }, unit.id, unit.id, false), LegacyIdentityConflictError);
    assert.equal(await prismaForInternalUse.authIdentity.count({ where: { nativeUnitId: unit.id, authUserId: 'ambiguous-id' } }), 0);
  });
});

test('HTTP real usa RBAC atual, nega troca comum e não cria vínculos em visitas globais repetidas', {
  skip: hasDisposableDatabase ? false : 'exige banco descartável explícito',
}, async () => {
  const suffix = `${process.pid}_${Date.now()}`;
  const [native, visited] = await Promise.all(['N', 'V'].map(code => prismaForInternalUse.factoryUnit.create({
    data: { code: `C7_HTTP_${code}_${suffix}`, name: `HTTP identity ${code}` },
  })));
  const [ownItem] = await Promise.all(['CORTE', 'APOIO'].map(sector => prismaForInternalUse.stockItem.create({
    data: { factoryUnitId: native.id, sector: sector as 'CORTE' | 'APOIO', code: `HTTP_${sector}`, name: sector, color: sector === 'CORTE' ? 'LOCAL' : 'SECRET' },
  })));
  const previousKey = vars.PRIVATE_KEY;
  const previousAdmins = vars.GLOBAL_ADMIN_IDENTITIES;
  const secret = 'cycle7-local-provider-test-key';
  vars.PRIVATE_KEY = secret;
  vars.GLOBAL_ADMIN_IDENTITIES = new Set();
  const claims = { ...externalUser, unidade: native.code, role: 'admin', assignedSector: 'APOIO' };
  const token = jwt.sign(claims, secret, { expiresIn: '5m' });
  const server = http.createServer(createApp({ corsOrigins: ['http://localhost'] }));
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const request = (path: string, options: { unit?: string; token?: string; cookie?: string; method?: string } = {}) => fetch(`${base}${path}`, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${options.token ?? token}`, ...(options.unit ? { 'X-Dass-Unit': options.unit } : {}), ...(options.cookie ? { Cookie: options.cookie } : {}) },
    });
    const check = await request('/auth/check-user', { method: 'POST' });
    assert.equal(check.status, 200);
    const synced = await check.json();
    assert.equal(synced.user.role, 'leitor');
    assert.equal((await request('/users')).status, 403);
    await prismaForInternalUse.userRoleBinding.update({ where: { id: synced.binding.id }, data: { role: 'admin' } });
    assert.equal((await request('/users')).status, 200);
    await prismaForInternalUse.userRoleBinding.update({ where: { id: synced.binding.id }, data: { role: 'leitor', assignedSector: 'CORTE' } });
    assert.equal((await request('/users')).status, 403, 'revogação local vale na próxima requisição');
    const restrictedSearch = await request('/inventory/search?sector=APOIO');
    assert.equal(restrictedSearch.status, 200, 'consulta força o setor local, conforme contrato vigente');
    const inventory = await restrictedSearch.json();
    assert.deepEqual(inventory.sectors.corte.data.map((item: any) => item.id), [ownItem.id]);
    assert.deepEqual(inventory.sectors.apoio.data, []);
    const combinations = await request('/inventory/combinations?sector=APOIO');
    assert.equal(combinations.status, 200);
    assert.deepEqual(await combinations.json(), ['LOCAL']);
    assert.equal((await request('/inventory/search?sector=CORTE')).status, 200);
    assert.equal((await request('/auth/check-user', { method: 'POST', unit: visited.code })).status, 403);
    assert.equal((await request('/auth/check-user', { method: 'POST', token: jwt.sign(claims, secret, { expiresIn: -1 }) })).status, 401);
    assert.equal((await request('/auth/check-user', { method: 'POST', token: 'invalid', cookie: `token=${token}` })).status, 401);
    vars.GLOBAL_ADMIN_IDENTITIES = new Set([`${native.code}:900100`]);
    for (const unit of [visited.code, native.code, visited.code, native.code]) {
      const response = await request('/auth/check-user', { method: 'POST', unit });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.identity.id, synced.identity.id);
      assert.equal(body.identity.nativeUnitId, native.id);
      assert.equal(body.unit.code, unit);
      assert.equal(body.binding, null);
      assert.equal(body.user.role, 'admin');
    }
    assert.equal(await prismaForInternalUse.userRoleBinding.count({ where: { identityId: synced.identity.id, factoryUnitId: visited.id } }), 0);
    await prismaForInternalUse.factoryUnit.update({ where: { id: visited.id }, data: { active: false } });
    assert.equal((await request('/auth/check-user', { method: 'POST', unit: visited.code })).status, 403);
    await tenantStorage.run({ tenantId: visited.id }, async () => {
      await assert.rejects(userService.updateUserRole(prisma, {
        targetUserId: synced.binding.id, factoryUnitId: visited.id, newRole: 'lider', newSector: 'APOIO',
        actor: { usuario: 'C7.ADMIN', nome: 'Test admin', isGlobalAdmin: true },
      }), UserNotFoundError);
    });
    const preserved = await prismaForInternalUse.userRoleBinding.findUniqueOrThrow({ where: { id: synced.binding.id } });
    assert.equal(preserved.role, 'leitor');
    assert.equal(preserved.assignedSector, 'CORTE');
  } finally {
    vars.PRIVATE_KEY = previousKey;
    vars.GLOBAL_ADMIN_IDENTITIES = previousAdmins;
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
