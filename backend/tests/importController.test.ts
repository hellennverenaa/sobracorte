import assert from 'node:assert/strict';
import test from 'node:test';
import { ImportController } from '../src/controllers/ImportController';

test('rotas de importação funcionam quando Express chama os handlers sem this', async () => {
  const { previewCSV, importCSV } = new ImportController();
  for (const handler of [previewCSV, importCSV]) {
    let status = 0;
    let body: any;
    const response: any = {
      status(code: number) { status = code; return this; },
      json(value: any) { body = value; return this; },
    };
    await handler({} as any, response);
    assert.equal(status, 400);
    assert.match(body.error, /Nenhum arquivo CSV/);
  }
});
