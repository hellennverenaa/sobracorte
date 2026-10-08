import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/prisma';
import { ImportController } from '../src/controllers/ImportController';
import { parseCsvRFC4180 } from '../src/import/csvParser';
import { validateImportBatch, importStockData } from '../src/import/materialImport';

function replace(t: any, model: any, method: string, value: any) {
  const previous = model[method]; model[method] = value;
  t.after(() => { model[method] = previous; });
}
function capture() {
  let status = 200, body: any;
  return { get status() { return status; }, get body() { return body; }, res: {
    status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; },
  } as any };
}

test('prévia mostra saldo ignorado, mapeamento é validado e plano alterado exige nova confirmação', async t => {
  const locations: any[] = [{ id: 10, name: 'PRATELEIRA', sector: 'CORTE', categoryMode: 'ALL' }];
  const categories: any[] = [{ id: 20, name: 'TECIDO', sector: 'CORTE', defaultUnitCode: 'M²', entryMode: 'QUANTITY' }];
  const valid = 'codigo;descricao;tipo;quantidade;prateleira\nQA-REV;TECIDO AZUL;TECIDO;0.3;PRATELEIRA';
  const parsed = parseCsvRFC4180(valid);
  const item = validateImportBatch(parsed.headers, parsed.rows, 'CORTE', locations, categories)[0];
  let quantity = 2;
  replace(t, prisma.location, 'findMany', async () => locations);
  replace(t, prisma.categoryConfig, 'findMany', async () => categories);
  replace(t, prisma.subsectorConfig, 'findMany', async () => []);
  replace(t, prisma.stockItem, 'findMany', async () => [{ id: 30, ...importStockData(item, 1), quantity,
    locations: [{ locationId: 10, quantity, location: { name: 'PRATELEIRA' } }],
  }]);
  const controller = new ImportController();
  const req: any = { tenant: { id: 1 }, user: { role: 'admin' }, body: { sector: 'CORTE' }, file: { originalname: 'qa.csv', buffer: Buffer.from(valid) } };
  const preview = capture(); await controller.previewCSV(req, preview.res);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.itensIgnorados[0].existingQuantity, 2);
  assert.equal(preview.body.itensIgnorados[0].quantity, 0.3);
  quantity = 3;
  const confirmation = capture();
  await controller.importCSV({ ...req, body: { ...req.body, planoHash: preview.body.planoHash } }, confirmation.res);
  assert.equal(confirmation.status, 409);
  assert.match(confirmation.body.error, /mudaram/);
  const mapped = capture();
  await controller.previewCSV({ ...req, file: { originalname: 'qa.csv', buffer: Buffer.from(valid.replace(';PRATELEIRA', ';NOME ANTIGO')) }, body: {
    sector: 'CORTE', localizationMappings: JSON.stringify([{ row: 2, locationId: 10 }]),
  } }, mapped.res);
  assert.equal(mapped.status, 200);
  assert.equal(mapped.body.itens[0].localizacoes[0].nome, 'PRATELEIRA');
  locations.push({ id: 99, name: 'PRATELEIRA', sector: 'APOIO', categoryMode: 'ALL' });
  const otherSector = capture();
  await controller.previewCSV({ ...req, body: { sector: 'CORTE', localizationMappings: JSON.stringify([{ row: 2, locationId: 99 }]) } }, otherSector.res);
  assert.equal(otherSector.status, 422, 'nome igual em outro setor não deve trocar o ID escolhido silenciosamente');
  const unavailable = capture();
  await controller.previewCSV({ ...req, body: { sector: 'CORTE', localizationMappings: JSON.stringify([{ row: 2, locationId: 999 }]) } }, unavailable.res);
  assert.equal(unavailable.status, 400);
});
