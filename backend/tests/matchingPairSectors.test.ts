import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { MountingPairService } from '../src/services/MountingPairService';
import { MountingPairController } from '../src/controllers/MountingPairController';

test('setores elegíveis respeitam configuração, unidade, escopo e acesso', async t => {
  const original = prisma.categoryConfig.findMany;
  let categories: any[] = [{ sector: 'CORTE', sectors: ['CORTE'] }, { sector: 'EXPEDICAO', sectors: [] }];
  (prisma.categoryConfig as any).findMany = async ({ where }: any) => {
    assert.deepEqual(where, { factoryUnitId: 7, entryMode: 'SIDE_PAIR', defaultUnitCode: 'UN' });
    return categories;
  };
  t.after(() => { prisma.categoryConfig.findMany = original; });
  const service = new MountingPairService();
  assert.deepEqual(await service.availableSectors(7, { factoryUnitId: 7, role: 'admin' }), ['CORTE', 'DISTRIBUICAO']);
  assert.deepEqual(await service.availableSectors(7, { factoryUnitId: 7, role: 'admin_setor', assignedSector: 'APOIO' }), []);
  assert.deepEqual(await service.availableSectors(7, { factoryUnitId: 7, role: 'lider', assignedSector: 'CORTE' }), ['CORTE']);
  assert.deepEqual(await service.availableSectors(7, { factoryUnitId: 7, role: 'leitor' }), ['CORTE', 'DISTRIBUICAO']);
  categories = [{ sector: null, sectors: [] }];
  assert.equal((await service.availableSectors(7, { factoryUnitId: 7, role: 'admin' })).length, 5);
  categories = [];
  assert.deepEqual(await service.availableSectors(7, { factoryUnitId: 7, role: 'admin' }), []);
});

test('listagem escolhe setor elegível e não consulta pares sem configuração', async t => {
  const originalAvailable = MountingPairService.prototype.availableSectors;
  const originalFind = MountingPairService.prototype.findMatchingPairs;
  let available: any[] = ['CORTE'];
  const requested: any[] = [];
  MountingPairService.prototype.availableSectors = async () => available;
  MountingPairService.prototype.findMatchingPairs = async (_unit, sector) => { requested.push(sector); return []; };
  t.after(() => {
    MountingPairService.prototype.availableSectors = originalAvailable;
    MountingPairService.prototype.findMatchingPairs = originalFind;
  });
  let body: any;
  const res: any = { json: (value: any) => { body = value; }, status: () => res };
  const req: any = { tenant: { id: 7 }, user: { role: 'admin' }, query: {} };
  const controller = new MountingPairController();
  await controller.getMatchingPairs(req, res);
  assert.equal(body.sector, 'CORTE');
  assert.deepEqual(body.availableSectors, ['CORTE']);
  available = [];
  await controller.getMatchingPairs(req, res);
  assert.equal(body.sector, null);
  assert.deepEqual(body.pairs, []);
  assert.deepEqual(requested, ['CORTE']);
});
