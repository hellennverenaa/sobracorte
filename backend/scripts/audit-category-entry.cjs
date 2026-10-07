// Auditoria somente de leitura; usa DATABASE_URL sem imprimir credenciais.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const migration = fs.readFileSync(path.join(__dirname,
  '../prisma/migrations/20261007120000_category_entry_rules/migration.sql'), 'utf8');
// Reutiliza os SELECTs e a normalização da própria migração, sem executar seu DDL.
const unitExpression = migration.match(/SELECT CASE UPPER\(TRIM\(raw_unit\)\)[\s\S]*?END/)[0];
const normalize = sql => sql.replace(/pg_temp\.category_unit\((\w+\.\w+|\w+\."\w+")\)/g,
  (_, column) => `(${unitExpression.replace(/^SELECT /, '').replaceAll('raw_unit', column)})`);
const assignments = migration.match(/CREATE TEMP TABLE category_assignments ON COMMIT DROP AS\n([\s\S]*?);/)[1];
const observed = normalize(migration.match(/CREATE TEMP TABLE observed_category_rules ON COMMIT DROP AS\n([\s\S]*?);/)[1]
  .replace('sobra_corte."StockItem" s', 'effective_stock s'));
const ctes = `WITH category_assignments AS (${assignments}), effective_stock AS (
  SELECT s.*, COALESCE(s."categoryId", a.category_id) AS effective_category_id
  FROM sobra_corte."StockItem" s LEFT JOIN category_assignments a ON a.stock_id = s.id AND a.matches = 1
), observed AS (${observed.replace('s."categoryId" = c.id', 's.effective_category_id = c.id')})`;

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('schema');
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const query = async sql => (await db.query(sql)).rows;
    const missingColumns = await query(`SELECT required.table_name, required.column_name
      FROM (VALUES ('CategoryConfig', 'sectors'), ('CategoryConfig', 'componentType'),
        ('StockItem', 'categoryId')) AS required(table_name, column_name)
      WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns actual
        WHERE actual.table_schema = 'sobra_corte' AND actual.table_name = required.table_name
          AND actual.column_name = required.column_name)`);
    if (missingColumns.length) {
      await db.query('ROLLBACK');
      console.log(JSON.stringify({ blocked: 1, schemaReady: false, missingColumns,
        guidance: 'O esquema é anterior aos pré-requisitos desta auditoria. Ensaie as migrations anteriores em um clone antes de auditar as regras de categoria.' }, null, 2));
      process.exitCode = 2;
      return;
    }
    const missingCategories = await query(`${ctes}
      SELECT s.id, s."factoryUnitId", s.sector, s.type, a.matches
      FROM category_assignments a JOIN sobra_corte."StockItem" s ON s.id = a.stock_id
      WHERE a.matches <> 1 ORDER BY s.id`);
    const proposedAssignments = await query(`${ctes}
      SELECT s.id, s."factoryUnitId", s.sector, s.type, a.category_id AS "proposedCategoryId"
      FROM category_assignments a JOIN sobra_corte."StockItem" s ON s.id = a.stock_id
      WHERE a.matches = 1 ORDER BY s.id`);
    const categories = await query(`${ctes}
      SELECT c.id, c."factoryUnitId", c.name, c.sector, c.sectors, c."componentType",
        c."defaultUnitCode" AS current_unit, ${normalize('pg_temp.category_unit(c."defaultUnitCode")')} AS normalized_unit,
        r.* FROM observed r JOIN sobra_corte."CategoryConfig" c ON c.id = r.id ORDER BY c.id`);
    const configurations = categories.map(c => {
      const unit = c.stock_unit || c.normalized_unit ||
        (c.sector === 'CORTE' || c.sectors?.length === 1 && c.sectors[0] === 'CORTE' ? 'M²' : 'UN');
      const mode = Number(c.items) > 0 ? (c.has_sides ? 'SIDE_PAIR' : 'QUANTITY') :
        (['CABEDAL', 'SOLADO', 'PE_PRONTO'].includes(c.componentType) || c.componentType == null &&
          [c.sector, ...c.sectors].some(s => ['PRE_FABRICADO', 'DISTRIBUICAO', 'EXPEDICAO', 'MONTAGEM'].includes(s))
          ? 'SIDE_PAIR' : 'QUANTITY');
      const reasons = [];
      if (Number(c.units) > 1) reasons.push('unidades diferentes');
      if (c.invalid_unit) reasons.push('unidade de estoque inválida');
      if (c.has_sides && c.has_unsided) reasons.push('itens com e sem lado');
      if (c.has_sides && c.stock_unit !== 'UN') reasons.push('lado exige UN');
      if (c.stored_pair) reasons.push('PAR persistido em um registro');
      if (!['UN', 'PAR', 'CX', 'ROLO', 'M', 'M²', 'CM', 'L', 'G', 'KG'].includes(unit)) reasons.push('unidade configurada inválida');
      if (mode === 'SIDE_PAIR' && unit !== 'UN') reasons.push('modo por lado exige UN');
      return { id: c.id, factoryUnitId: c.factoryUnitId, name: c.name,
        items: Number(c.items), currentUnit: c.current_unit, proposedUnit: unit, proposedMode: mode, reasons };
    });
    const invalidQuantities = await query(`SELECT id, "factoryUnitId", unit, quantity, "minStock"
      FROM sobra_corte."StockItem" WHERE unit IN ('UN','PAR','CX','ROLO')
      AND (quantity <> trunc(quantity) OR "minStock" <> trunc("minStock")) ORDER BY id`);
    const invalidLinks = await query(`SELECT s.id, s."factoryUnitId", s."categoryId"
      FROM sobra_corte."StockItem" s LEFT JOIN sobra_corte."CategoryConfig" c ON c.id = s."categoryId"
      WHERE s."categoryId" IS NOT NULL AND (c.id IS NULL OR c."factoryUnitId" <> s."factoryUnitId") ORDER BY s.id`);
    const duplicateCodes = await query(`SELECT "factoryUnitId", code, "footSide", array_agg(id ORDER BY id) AS ids
      FROM sobra_corte."StockItem" WHERE code IS NOT NULL
      GROUP BY "factoryUnitId", code, "footSide" HAVING count(*) > 1`);
    const failedMigrations = await query(`SELECT migration_name, started_at FROM sobra_corte._prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
    const balances = await query(`SELECT "factoryUnitId", sector, unit, count(*) AS items, sum(quantity) AS quantity
      FROM sobra_corte."StockItem" GROUP BY "factoryUnitId", sector, unit ORDER BY "factoryUnitId", sector, unit`);
    const history = await query(`SELECT (SELECT count(*) FROM sobra_corte."StockMovement") AS movements,
      (SELECT count(*) FROM sobra_corte."MaterialRequisition") AS requisitions`);
    await db.query('ROLLBACK');
    const blocked = missingCategories.length + configurations.filter(c => c.reasons.length).length +
      invalidQuantities.length + invalidLinks.length + duplicateCodes.length + failedMigrations.length;
    console.log(JSON.stringify({ blocked, missingCategories, proposedAssignments, invalidQuantities, invalidLinks,
      duplicateCodes, failedMigrations, configurations, balances, history }, null, 2));
    if (blocked) process.exitCode = 2;
  } finally {
    await db.end();
  }
}
main().catch(error => {
  // Não imprimir a conexão nem objetos de erro que possam conter credenciais.
  console.error(`Auditoria não concluída (${error.code || error.name}). Confira conexão, permissões e versão do banco.`);
  process.exitCode = 1;
});
