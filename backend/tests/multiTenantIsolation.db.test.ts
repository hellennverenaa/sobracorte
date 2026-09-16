import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma, prismaForInternalUse, TenantGuardError } from '../src/prisma';
import { tenantStorage } from '../src/context/tenantContext';

const hasDisposableDatabase = Boolean(process.env.TEST_DATABASE_URL)
  && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;

test('TenantGuard isola operações reais entre duas unidades', {
  skip: hasDisposableDatabase ? false : 'exige TEST_DATABASE_URL igual a DATABASE_URL para banco descartável',
}, async () => {
  const suffix = `${process.pid}_${Date.now()}`;
  const [tenantOne, tenantTwo] = await Promise.all([
    prismaForInternalUse.factoryUnit.create({
      data: { code: `T1_${suffix}`, name: 'Tenant Test One' },
    }),
    prismaForInternalUse.factoryUnit.create({
      data: { code: `T2_${suffix}`, name: 'Tenant Test Two' },
    }),
  ]);

  const foreign = await prismaForInternalUse.material.create({
    data: {
      factoryUnitId: tenantTwo.id,
      code: `FOREIGN_${suffix}`,
      name: 'Foreign material',
      unit: 'M2',
      type: 'TEST',
    },
  });

  await tenantStorage.run({ tenantId: tenantOne.id }, async () => {
    const local = await prisma.material.create({
      data: {
        factoryUnitId: tenantOne.id,
        code: `LOCAL_${suffix}`,
        name: 'Local material',
        unit: 'M2',
        type: 'TEST',
      },
    });

    assert.deepEqual((await prisma.material.findMany()).map((item) => item.id), [local.id]);

    await assert.rejects(
      prisma.material.create({
        data: {
          factoryUnitId: tenantTwo.id,
          code: `CROSS_CREATE_${suffix}`,
          name: 'Cross create',
          unit: 'M2',
          type: 'TEST',
        },
      }),
      TenantGuardError,
    );
    await assert.rejects(
      prisma.material.createMany({
        data: [{
          factoryUnitId: tenantTwo.id,
          code: `CROSS_BATCH_${suffix}`,
          name: 'Cross batch',
          unit: 'M2',
          type: 'TEST',
        }],
      }),
      TenantGuardError,
    );

    for (const operation of [
      () => prisma.material.findUnique({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
      }),
      () => prisma.material.update({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
        data: { name: 'Cross update' },
      }),
      () => prisma.material.delete({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
      }),
      () => prisma.material.upsert({
        where: { factoryUnitId_code: { factoryUnitId: tenantTwo.id, code: foreign.code } },
        update: { name: 'Cross upsert' },
        create: {
          factoryUnitId: tenantTwo.id,
          code: foreign.code,
          name: 'Cross upsert',
          unit: 'M2',
          type: 'TEST',
        },
      }),
    ]) {
      await assert.rejects(operation(), TenantGuardError);
    }

    await assert.rejects(
      prisma.$transaction((tx) => tx.material.update({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
        data: { name: 'Cross transaction' },
      })),
      TenantGuardError,
    );

    const localUpsert = await prisma.material.upsert({
      where: { factoryUnitId_code: { factoryUnitId: tenantOne.id, code: local.code } },
      update: { name: 'Local material updated' },
      create: {
        factoryUnitId: tenantOne.id,
        code: local.code,
        name: 'Local material updated',
        unit: 'M2',
        type: 'TEST',
      },
    });
    assert.equal(localUpsert.factoryUnitId, tenantOne.id);
    assert.equal(localUpsert.name, 'Local material updated');
  });

  const unchangedForeign = await prismaForInternalUse.material.findUniqueOrThrow({
    where: { id: foreign.id },
  });
  assert.equal(unchangedForeign.name, 'Foreign material');
});
