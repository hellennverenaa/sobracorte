import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseCsvRFC4180 } from '../src/import/csvParser';
import { validateImportBatch, planImport, importStockData, AvailableLocation } from '../src/import/materialImport';

test('importação de CSV para Distribuição suporta combinação, pés órfãos e multi-endereçamento sem erros', async () => {
  const filePath = path.resolve(__dirname, '../../TESTE_DISTRIBUIÇÃO - modelo_importacao_distribuicao.csv');
  assert.ok(fs.existsSync(filePath), 'Arquivo de teste deve existir');

  const fileBuffer = fs.readFileSync(filePath);
  const parsed = parseCsvRFC4180(fileBuffer);

  // Extrai prateleiras para simular o banco de dados onde as localizações já foram cadastradas
  const locIdx = parsed.headers.findIndex(h => /prateleira|localizacao|box|estante|endereco/i.test(h));
  const rawShelves = [...new Set(parsed.rows.map(r => r.cells[locIdx]?.trim()))].filter(Boolean);
  const availableLocations: AvailableLocation[] = rawShelves.map((name, idx) => ({
    id: idx + 1,
    name,
    sector: 'DISTRIBUICAO',
  }));

  const validatedItems = validateImportBatch(parsed.headers, parsed.rows, 'DISTRIBUICAO', availableLocations);
  assert.ok(validatedItems.length > 0, 'Deve conter itens validados');

  // Total de pés somados deve ser exatamente 582
  const totalFeet = validatedItems.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(totalFeet, 582, `Total de pés esperado 582, obtido: ${totalFeet}`);

  // Mock do Prisma para planImport
  const mockPrisma = {
    stockItem: {
      findMany: async () => [],
    },
  };

  const plan = await planImport(mockPrisma, validatedItems, 1);
  assert.equal(plan.errors.length, 0, `Planejamento não deve ter erros de duplicação. Encontrados: ${JSON.stringify(plan.errors.slice(0, 10))}`);
  assert.equal(plan.toInsert.length, validatedItems.length);

  // Verificar item específico: OG/RS00 PRETO 7,5 (linhas 4 e 5 originais tinham PAR: 2 e D: 1)
  const preto75E = validatedItems.find(i => i.code === 'OG/RS00' && i.color === 'PRETO' && i.sizeGrade === '7,5' && i.footSide === 'E');
  const preto75D = validatedItems.find(i => i.code === 'OG/RS00' && i.color === 'PRETO' && i.sizeGrade === '7,5' && i.footSide === 'D');

  assert.ok(preto75E, 'Deve existir pé esquerdo para OG/RS00 PRETO 7,5');
  assert.ok(preto75D, 'Deve existir pé direito para OG/RS00 PRETO 7,5');
  assert.equal(preto75E.quantity, 2, 'Pé esquerdo deve ter 2 unidades (dos 2 pares)');
  assert.equal(preto75D.quantity, 3, 'Pé direito deve ter 3 unidades (2 dos pares + 1 avulso)');

  // Verificar se o componentType e type estão mapeados para SOLADO e SOLA_PROCESSADA
  const stockDataE = importStockData(preto75E, 1);
  assert.equal(stockDataE.type, 'SOLA_PROCESSADA');
  assert.equal(stockDataE.componentType, 'SOLADO');
  assert.equal((stockDataE as any).footSide, 'E');

  const stockDataD = importStockData(preto75D, 1);
  assert.equal((stockDataD as any).footSide, 'D');

  // Verificar item multi-endereço: IP024 BRANCO/GELO 10 (linhas 92 e 93: 6 PAR no Nível 2 e 6 PAR no Nível 3)
  const gelo10E = validatedItems.find(i => i.code === 'IP024' && i.color === 'BRANCO/GELO' && i.sizeGrade === '10' && i.footSide === 'E');
  assert.ok(gelo10E, 'Deve existir pé esquerdo para IP024 BRANCO/GELO 10');
  assert.equal(gelo10E.quantity, 12, 'Total deve ser 12 (6 + 6)');
  assert.ok(gelo10E.locations && gelo10E.locations.length === 2, 'Deve registrar 2 localizações distintas');
  assert.equal(gelo10E.locations[0].quantity, 6);
  assert.equal(gelo10E.locations[1].quantity, 6);
});

test('importação de CSV ignora itens que já existem com mesma identidade de estoque', async () => {
  const filePath = path.resolve(__dirname, '../../TESTE_DISTRIBUIÇÃO - modelo_importacao_distribuicao.csv');
  const fileBuffer = fs.readFileSync(filePath);
  const parsed = parseCsvRFC4180(fileBuffer);

  const locIdx = parsed.headers.findIndex(h => /prateleira|localizacao|box|estante|endereco/i.test(h));
  const rawShelves = [...new Set(parsed.rows.map(r => r.cells[locIdx]?.trim()))].filter(Boolean);
  const availableLocations: AvailableLocation[] = rawShelves.map((name, idx) => ({
    id: idx + 1,
    name,
    sector: 'DISTRIBUICAO',
  }));

  const validatedItems = validateImportBatch(parsed.headers, parsed.rows, 'DISTRIBUICAO', availableLocations);

  // Simula que os primeiros 5 itens já existem no banco
  const existingItemsMock = validatedItems.slice(0, 5).map(item => importStockData(item, 1));
  const mockPrisma = {
    stockItem: {
      findMany: async () => existingItemsMock,
    },
  };

  const plan = await planImport(mockPrisma, validatedItems, 1);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.ignored, 5);
  assert.equal(plan.toInsert.length, validatedItems.length - 5);
});
