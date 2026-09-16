DO $$
DECLARE
  unit_a integer;
  unit_b integer;
  loc_a integer;
  loc_b integer;
  mat_a integer;
  mat_b integer;
BEGIN
  INSERT INTO sobra_corte."FactoryUnit" (code, name, active, "enableRequisitions")
  VALUES ('C3A', 'Fixture Ciclo 3 A', true, true), ('C3B', 'Fixture Ciclo 3 B', true, true)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
  SELECT id INTO unit_a FROM sobra_corte."FactoryUnit" WHERE code = 'C3A';
  SELECT id INTO unit_b FROM sobra_corte."FactoryUnit" WHERE code = 'C3B';

  INSERT INTO sobra_corte."Location" (name, sector, "factoryUnitId") VALUES ('A-CORTE', 'CORTE', unit_a)
  ON CONFLICT ("factoryUnitId", name) DO NOTHING;
  INSERT INTO sobra_corte."Location" (name, sector, "factoryUnitId") VALUES ('B-EXPEDICAO', 'EXPEDICAO', unit_b)
  ON CONFLICT ("factoryUnitId", name) DO NOTHING;
  SELECT id INTO loc_a FROM sobra_corte."Location" WHERE "factoryUnitId" = unit_a AND name = 'A-CORTE';
  SELECT id INTO loc_b FROM sobra_corte."Location" WHERE "factoryUnitId" = unit_b AND name = 'B-EXPEDICAO';

  INSERT INTO sobra_corte."Material" (code, name, quantity, unit, type, observation, "minStock", "factoryUnitId", "updatedAt")
  VALUES ('C3-MAT-A', 'Material A', 12.5, 'M²', 'COURO', 'fixture', 2, unit_a, now())
  ON CONFLICT ("factoryUnitId", code) DO UPDATE SET quantity = EXCLUDED.quantity;
  INSERT INTO sobra_corte."Material" (code, name, quantity, unit, type, observation, "minStock", "factoryUnitId", "updatedAt")
  VALUES ('C3-MAT-B', 'Material B', 7, 'KG', 'TECIDO', 'fixture', 1, unit_b, now())
  ON CONFLICT ("factoryUnitId", code) DO UPDATE SET quantity = EXCLUDED.quantity;
  SELECT id INTO mat_a FROM sobra_corte."Material" WHERE "factoryUnitId" = unit_a AND code = 'C3-MAT-A';
  SELECT id INTO mat_b FROM sobra_corte."Material" WHERE "factoryUnitId" = unit_b AND code = 'C3-MAT-B';

  INSERT INTO sobra_corte."MaterialLocation" ("materialId", "locationId", "factoryUnitId", quantity)
  VALUES (mat_a, loc_a, unit_a, 12.5), (mat_b, loc_b, unit_b, 7)
  ON CONFLICT ("materialId", "locationId") DO UPDATE SET quantity = EXCLUDED.quantity;

  IF NOT EXISTS (SELECT 1 FROM sobra_corte."Movement" WHERE "factoryUnitId" = unit_a AND reason = 'fixture-c3-related') THEN
    INSERT INTO sobra_corte."Movement" (type, quantity, "materialId", "factoryUnitId", "materialCode", "materialName", "materialCategory", "materialUnit", "locationName", reason)
    VALUES ('entrada', 12.5, mat_a, unit_a, 'C3-MAT-A', 'Material A', 'COURO', 'M²', 'A-CORTE', 'fixture-c3-related');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sobra_corte."Movement" WHERE "factoryUnitId" = unit_b AND reason = 'fixture-c3-snapshot') THEN
    INSERT INTO sobra_corte."Movement" (type, quantity, "materialId", "factoryUnitId", "materialCode", "materialName", "materialCategory", "materialUnit", "locationName", reason)
    VALUES ('saida', 2, NULL, unit_b, 'REMOVIDO', 'Snapshot removido', 'TECIDO', 'KG', 'B-EXPEDICAO', 'fixture-c3-snapshot');
  END IF;
END $$;
