import assert from 'node:assert/strict';
import test from 'node:test';
import { syncUser } from '../src/controllers/AuthController';
import { tenantStorage } from '../src/context/tenantContext';
import { prisma, prismaForInternalUse } from '../src/prisma';

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
