// Preparação anterior às migrations de outubro. Simulação somente de leitura por padrão.
const path = require('node:path');
const fs = require('node:fs');
const { Client } = require('pg');

const units = new Set(['UN', 'PAR', 'CX', 'ROLO', 'M', 'M²', 'CM', 'L', 'G', 'KG']);
const aliases = { UND: 'UN', PC: 'UN', UNIDADE: 'UN', M2: 'M²', MT2: 'M²', 'M^2': 'M²', MT: 'M', KGS: 'KG', GR: 'G', PR: 'PAR', PARES: 'PAR' };
const normalized = value => String(value ?? '').trim().toUpperCase();
const unitOf = value => aliases[normalized(value)] || normalized(value);
const integerQuantity = value => /^-?\d+(?:\.0+)?$/.test(String(value));
const serves = (category, sector) => category.sector == null || category.sector === sector ||
  ['DISTRIBUICAO', 'EXPEDICAO'].includes(category.sector) && ['DISTRIBUICAO', 'EXPEDICAO'].includes(sector);
const legacyName = item => item.sector === 'APOIO' && item.componentType === 'PECA_CORTADA' ? 'MOLDE / PEÇA'
  : item.sector === 'MONTAGEM' && item.componentType === 'PE_PRONTO' ? 'PE PRONTO' : null;

function planPreparation(items, categories) {
  const blockers = [];
  const additions = [];
  const changes = [];
  const assignments = new Map();
  const all = categories.map(c => ({ ...c }));
  const ordered = [...items].sort((a, b) => a.factoryUnitId - b.factoryUnitId || a.sector.localeCompare(b.sector) || normalized(a.type).localeCompare(normalized(b.type)) || a.id - b.id);
  for (const item of ordered) {
    const base = normalized(item.type) || legacyName(item);
    const unit = unitOf(item.unit);
    if (!base || !units.has(unit) || item.footSide === 'PAR' ||
        item.footSide != null && (!['E', 'D'].includes(item.footSide) || unit !== 'UN') ||
        ['UN', 'PAR', 'CX', 'ROLO'].includes(unit) &&
          (!integerQuantity(item.quantity) || !integerQuantity(item.minStock))) {
      blockers.push({ itemId: item.id, reason: 'Classificação, medida, lado ou quantidade requer decisão operacional.' });
      continue;
    }
    let matches = all.filter(c => c.factoryUnitId === item.factoryUnitId && normalized(c.name) === base && serves(c, item.sector));
    if (matches.length > 1) {
      blockers.push({ itemId: item.id, reason: 'Mais de uma categoria correspondente.', categories: matches.map(c => c.id ?? c.name) });
      continue;
    }
    if (!matches.length) {
      const collision = all.some(c => c.factoryUnitId === item.factoryUnitId && normalized(c.name) === base);
      const name = collision ? `${base} (${item.sector})` : base;
      matches = all.filter(c => c.factoryUnitId === item.factoryUnitId && normalized(c.name) === name);
      if (matches.length && (matches.length > 1 || !serves(matches[0], item.sector))) {
        blockers.push({ itemId: item.id, reason: 'Nome da categoria com setor já ocupado.' });
        continue;
      }
      if (!matches.length) {
        const category = { factoryUnitId: item.factoryUnitId, name, sector: item.sector, defaultUnitCode: unit, unitLocked: true };
        additions.push(category);
        all.push(category);
        matches = [category];
      }
    }
    const category = matches[0];
    // Só preenche tipo ausente ou distingue nome que colide em outro setor.
    if (!normalized(item.type) || normalized(item.type) !== normalized(category.name)) {
      changes.push({ itemId: item.id, before: item.type, after: category.name });
    }
    const observed = assignments.get(category) || [];
    observed.push(item);
    assignments.set(category, observed);
  }
  for (const [category, stock] of assignments) {
    const measures = new Set(stock.map(item => unitOf(item.unit)));
    const modes = new Set(stock.map(item => item.footSide == null ? 'QUANTITY' : 'SIDE_PAIR'));
    if (measures.size > 1 || modes.size > 1) {
      blockers.push({ category: category.name, factoryUnitId: category.factoryUnitId,
        reason: 'Categoria mistura medidas ou modos; nenhuma separação automática.', itemIds: stock.map(item => item.id) });
    }
  }
  return { blockers, additions, changes };
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const databaseArg = args.find(arg => arg.startsWith('--database='));
  const confirmation = args.find(arg => arg.startsWith('--confirm-database='));
  if (args.some(arg => arg !== '--apply' && !arg.startsWith('--database=') && !arg.startsWith('--confirm-database='))) throw new Error('Argumento desconhecido.');
  const url = new URL(process.env.DATABASE_URL);
  if (databaseArg) url.pathname = `/${databaseArg.slice('--database='.length)}`;
  url.searchParams.delete('schema');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (apply && confirmation !== `--confirm-database=${database}`) throw new Error('Aplicação exige --confirm-database com o banco de destino.');
  const migrations = path.join(__dirname, '../prisma/migrations');
  for (const entry of fs.readdirSync(migrations, { withFileTypes: true })) {
    if (entry.isDirectory() && !fs.existsSync(path.join(migrations, entry.name, 'migration.sql'))) {
      console.error(`Migration sem arquivo SQL: ${entry.name}`);
      throw new Error('Histórico local incompleto.');
    }
  }
  const db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    await db.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query("SET LOCAL statement_timeout = '60s'");
    if (apply) await db.query('LOCK TABLE sobra_corte."StockItem", sobra_corte."CategoryConfig" IN SHARE ROW EXCLUSIVE MODE');
    const modern = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='sobra_corte'
      AND ((table_name='StockItem' AND column_name='categoryId') OR (table_name='CategoryConfig' AND column_name='sectors'))`);
    if (modern.rowCount) throw new Error('Preparação exige o esquema 2.0 anterior às migrations de outubro.');
    const failed = await db.query('SELECT migration_name FROM sobra_corte._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');
    if (failed.rowCount) throw new Error('Existe migration falha não resolvida.');
    const items = (await db.query('SELECT * FROM sobra_corte."StockItem" ORDER BY id')).rows;
    const categories = (await db.query('SELECT * FROM sobra_corte."CategoryConfig" ORDER BY id')).rows;
    const plan = planPreparation(items, categories);
    if (plan.blockers.length) {
      await db.query('ROLLBACK');
      console.log(JSON.stringify({ database, mode: 'blocked', ...plan }, null, 2));
      process.exitCode = 2;
      return;
    }
    if (apply) {
      await db.query('CREATE TEMP TABLE original_stock ON COMMIT DROP AS SELECT id, to_jsonb(s) AS data FROM sobra_corte."StockItem" s');
      for (const category of plan.additions) {
        await db.query(`INSERT INTO sobra_corte."CategoryConfig" ("factoryUnitId",name,sector,"defaultUnitCode","unitLocked") VALUES ($1,$2,$3,$4,$5)`,
          [category.factoryUnitId, category.name, category.sector, category.defaultUnitCode, category.unitLocked]);
      }
      for (const change of plan.changes) {
        const result = await db.query('UPDATE sobra_corte."StockItem" SET type=$1 WHERE id=$2 AND type IS NOT DISTINCT FROM $3', [change.after, change.itemId, change.before]);
        if (result.rowCount !== 1) throw new Error('Registro mudou durante a preparação.');
      }
      const changed = await db.query(`SELECT id FROM (
        (SELECT id, data - 'type' AS data FROM original_stock EXCEPT SELECT id, to_jsonb(s) - 'type' FROM sobra_corte."StockItem" s)
        UNION ALL
        (SELECT id, to_jsonb(s) - 'type' FROM sobra_corte."StockItem" s EXCEPT SELECT id, data - 'type' FROM original_stock)
      ) differences`);
      if (changed.rowCount) throw new Error('Preparação alterou campos além da classificação.');
      await db.query('COMMIT');
    } else await db.query('ROLLBACK');
    console.log(JSON.stringify({ database, mode: apply ? 'applied' : 'simulation', ...plan }, null, 2));
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { await db.end(); }
}

module.exports = { planPreparation };
if (require.main === module) main().catch(error => {
  // Não imprimir objetos de conexão, valores de registros ou mensagens SQL.
  console.error(`Preparação interrompida (${error.code || error.name}). Verifique pré-requisitos, bloqueios e configuração do destino.`);
  process.exitCode = 1;
});
