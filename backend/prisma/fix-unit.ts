import { prisma } from '../src/prisma'

async function main() {
  console.log('1/4 Criando tabela FactoryUnit no PostgreSQL...')
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "sobra_corte"."FactoryUnit" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true
    );
  `)

  console.log('2/4 Cadastrando fábrica Santo Estêvão...')
  await prisma.$executeRawUnsafe(`
    INSERT INTO "sobra_corte"."FactoryUnit" ("name", "code", "active")
    SELECT 'Santo Estêvão', 'SEST', true
    WHERE NOT EXISTS (
      SELECT 1 FROM "sobra_corte"."FactoryUnit" WHERE "name" ILIKE '%Santo Estêvão%'
    );
  `)

  console.log('3/4 Vinculando registros à fábrica de Santo Estêvão...')
  const tables = [
    'User',
    'CategoryConfig',
    'UnitConfig',
    'Location',
    'Material',
    'MaterialLocation',
    'Movement',
    'OriginConfig'
  ]

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "sobra_corte"."${table}" ADD COLUMN IF NOT EXISTS "factoryUnitId" INTEGER;
    `)
    await prisma.$executeRawUnsafe(`
      UPDATE "sobra_corte"."${table}" 
      SET "factoryUnitId" = (SELECT "id" FROM "sobra_corte"."FactoryUnit" WHERE "name" ILIKE '%Santo Estêvão%' LIMIT 1)
      WHERE "factoryUnitId" IS NULL;
    `)
  }

  console.log('4/4 Removendo constraints antigas de unicidade simples...')
  const oldConstraints = [
    { table: 'CategoryConfig', name: 'CategoryConfig_name_key' },
    { table: 'Location', name: 'Location_name_key' },
    { table: 'Material', name: 'Material_code_key' },
    { table: 'OriginConfig', name: 'OriginConfig_name_key' },
    { table: 'UnitConfig', name: 'UnitConfig_symbol_key' },
    { table: 'User', name: 'User_usuario_key' },
    { table: 'User', name: 'User_email_key' },
    { table: 'User', name: 'User_matriculaDass_key' }
  ]

  for (const c of oldConstraints) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "sobra_corte"."${c.table}" DROP CONSTRAINT IF EXISTS "${c.name}";`
      )
    } catch (e) {
      // Ignora caso a constraint já não exista
    }
  }

  console.log('✅ Preparação do banco concluída com sucesso!')
}

main()
  .catch((err) => console.error('Erro no script:', err))
  .finally(() => prisma.$disconnect())