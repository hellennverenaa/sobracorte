import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { prisma, prismaForInternalUse, TenantGuardError } from '../src/prisma';
import { tenantStorage } from '../src/context/tenantContext';
import { DashboardController } from '../src/controllers/DashboardController';
import { MountingPairService } from '../src/services/MountingPairService';
after(async () => { await prisma.$disconnect(); });

const hasDisposableDatabase = Boolean(process.env.TEST_DATABASE_URL)
  && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;

test('SQL bruto de pares e dashboard mantém unidade, setor e joins locais', {
  skip: hasDisposableDatabase ? false : 'exige banco descartável explícito',
}, async () => {
  const suffix = `${process.pid}_${Date.now()}`;
  const units = await Promise.all(['LOCAL', 'FOREIGN'].map(code => prismaForInternalUse.factoryUnit.create({
    data: { code: `C7_SQL_${code}_${suffix}`, name: code },
  })));
  const fixtures = await Promise.all(units.map(async (unit, index) => {
    await prismaForInternalUse.unitConfig.create({ data: { factoryUnitId: unit.id, symbol: 'UND', name: 'Unit' } });
    const location = await prismaForInternalUse.location.create({ data: { factoryUnitId: unit.id, name: index ? 'FOREIGN.LOCATION' : 'LOCAL.LOCATION', sector: 'MONTAGEM' } });
    const items = await Promise.all(['E', 'D'].map(async side => {
      const item = await prismaForInternalUse.stockItem.create({ data: {
        factoryUnitId: unit.id, sector: 'MONTAGEM', sku: 'SAME.SKU', productName: 'Same model', sizeGrade: '40', color: 'BLACK', unit: 'UND', footSide: side as 'E' | 'D', quantity: index ? 99 : 2,
      } });
      await prismaForInternalUse.stockItemLocation.create({ data: { factoryUnitId: unit.id, stockItemId: item.id, locationId: location.id, quantity: index ? 99 : 2 } });
      return item;
    }));
    await prismaForInternalUse.stockItem.create({ data: { factoryUnitId: unit.id, sector: 'CORTE', code: 'OTHER.SECTOR', name: 'Other sector', unit: 'M2', quantity: 77 } });
    return items;
  }));
  await tenantStorage.run({ tenantId: units[0].id }, async () => {
    const pairs = await new MountingPairService().findMatchingPairs(units[0].id, 'MONTAGEM');
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].leftFootStockItemId, fixtures[0][0].id);
    assert.equal(pairs[0].rightFootStockItemId, fixtures[0][1].id);
    assert.equal(pairs[0].formablePairs, 2);
    assert.equal(pairs[0].leftLocations, 'LOCAL.LOCATION');
    assert.equal(pairs[0].rightLocations, 'LOCAL.LOCATION');
    for (const role of ['admin', 'lider']) {
      let status = 200;
      let body: any;
      const res: any = { status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; } };
      await new DashboardController().getSummary({ tenant: { id: units[0].id }, user: { role, assignedSector: 'MONTAGEM' } } as any, res);
      assert.equal(status, 200);
      assert.equal(body.stats.totalParesFormaveis, 2);
      assert.equal(body.setores.montagem.totalQuantity, 4);
      assert.deepEqual(body.topMateriais.filter((item: any) => item.sector === 'MONTAGEM').map((item: any) => item.id).sort(), fixtures[0].map(item => item.id).sort());
      assert.ok(body.topMateriais.every((item: any) => !fixtures[1].some(foreign => foreign.id === item.id)));
      if (role === 'lider') {
        assert.equal(body.stats.totalItems, 2);
        assert.ok(body.topMateriais.every((item: any) => item.sector === 'MONTAGEM'));
        assert.equal(body.setores.corte.totalQuantity, null);
      }
    }
  });
});

test('modelos canônicos isolam leituras, escritas singulares, lotes e rollback real', {
  skip: hasDisposableDatabase ? false : 'exige TEST_DATABASE_URL igual a DATABASE_URL para banco descartável',
}, async (t) => {
  const suffix = `${process.pid}_${Date.now()}`;
  const units = await Promise.all(['A', 'B'].map(code => prismaForInternalUse.factoryUnit.create({
    data: { code: `C7_${code}_${suffix}`, name: `Canonical isolation ${code}` },
  })));
  const fixtures = await Promise.all(units.map(async unit => {
    const item = await prismaForInternalUse.stockItem.create({
      data: { factoryUnitId: unit.id, sector: 'CORTE', code: `C7_${suffix}`, name: 'Canonical item', quantity: 1, unit: 'M2' },
    });
    const location = await prismaForInternalUse.location.create({
      data: { factoryUnitId: unit.id, name: `C7_${suffix}`, sector: 'CORTE' },
    });
    const link = await prismaForInternalUse.stockItemLocation.create({
      data: { factoryUnitId: unit.id, stockItemId: item.id, locationId: location.id, quantity: 1 },
    });
    const movement = await prismaForInternalUse.stockMovement.create({
      data: { factoryUnitId: unit.id, stockItemId: item.id, sector: 'CORTE', type: 'ENTRADA', quantity: 1, reason: 'original' },
    });
    const identity = await prismaForInternalUse.authIdentity.create({
      data: { nativeUnitId: unit.id, authOrigin: 'EXTERNO', authUserId: suffix, usuario: 'C7.ISOLATION', nome: 'Isolation', email: 'isolation@test.local' },
    });
    const binding = await prismaForInternalUse.userRoleBinding.create({
      data: { factoryUnitId: unit.id, identityId: identity.id, role: 'leitor', assignedSector: 'CORTE' },
    });
    return { item, link, movement, binding };
  }));
  const [local, foreign] = fixtures;
  const models = [
    { name: 'StockItem', delegate: prisma.stockItem, internal: prismaForInternalUse.stockItem, local: local.item, foreign: foreign.item, selector: (row: any) => ({ id_factoryUnitId: { id: row.id, factoryUnitId: row.factoryUnitId } }), filter: (row: any) => ({ id: row.id }), change: { name: 'changed' }, field: 'name' },
    { name: 'StockItemLocation', delegate: prisma.stockItemLocation, internal: prismaForInternalUse.stockItemLocation, local: local.link, foreign: foreign.link, selector: (row: any) => ({ stockItemId_locationId_factoryUnitId: { stockItemId: row.stockItemId, locationId: row.locationId, factoryUnitId: row.factoryUnitId } }), filter: (row: any) => ({ stockItemId: row.stockItemId, locationId: row.locationId }), change: { quantity: 2 }, field: 'quantity' },
    { name: 'StockMovement', delegate: prisma.stockMovement, internal: prismaForInternalUse.stockMovement, local: local.movement, foreign: foreign.movement, selector: (row: any) => ({ id: row.id, factoryUnitId: row.factoryUnitId }), filter: (row: any) => ({ id: row.id }), change: { reason: 'changed' }, field: 'reason' },
    { name: 'UserRoleBinding', delegate: prisma.userRoleBinding, internal: prismaForInternalUse.userRoleBinding, local: local.binding, foreign: foreign.binding, selector: (row: any) => ({ identityId_factoryUnitId: { identityId: row.identityId, factoryUnitId: row.factoryUnitId } }), filter: (row: any) => ({ id: row.id }), change: { role: 'lider' }, field: 'role' },
  ];
  for (const model of models) await t.test(model.name, async () => {
    const delegate = model.delegate as any;
    await tenantStorage.run({ tenantId: units[0].id }, async () => {
      const where = { OR: [model.filter(model.local), model.filter(model.foreign)] };
      const found = await delegate.findMany({ where });
      assert.equal(found.length, 1);
      assert.equal(found[0].factoryUnitId, units[0].id);
      assert.equal(await delegate.count({ where }), 1);
      assert.equal((await delegate.aggregate({ where, _count: { _all: true } }))._count._all, 1);
      assert.equal((await delegate.groupBy({ by: ['factoryUnitId'], where, _count: { _all: true } }))[0].factoryUnitId, units[0].id);
      assert.ok(await delegate.findUnique({ where: model.selector(model.local) }));
      assert.equal(await delegate.findFirst({ where: model.filter(model.foreign) }), null);
      for (const op of ['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']) {
        const args = { where: model.selector(model.foreign), data: model.change, update: model.change, create: model.foreign };
        await assert.rejects(delegate[op](args), TenantGuardError);
      }
      await assert.rejects(delegate.findUnique({ where: model.filter(model.local) }), TenantGuardError);
      for (const op of ['create', 'createMany', 'createManyAndReturn']) {
        await assert.rejects(delegate[op]({ data: model.foreign }), TenantGuardError);
      }
      assert.equal((await delegate.updateMany({ where: model.filter(model.foreign), data: model.change })).count, 0);
      assert.deepEqual(await delegate.updateManyAndReturn({ where: model.filter(model.foreign), data: model.change }), []);
      assert.equal((await delegate.deleteMany({ where: model.filter(model.foreign) })).count, 0);
      const updated = await delegate.updateManyAndReturn({ where, data: model.change });
      assert.equal(updated.length, 1);
      assert.equal(updated[0].factoryUnitId, units[0].id);
      await assert.rejects(prisma.$transaction(async tx => {
        const txDelegate = (tx as any)[model.name[0].toLowerCase() + model.name.slice(1)];
        await txDelegate.update({ where: model.selector(model.local), data: { [model.field]: model.local[model.field as keyof typeof model.local] } });
        await txDelegate.delete({ where: model.selector(model.foreign) });
      }), TenantGuardError);
      const afterRollback = await delegate.findUnique({ where: model.selector(model.local) });
      assert.equal(String(afterRollback[model.field]), String(updated[0][model.field]));
      await assert.rejects(prisma.$transaction([
        delegate.update({ where: model.selector(model.local), data: { [model.field]: model.local[model.field as keyof typeof model.local] } }),
        delegate.delete({ where: model.selector(model.foreign) }),
      ]), TenantGuardError);
      assert.equal(String((await delegate.findUnique({ where: model.selector(model.local) }))[model.field]), String(updated[0][model.field]));
    });
    const unchanged = await (model.internal as any).findFirstOrThrow({ where: model.filter(model.foreign) });
    assert.equal(String(unchanged[model.field]), String(model.foreign[model.field as keyof typeof model.foreign]));
  });
  await tenantStorage.run({ tenantId: units[0].id }, async () => {
    await assert.rejects(prisma.stockItemLocation.create({
      data: { factoryUnitId: units[0].id, stockItemId: local.item.id, locationId: foreign.link.locationId, quantity: 1 },
    }), (error: any) => error.code === 'P2003');
  });
});

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

  const foreign = await prismaForInternalUse.stockItem.create({
    data: {
      factoryUnitId: tenantTwo.id,
      code: `FOREIGN_${suffix}`,
      name: 'Foreign material',
      unit: 'M2',
      type: 'TEST',
    },
  });

  await tenantStorage.run({ tenantId: tenantOne.id }, async () => {
    const local = await prisma.stockItem.create({
      data: {
        factoryUnitId: tenantOne.id,
        code: `LOCAL_${suffix}`,
        name: 'Local material',
        unit: 'M2',
        type: 'TEST',
      },
    });

    assert.deepEqual((await prisma.stockItem.findMany()).map((item) => item.id), [local.id]);

    await assert.rejects(
      prisma.stockItem.create({
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
      prisma.stockItem.createMany({
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
      () => prisma.stockItem.findUnique({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
      }),
      () => prisma.stockItem.update({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
        data: { name: 'Cross update' },
      }),
      () => prisma.stockItem.delete({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
      }),
      () => prisma.stockItem.upsert({
        where: { factoryUnitId_code: { factoryUnitId: tenantTwo.id, code: foreign.code! } },
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
      prisma.$transaction((tx) => tx.stockItem.update({
        where: { id_factoryUnitId: { id: foreign.id, factoryUnitId: tenantTwo.id } },
        data: { name: 'Cross transaction' },
      })),
      TenantGuardError,
    );

    const localUpsert = await prisma.stockItem.upsert({
      where: { factoryUnitId_code: { factoryUnitId: tenantOne.id, code: local.code! } },
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

  const unchangedForeign = await prismaForInternalUse.stockItem.findUniqueOrThrow({
    where: { id: foreign.id },
  });
  assert.equal(unchangedForeign.name, 'Foreign material');
});
